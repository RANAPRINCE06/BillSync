from datetime import datetime, timezone
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash
from app.models import (
    Customer,
    Invoice,
    Plan,
    Product,
    User,
    BillingInterval,
    InvoiceStatus,
    ProductType,
    UserRole,
)


def _create_user(db_session: Session, role: UserRole, email: str = None) -> tuple[User, str]:
    uid = uuid.uuid4().hex[:6]
    email = email or f"user_{uid}_{role.value.lower()}@example.com"
    user = User(
        name=f"Test {role.value}",
        email=email,
        password_hash=get_password_hash("ValidPass123!"),
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(user.id, extra_claims={"role": role.value, "email": email})
    return user, token


def test_auth_and_user_management(client: TestClient, db_session: Session):
    admin, admin_token = _create_user(db_session, UserRole.ADMIN)
    staff, staff_token = _create_user(db_session, UserRole.STAFF)
    admin_hdr = {"Authorization": f"Bearer {admin_token}"}
    staff_hdr = {"Authorization": f"Bearer {staff_token}"}

    # Forgot password
    forgot_res = client.post("/api/v1/auth/forgot-password", json={"email": "anyone@example.com"})
    assert forgot_res.status_code == 200

    # Logout
    logout_res = client.post("/api/v1/auth/logout", headers=admin_hdr)
    assert logout_res.status_code == 200

    # Duplicate registration -> 409
    dup_reg = client.post("/api/v1/auth/register", json={
        "name": "Admin Dupe",
        "email": admin.email,
        "password": "ValidPass123!"
    })
    assert dup_reg.status_code == 409

    # Login with invalid password -> 401
    bad_login = client.post("/api/v1/auth/login", json={
        "email": admin.email,
        "password": "WrongPassword123!"
    })
    assert bad_login.status_code == 401

    # Staff forbidden from accessing /users
    staff_users = client.get("/api/v1/users", headers=staff_hdr)
    assert staff_users.status_code == 403

    # Admin creates new Staff user via POST /users
    new_staff_email = f"created_staff_{uuid.uuid4().hex[:4]}@example.com"
    create_u_res = client.post("/api/v1/users", json={
        "name": "Created Staff",
        "email": new_staff_email,
        "password": "ValidPass123!",
        "role": "STAFF"
    }, headers=admin_hdr)
    assert create_u_res.status_code == 201
    created_u_id = create_u_res.json()["data"]["id"]

    # Admin lists users
    users_list = client.get("/api/v1/users", headers=admin_hdr)
    assert users_list.status_code == 200
    assert users_list.json()["data"]["total"] >= 1

    # Admin updates user
    upd_u = client.put(f"/api/v1/users/{created_u_id}", json={"name": "Updated Staff Name"}, headers=admin_hdr)
    assert upd_u.status_code == 200
    assert upd_u.json()["data"]["name"] == "Updated Staff Name"

    # Admin deletes user
    del_u = client.delete(f"/api/v1/users/{created_u_id}", headers=admin_hdr)
    assert del_u.status_code == 200


def test_customer_crud_and_subresources(client: TestClient, db_session: Session):
    admin, admin_token = _create_user(db_session, UserRole.ADMIN)
    cust_user, cust_token = _create_user(db_session, UserRole.CUSTOMER)
    admin_hdr = {"Authorization": f"Bearer {admin_token}"}
    cust_hdr = {"Authorization": f"Bearer {cust_token}"}

    # Staff/Admin creates customer
    c_email = f"client_{uuid.uuid4().hex[:6]}@example.com"
    c_res = client.post("/api/v1/customers", json={
        "name": "Global Logistics",
        "email": c_email,
        "phone": "+1234567890",
        "billing_address": "456 Enterprise Blvd"
    }, headers=admin_hdr)
    assert c_res.status_code == 201
    cid = c_res.json()["data"]["id"]

    # Duplicate customer email -> 409
    dup_c = client.post("/api/v1/customers", json={
        "name": "Global Logistics Dupe",
        "email": c_email
    }, headers=admin_hdr)
    assert dup_c.status_code == 409

    # Admin updates customer
    upd_c = client.put(f"/api/v1/customers/{cid}", json={"billing_address": "789 Tech Park"}, headers=admin_hdr)
    assert upd_c.status_code == 200
    assert upd_c.json()["data"]["billing_address"] == "789 Tech Park"

    # Customer sub-resources (invoices, subscriptions, quotations, payments)
    assert client.get(f"/api/v1/customers/{cid}/invoices", headers=admin_hdr).status_code == 200
    assert client.get(f"/api/v1/customers/{cid}/subscriptions", headers=admin_hdr).status_code == 200
    assert client.get(f"/api/v1/customers/{cid}/quotations", headers=admin_hdr).status_code == 200
    assert client.get(f"/api/v1/customers/{cid}/payments", headers=admin_hdr).status_code == 200

    # Unassociated customer cannot view or delete another customer profile
    assert client.get(f"/api/v1/customers/{cid}", headers=cust_hdr).status_code == 403
    assert client.delete(f"/api/v1/customers/{cid}", headers=cust_hdr).status_code == 403

    # Admin deletes customer
    del_c = client.delete(f"/api/v1/customers/{cid}", headers=admin_hdr)
    assert del_c.status_code == 200


def test_products_and_plans_crud(client: TestClient, db_session: Session):
    admin, admin_token = _create_user(db_session, UserRole.ADMIN)
    admin_hdr = {"Authorization": f"Bearer {admin_token}"}

    # Create Product
    p_res = client.post("/api/v1/products", json={
        "name": f"Analytics Engine {uuid.uuid4().hex[:4]}",
        "description": "Realtime telemetry",
        "product_type": "SERVICE",
        "sales_price": "199.00",
        "cost_price": "50.00",
        "is_active": True
    }, headers=admin_hdr)
    assert p_res.status_code == 201
    pid = p_res.json()["data"]["id"]

    # Update Product
    upd_p = client.put(f"/api/v1/products/{pid}", json={"sales_price": "220.00"}, headers=admin_hdr)
    assert upd_p.status_code == 200
    assert Decimal(str(upd_p.json()["data"]["sales_price"])) == Decimal("220.00")

    # Create Plan for Product
    plan_res = client.post("/api/v1/plans", json={
        "product_id": pid,
        "name": "Enterprise Annual",
        "billing_interval": "YEARLY",
        "price": "2200.00",
        "minimum_quantity": 1,
        "allow_pause": True,
        "allow_early_close": False,
        "allow_renewal": True,
        "is_active": True
    }, headers=admin_hdr)
    assert plan_res.status_code == 201
    plan_id = plan_res.json()["data"]["id"]

    # Plan with nonexistent product -> 404
    bad_plan = client.post("/api/v1/plans", json={
        "product_id": str(uuid.uuid4()),
        "name": "Ghost Plan",
        "billing_interval": "MONTHLY",
        "price": "10.00"
    }, headers=admin_hdr)
    assert bad_plan.status_code == 404

    # Update Plan
    upd_plan = client.put(f"/api/v1/plans/{plan_id}", json={"price": "2400.00"}, headers=admin_hdr)
    assert upd_plan.status_code == 200
    assert Decimal(str(upd_plan.json()["data"]["price"])) == Decimal("2400.00")

    # Delete Plan and Product
    assert client.delete(f"/api/v1/plans/{plan_id}", headers=admin_hdr).status_code == 200
    assert client.delete(f"/api/v1/products/{pid}", headers=admin_hdr).status_code == 200


def test_invoice_lifecycle_transitions(client: TestClient, db_session: Session):
    admin, admin_token = _create_user(db_session, UserRole.ADMIN)
    admin_hdr = {"Authorization": f"Bearer {admin_token}"}

    # Create dummy customer and draft invoice
    cust = Customer(name="Inv Customer", email=f"inv_c_{uuid.uuid4().hex[:4]}@example.com")
    db_session.add(cust)
    db_session.commit()

    now = datetime.now(timezone.utc)
    inv = Invoice(
        invoice_number=f"INV-TEST-{uuid.uuid4().hex[:4]}",
        customer_id=cust.id,
        issue_date=now,
        due_date=now,
        billing_period_start=now,
        billing_period_end=now,
        status=InvoiceStatus.DRAFT,
        subtotal=Decimal("100.00"),
        tax_amount=Decimal("10.00"),
        discount_amount=Decimal("0.00"),
        total=Decimal("110.00"),
        amount_paid=Decimal("0.00"),
        balance_due=Decimal("110.00")
    )
    db_session.add(inv)
    db_session.commit()

    # Confirm invoice: DRAFT -> CONFIRMED (or PENDING)
    conf_res = client.post(f"/api/v1/invoices/{inv.id}/confirm", headers=admin_hdr)
    assert conf_res.status_code == 200

    # Send invoice
    send_res = client.post(f"/api/v1/invoices/{inv.id}/send", headers=admin_hdr)
    assert send_res.status_code == 200

    # Cancel invoice: transitions to CANCELLED
    cancel_res = client.post(f"/api/v1/invoices/{inv.id}/cancel", headers=admin_hdr)
    assert cancel_res.status_code == 200
    assert cancel_res.json()["data"]["status"] == "CANCELLED"
