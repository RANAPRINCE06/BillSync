from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import create_access_token
from app.models import (
    Customer,
    Invoice,
    Plan,
    Product,
    Subscription,
    SubscriptionItem,
    User,
    BillingInterval,
    InvoiceStatus,
    ProductType,
    SubscriptionStatus,
    UserRole,
)


def create_authenticated_user(db_session: Session, role: UserRole) -> tuple[User, str]:
    """Helper to create a user and return (User, JWT token)."""
    user = User(
        name=f"Test {role.value}",
        email=f"user_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="test_hash",
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id))
    return user, token


def setup_subscription_fixture(db_session: Session, user: User = None) -> Subscription:
    """Helper creating a customer, product, plan, subscription, and subscription items."""
    customer = Customer(
        user_id=user.id if user else None,
        name="Enterprise Client Inc",
        email=user.email if user else f"client_{uuid.uuid4().hex[:6]}@example.com",
        billing_address="100 Wall Street, New York, NY"
    )
    product = Product(
        name="Enterprise Analytics License",
        description="Full access analytics suite",
        product_type=ProductType.SUBSCRIPTION,
        sales_price=Decimal("250.00"),
        cost_price=Decimal("50.00"),
        is_active=True
    )
    db_session.add_all([customer, product])
    db_session.flush()

    plan = Plan(
        product_id=product.id,
        name="Enterprise Monthly",
        billing_interval=BillingInterval.MONTHLY,
        price=Decimal("250.00"),
        minimum_quantity=1
    )
    db_session.add(plan)
    db_session.flush()

    now = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    sub = Subscription(
        subscription_number=f"SUB-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        next_billing_date=now
    )
    db_session.add(sub)
    db_session.flush()

    sub_item = SubscriptionItem(
        subscription_id=sub.id,
        product_id=product.id,
        quantity=2,
        unit_price=Decimal("250.00")
    )
    db_session.add(sub_item)
    db_session.commit()

    return sub


def test_successful_invoice_generation(client: TestClient, db_session: Session):
    """Test generating an invoice with correct subtotal, tax, and balance due."""
    admin_user, admin_token = create_authenticated_user(db_session, UserRole.ADMIN)
    subscription = setup_subscription_fixture(db_session)

    payload = {
        "subscription_id": str(subscription.id),
        "tax_rate": "10.00",
        "discount_amount": "20.00",
        "billing_period_start": "2026-11-01T00:00:00Z",
        "billing_period_end": "2026-12-01T00:00:00Z"
    }

    response = client.post(
        "/api/v1/invoices/generate",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 201
    data = response.json()

    # Subtotal = 2 * 250.00 = 500.00
    # Tax = 10% of 500.00 = 50.00
    # Discount = 20.00
    # Total = 500.00 + 50.00 - 20.00 = 530.00
    assert data["subscription_id"] == str(subscription.id)
    assert data["customer_id"] == str(subscription.customer_id)
    assert Decimal(data["subtotal"]) == Decimal("500.00")
    assert Decimal(data["tax_amount"]) == Decimal("50.00")
    assert Decimal(data["discount_amount"]) == Decimal("20.00")
    assert Decimal(data["total"]) == Decimal("530.00")
    assert Decimal(data["amount_paid"]) == Decimal("0.00")
    assert Decimal(data["balance_due"]) == Decimal("530.00")
    assert data["status"] == "CONFIRMED"
    assert len(data["items"]) == 1
    assert data["items"][0]["quantity"] == 2
    assert Decimal(data["items"][0]["unit_price"]) == Decimal("250.00")
    assert Decimal(data["items"][0]["line_total"]) == Decimal("550.00")  # 500 + 10% tax


def test_duplicate_invoice_prevention(client: TestClient, db_session: Session):
    """Test that generating a duplicate invoice for the same subscription and period is rejected."""
    admin_user, admin_token = create_authenticated_user(db_session, UserRole.ADMIN)
    subscription = setup_subscription_fixture(db_session)

    payload = {
        "subscription_id": str(subscription.id),
        "billing_period_start": "2026-11-01T00:00:00Z",
        "billing_period_end": "2026-12-01T00:00:00Z"
    }

    # First generation succeeds
    resp1 = client.post(
        "/api/v1/invoices/generate",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp1.status_code == 201

    # Second generation for same period must be rejected with 409 Conflict
    resp2 = client.post(
        "/api/v1/invoices/generate",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp2.status_code == 409
    error_data = resp2.json()
    assert error_data["success"] is False
    assert error_data["error"]["code"] == "CONFLICT"


def test_invalid_subscription_rejection(client: TestClient, db_session: Session):
    """Test rejection when subscription ID does not exist."""
    admin_user, admin_token = create_authenticated_user(db_session, UserRole.ADMIN)
    random_id = str(uuid.uuid4())

    response = client.post(
        "/api/v1/invoices/generate",
        json={"subscription_id": random_id},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 404
    data = response.json()
    assert data["success"] is False
    assert data["error"]["code"] == "NOT_FOUND"


def test_empty_subscription_items_rejection(client: TestClient, db_session: Session):
    """Test rejection when subscription has no billable items."""
    admin_user, admin_token = create_authenticated_user(db_session, UserRole.ADMIN)
    customer = Customer(name="Empty Items Ltd", email=f"empty_{uuid.uuid4().hex[:6]}@example.com")
    product = Product(name="Cloud Storage", sales_price=Decimal("10.00"))
    db_session.add_all([customer, product])
    db_session.flush()

    plan = Plan(product_id=product.id, name="Cloud Plan", billing_interval=BillingInterval.MONTHLY, price=Decimal("10.00"))
    db_session.add(plan)
    db_session.flush()

    sub = Subscription(
        subscription_number=f"SUB-EMPTY-{uuid.uuid4().hex[:6].upper()}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=datetime.now(timezone.utc)
    )
    db_session.add(sub)
    db_session.commit()

    response = client.post(
        "/api/v1/invoices/generate",
        json={"subscription_id": str(sub.id)},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert response.status_code == 400
    data = response.json()
    assert data["success"] is False
    assert "no billable items" in data["error"]["message"]


def test_historical_invoice_item_snapshot(client: TestClient, db_session: Session):
    """Verify modifying catalog product sales_price does not alter issued invoice line items."""
    admin_user, admin_token = create_authenticated_user(db_session, UserRole.ADMIN)
    subscription = setup_subscription_fixture(db_session)

    # Generate invoice
    gen_resp = client.post(
        "/api/v1/invoices/generate",
        json={
            "subscription_id": str(subscription.id),
            "billing_period_start": "2026-11-01T00:00:00Z",
            "billing_period_end": "2026-12-01T00:00:00Z"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert gen_resp.status_code == 201
    invoice_id = gen_resp.json()["id"]

    # Alter the catalog product price in database
    product = subscription.plan.product
    product.sales_price = Decimal("999.99")
    db_session.add(product)
    db_session.commit()

    # Retrieve invoice - historical item price must remain 250.00
    fetch_resp = client.get(
        f"/api/v1/invoices/{invoice_id}",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert fetch_resp.status_code == 200
    fetched_data = fetch_resp.json()
    assert Decimal(fetched_data["items"][0]["unit_price"]) == Decimal("250.00")
    assert Decimal(fetched_data["subtotal"]) == Decimal("500.00")


def test_customer_access_restrictions(client: TestClient, db_session: Session):
    """Verify Customers cannot view other customers' invoices, but can view their own."""
    # Create Customer A and Customer B
    user_a, token_a = create_authenticated_user(db_session, UserRole.CUSTOMER)
    user_b, token_b = create_authenticated_user(db_session, UserRole.CUSTOMER)
    admin_user, admin_token = create_authenticated_user(db_session, UserRole.ADMIN)

    sub_a = setup_subscription_fixture(db_session, user=user_a)
    sub_b = setup_subscription_fixture(db_session, user=user_b)

    # Generate invoice for Customer A
    resp_inv_a = client.post(
        "/api/v1/invoices/generate",
        json={
            "subscription_id": str(sub_a.id),
            "billing_period_start": "2026-11-01T00:00:00Z",
            "billing_period_end": "2026-12-01T00:00:00Z"
        },
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_inv_a.status_code == 201
    inv_a_id = resp_inv_a.json()["id"]

    # Customer A accessing their own invoice: 200 OK
    resp_own = client.get(
        f"/api/v1/invoices/{inv_a_id}",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp_own.status_code == 200

    # Customer B attempting to access Customer A's invoice: 403 Forbidden
    resp_other = client.get(
        f"/api/v1/invoices/{inv_a_id}",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert resp_other.status_code == 403

    # List invoices for Customer A only shows their invoice
    list_a = client.get(
        "/api/v1/invoices",
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert list_a.status_code == 200
    assert list_a.json()["total"] == 1
    assert list_a.json()["items"][0]["id"] == inv_a_id

    # List invoices for Customer B shows 0
    list_b = client.get(
        "/api/v1/invoices",
        headers={"Authorization": f"Bearer {token_b}"}
    )
    assert list_b.status_code == 200
    assert list_b.json()["total"] == 0
