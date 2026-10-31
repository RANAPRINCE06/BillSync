import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.customer import Customer
from app.models.enums import UserRole
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.quotation import Quotation
from app.models.subscription import Subscription
from app.models.user import User


@pytest.fixture(scope="module")
def auth_tokens(client: TestClient):
    """Logs into all three demo accounts and caches tokens for preflight checks."""
    accounts = [
        {"email": "admin@billsync.com", "pass": "Admin@12345", "role": "ADMIN"},
        {"email": "staff@billsync.com", "pass": "Staff@12345", "role": "STAFF"},
        {"email": "customer@billsync.com", "pass": "Customer@12345", "role": "CUSTOMER"},
    ]
    tokens = {}
    for acc in accounts:
        resp = client.post("/api/v1/auth/login", json={"email": acc["email"], "password": acc["pass"]})
        assert resp.status_code == 200, f"Login failed for {acc['email']}: {resp.text}"
        data = resp.json()["data"]
        assert data["user"]["role"] == acc["role"]
        tokens[acc["role"]] = data["access_token"]
    return tokens


def test_preflight_login_and_roles(client: TestClient):
    """Verify that login works for all demo accounts and enforces valid passwords."""
    for email, pwd, expected_role in [
        ("admin@billsync.com", "Admin@12345", "ADMIN"),
        ("staff@billsync.com", "Staff@12345", "STAFF"),
        ("customer@billsync.com", "Customer@12345", "CUSTOMER"),
    ]:
        # Valid login
        resp = client.post("/api/v1/auth/login", json={"email": email, "password": pwd})
        assert resp.status_code == 200
        body = resp.json()
        assert body["success"] is True
        assert body["data"]["user"]["email"] == email
        assert body["data"]["user"]["role"] == expected_role

        # Also check /api/auth/login path
        resp_alt = client.post("/api/auth/login", json={"email": email, "password": pwd})
        assert resp_alt.status_code == 200

        # Invalid password rejected with 401
        bad_resp = client.post("/api/v1/auth/login", json={"email": email, "password": "WrongPassword!999"})
        assert bad_resp.status_code == 401


def test_preflight_auth_me_endpoint(client: TestClient, auth_tokens):
    """Verify that /api/v1/auth/me returns the correct authenticated identity for each demo role."""
    for role, email in [
        ("ADMIN", "admin@billsync.com"),
        ("STAFF", "staff@billsync.com"),
        ("CUSTOMER", "customer@billsync.com"),
    ]:
        headers = {"Authorization": f"Bearer {auth_tokens[role]}"}
        resp = client.get("/api/v1/auth/me", headers=headers)
        assert resp.status_code == 200
        data = resp.json()["data"]
        assert data["email"] == email
        assert data["role"] == role
        assert data["is_active"] is True

        # Also check /api/auth/me path
        resp_alt = client.get("/api/auth/me", headers=headers)
        assert resp_alt.status_code == 200


def test_preflight_role_restrictions(client: TestClient, auth_tokens):
    """
    Verify that role-based restrictions are strictly enforced:
    - Admin has access to admin-only user management (/api/v1/users).
    - Staff is forbidden from admin-only routes (403 Forbidden).
    - Customer is forbidden from staff/admin routes (403 Forbidden).
    """
    admin_headers = {"Authorization": f"Bearer {auth_tokens['ADMIN']}"}
    staff_headers = {"Authorization": f"Bearer {auth_tokens['STAFF']}"}
    customer_headers = {"Authorization": f"Bearer {auth_tokens['CUSTOMER']}"}

    # 1. Admin-only endpoint: GET /api/v1/users
    resp_admin = client.get("/api/v1/users", headers=admin_headers)
    assert resp_admin.status_code == 200, f"Admin user listing failed: {resp_admin.text}"

    resp_staff = client.get("/api/v1/users", headers=staff_headers)
    assert resp_staff.status_code == 403, "Staff should be forbidden from /api/v1/users"

    resp_cust = client.get("/api/v1/users", headers=customer_headers)
    assert resp_cust.status_code == 403, "Customer should be forbidden from /api/v1/users"

    # 2. Staff/Admin only: POST /api/v1/quotations (Staff/Admin allowed to draft, Customer forbidden)
    sample_quo_payload = {
        "customer_id": str(uuid.uuid4()),
        "quotation_template": "STANDARD",
        "items": []
    }
    resp_cust_quo = client.post("/api/v1/quotations", json=sample_quo_payload, headers=customer_headers)
    assert resp_cust_quo.status_code == 403, "Customer should be forbidden from creating quotations"

    # 3. Staff/Admin allowed on listing quotations
    resp_staff_quo = client.get("/api/v1/quotations", headers=staff_headers)
    assert resp_staff_quo.status_code == 200


def test_preflight_customer_tenant_isolation(client: TestClient, auth_tokens, db_session: Session):
    """
    Verify that customer accounts are strictly isolated to their own tenant records:
    - Customer listing only returns the customer's own profile.
    - Customer cannot inspect other customers' private data.
    """
    cust_user = db_session.scalar(select(User).where(User.email == "customer@billsync.com"))
    assert cust_user is not None
    linked_customer = db_session.scalar(select(Customer).where(Customer.user_id == cust_user.id))
    assert linked_customer is not None

    customer_headers = {"Authorization": f"Bearer {auth_tokens['CUSTOMER']}"}
    resp = client.get("/api/v1/customers", headers=customer_headers)
    assert resp.status_code == 200
    data = resp.json()["data"]

    # Customer should only see their own profile in list
    items = data["items"]
    assert len(items) == 1
    assert items[0]["id"] == str(linked_customer.id)
    assert items[0]["email"] == "customer@billsync.com"

    # Customer listing invoices only returns their own customer's invoices
    inv_resp = client.get("/api/v1/invoices", headers=customer_headers)
    assert inv_resp.status_code == 200
    for inv in inv_resp.json()["items"]:
        assert inv["customer_id"] == str(linked_customer.id)

    # If customer attempts to access an unrelated customer by ID, access must be forbidden
    other_customer = db_session.scalars(
        select(Customer).where(Customer.id != linked_customer.id)
    ).first()
    if other_customer:
        denied_resp = client.get(f"/api/v1/customers/{other_customer.id}", headers=customer_headers)
        assert denied_resp.status_code in (403, 404)


def test_preflight_health_endpoints(client: TestClient):
    """Verify that system and database health endpoints are functional and report healthy."""
    # System root
    root_resp = client.get("/")
    assert root_resp.status_code == 200
    assert root_resp.json()["status"] == "online"

    # System health under /api/health and /api/v1/health
    for path in ["/api/health", "/api/v1/health"]:
        resp = client.get(path)
        assert resp.status_code == 200
        assert resp.json()["status"] == "ok"
        assert resp.json()["environment"] == settings.ENVIRONMENT

    # Database health check
    for path in ["/api/health/database", "/api/v1/health/database"]:
        db_resp = client.get(path)
        assert db_resp.status_code == 200
        db_data = db_resp.json()
        assert db_data["status"] == "connected"
        assert db_data["database"] == "PostgreSQL"
        assert db_data["database_name"] == settings.POSTGRES_DB
        assert isinstance(db_data["latency_ms"], (int, float))
        assert db_data["latency_ms"] >= 0


def test_preflight_invoice_pdf_endpoint(client: TestClient, auth_tokens, db_session: Session):
    """
    Verify that the invoice PDF generation and streaming endpoint works
    without mutating database records.
    """
    invoice = db_session.scalars(select(Invoice).limit(1)).first()
    assert invoice is not None, "At least one invoice should exist in demo database"

    admin_headers = {"Authorization": f"Bearer {auth_tokens['ADMIN']}"}
    resp = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers=admin_headers)
    assert resp.status_code == 200
    assert resp.headers.get("content-type") == "application/pdf"
    assert resp.content.startswith(b"%PDF-")


@pytest.fixture(autouse=True)
def verify_non_mutating_financials(db_session: Session):
    """
    Ensures that preflight assertions and read-only endpoints (e.g. PDF generation,
    auth, role inspections, health checks) do not mutate or delete existing financial data.
    """
    inv_before = db_session.scalar(select(func.count(Invoice.id)))
    sub_before = db_session.scalar(select(func.count(Subscription.id)))
    quo_before = db_session.scalar(select(func.count(Quotation.id)))
    pay_before = db_session.scalar(select(func.count(Payment.id)))

    yield

    inv_after = db_session.scalar(select(func.count(Invoice.id)))
    sub_after = db_session.scalar(select(func.count(Subscription.id)))
    quo_after = db_session.scalar(select(func.count(Quotation.id)))
    pay_after = db_session.scalar(select(func.count(Payment.id)))

    assert inv_before == inv_after, "Preflight tests unexpectedly altered invoice count"
    assert sub_before == sub_after, "Preflight tests unexpectedly altered subscription count"
    assert quo_before == quo_after, "Preflight tests unexpectedly altered quotation count"
    assert pay_before == pay_after, "Preflight tests unexpectedly altered payment count"


def test_preflight_financial_records_present(db_session: Session):
    """Verify that existing financial records in the demo database exist and are non-empty."""
    inv_count = db_session.scalar(select(func.count(Invoice.id)))
    sub_count = db_session.scalar(select(func.count(Subscription.id)))
    quo_count = db_session.scalar(select(func.count(Quotation.id)))
    pay_count = db_session.scalar(select(func.count(Payment.id)))

    assert inv_count > 0, "Demo database should contain preexisting invoices"
    assert sub_count > 0, "Demo database should contain preexisting subscriptions"
    assert quo_count > 0, "Demo database should contain preexisting quotations"
    assert pay_count > 0, "Demo database should contain preexisting payments"
