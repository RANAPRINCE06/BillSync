from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.exceptions import BadRequestException
from app.core.security import create_access_token
from app.models import (
    Customer,
    Discount,
    Invoice,
    Plan,
    Product,
    Subscription,
    SubscriptionItem,
    User,
    BillingInterval,
    DiscountType,
    ProductType,
    SubscriptionStatus,
    UserRole,
)
from app.services.discount_service import DiscountService
from app.services.invoice_service import InvoiceService
from app.schemas.invoice import InvoiceGenerateRequest


def create_user_and_token(db_session: Session, role: UserRole) -> tuple[User, str]:
    user = User(
        name=f"User {role.value}",
        email=f"disc_user_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="pw_hash",
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id))
    return user, token


def create_test_subscription(db_session: Session) -> Subscription:
    customer = Customer(
        name="Discount Test Customer",
        email=f"cust_{uuid.uuid4().hex[:6]}@example.com"
    )
    product = Product(
        name="Billing Engine Pro",
        product_type=ProductType.SUBSCRIPTION,
        sales_price=Decimal("100.00")
    )
    db_session.add_all([customer, product])
    db_session.flush()

    plan = Plan(
        product_id=product.id,
        name="Pro Monthly",
        billing_interval=BillingInterval.MONTHLY,
        price=Decimal("100.00")
    )
    db_session.add(plan)
    db_session.flush()

    now = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    sub = Subscription(
        subscription_number=f"SUB-D-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now
    )
    db_session.add(sub)
    db_session.flush()

    sub_item = SubscriptionItem(
        subscription_id=sub.id,
        product_id=product.id,
        quantity=3,  # subtotal = 3 * 100.00 = 300.00
        unit_price=Decimal("100.00")
    )
    db_session.add(sub_item)
    db_session.commit()
    return sub


def test_fixed_discount_calculation():
    """Verify fixed discount calculation."""
    discount = Discount(
        name="FLAT50",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("50.00"),
        minimum_quantity=1,
        is_active=True
    )
    amount = DiscountService.validate_discount_entity(discount, subtotal=Decimal("200.00"), total_quantity=2)
    assert amount == Decimal("50.00")


def test_percentage_discount_calculation():
    """Verify percentage discount calculation."""
    discount = Discount(
        name="SAVE20",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("20.00"),
        minimum_quantity=1,
        is_active=True
    )
    # 20% of 250.00 = 50.00
    amount = DiscountService.validate_discount_entity(discount, subtotal=Decimal("250.00"), total_quantity=1)
    assert amount == Decimal("50.00")


def test_expired_discount_rejection():
    """Verify expired discounts are rejected."""
    past = datetime.now(timezone.utc) - timedelta(days=10)
    discount = Discount(
        name="OLDPROMO",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("10.00"),
        end_date=past,
        is_active=True
    )
    with pytest.raises(BadRequestException) as exc_info:
        DiscountService.validate_discount_entity(discount, subtotal=Decimal("100.00"))
    assert "has expired" in str(exc_info.value.message)


def test_future_start_discount_rejection():
    """Verify discounts that have not started yet are rejected."""
    future = datetime.now(timezone.utc) + timedelta(days=10)
    discount = Discount(
        name="FUTUREPROMO",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("15.00"),
        start_date=future,
        is_active=True
    )
    with pytest.raises(BadRequestException) as exc_info:
        DiscountService.validate_discount_entity(discount, subtotal=Decimal("100.00"))
    assert "not yet active" in str(exc_info.value.message)


def test_inactive_discount_rejection():
    """Verify inactive discounts are rejected."""
    discount = Discount(
        name="DISABLED",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("25.00"),
        is_active=False
    )
    with pytest.raises(BadRequestException) as exc_info:
        DiscountService.validate_discount_entity(discount, subtotal=Decimal("100.00"))
    assert "is inactive" in str(exc_info.value.message)


def test_minimum_quantity_restriction():
    """Verify discount requires meeting minimum quantity."""
    discount = Discount(
        name="BULK5",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("30.00"),
        minimum_quantity=5,
        is_active=True
    )
    with pytest.raises(BadRequestException) as exc_info:
        DiscountService.validate_discount_entity(discount, subtotal=Decimal("300.00"), total_quantity=3)
    assert "minimum requirement of 5" in str(exc_info.value.message)

    # Valid when quantity meets threshold
    valid_amt = DiscountService.validate_discount_entity(discount, subtotal=Decimal("500.00"), total_quantity=5)
    assert valid_amt == Decimal("150.00")


def test_usage_limit_reached_rejection():
    """Verify discount is rejected when usage_count >= usage_limit."""
    discount = Discount(
        name="LIMITED10",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("10.00"),
        usage_limit=5,
        usage_count=5,
        is_active=True
    )
    with pytest.raises(BadRequestException) as exc_info:
        DiscountService.validate_discount_entity(discount, subtotal=Decimal("100.00"))
    assert "maximum usage limit of 5" in str(exc_info.value.message)


def test_fixed_discount_greater_than_subtotal_rejection():
    """Verify fixed discounts exceeding the order subtotal are rejected."""
    discount = Discount(
        name="TOOBIG",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("200.00"),
        is_active=True
    )
    with pytest.raises(BadRequestException) as exc_info:
        DiscountService.validate_discount_entity(discount, subtotal=Decimal("150.00"))
    assert "cannot exceed eligible subtotal" in str(exc_info.value.message)


def test_percentage_discount_above_100_rejection():
    """Verify percentage discounts above 100% are rejected."""
    discount = Discount(
        name="OVER100",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("110.00"),
        is_active=True
    )
    with pytest.raises(BadRequestException) as exc_info:
        DiscountService.validate_discount_entity(discount, subtotal=Decimal("100.00"))
    assert "cannot exceed 100 percent" in str(exc_info.value.message)


def test_discount_usage_rollback_on_invoice_failure(db_session: Session):
    """Verify that discount usage_count is rolled back if invoice creation fails."""
    subscription = create_test_subscription(db_session)
    discount = Discount(
        name=f"ROLLBACK_{uuid.uuid4().hex[:6]}",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("25.00"),
        usage_limit=10,
        usage_count=0,
        is_active=True
    )
    db_session.add(discount)
    db_session.commit()

    # Pre-create an invoice for the billing period
    now = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    end = now + timedelta(days=30)
    existing_inv = Invoice(
        invoice_number=f"INV-{uuid.uuid4().hex[:6].upper()}",
        customer_id=subscription.customer_id,
        subscription_id=subscription.id,
        billing_period_start=now,
        billing_period_end=end,
        status="CONFIRMED",
        issue_date=now,
        due_date=now + timedelta(days=15),
        subtotal=Decimal("300.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total=Decimal("300.00"),
        balance_due=Decimal("300.00")
    )
    db_session.add(existing_inv)
    db_session.commit()

    # Attempting to generate duplicate invoice with discount must fail and roll back usage_count
    req = InvoiceGenerateRequest(
        subscription_id=subscription.id,
        billing_period_start=now,
        billing_period_end=end,
        discount_id=discount.id
    )

    with pytest.raises(Exception):
        InvoiceService.generate_invoice_for_subscription(db_session, req)

    # Verify usage_count remained 0
    refreshed_discount = db_session.get(Discount, discount.id)
    assert refreshed_discount.usage_count == 0


def test_invoice_integration_with_tax_and_discount(client: TestClient, db_session: Session):
    """Verify correct subtotal, tax, discount, total, and balance_due on generated invoice."""
    admin_user, admin_token = create_user_and_token(db_session, UserRole.ADMIN)
    subscription = create_test_subscription(db_session)

    # 3 items @ 100.00 = 300.00 subtotal
    # Apply 15% discount policy
    discount = Discount(
        name=f"PROMO15_{uuid.uuid4().hex[:6]}",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("15.00"),
        usage_limit=50,
        usage_count=0,
        is_active=True
    )
    db_session.add(discount)
    db_session.commit()

    payload = {
        "subscription_id": str(subscription.id),
        "tax_rate": "10.00",
        "discount_id": str(discount.id),
        "billing_period_start": "2026-12-01T00:00:00Z",
        "billing_period_end": "2027-01-01T00:00:00Z"
    }

    response = client.post(
        "/api/v1/invoices/generate",
        json=payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )

    assert response.status_code == 201
    data = response.json()

    # Subtotal: 3 * 100.00 = 300.00
    # Tax: 10% of 300.00 = 30.00
    # Discount: 15% of 300.00 = 45.00
    # Total: 300.00 + 30.00 - 45.00 = 285.00
    # Balance Due: 285.00
    assert Decimal(data["subtotal"]) == Decimal("300.00")
    assert Decimal(data["tax_amount"]) == Decimal("30.00")
    assert Decimal(data["discount_amount"]) == Decimal("45.00")
    assert Decimal(data["total"]) == Decimal("285.00")
    assert Decimal(data["balance_due"]) == Decimal("285.00")
    assert data["discount_id"] == str(discount.id)

    # Verify discount usage was successfully committed and incremented
    db_session.expire_all()
    updated_discount = db_session.get(Discount, discount.id)
    assert updated_discount.usage_count == 1


def test_discount_api_crud_and_validation(client: TestClient, db_session: Session):
    """Test Discount CRUD and validation endpoints."""
    admin_user, admin_token = create_user_and_token(db_session, UserRole.ADMIN)
    cust_user, cust_token = create_user_and_token(db_session, UserRole.CUSTOMER)

    # 1. Admin creates discount
    create_payload = {
        "name": f"API_SAVE_{uuid.uuid4().hex[:6]}",
        "discount_type": "FIXED",
        "discount_value": "40.00",
        "minimum_quantity": 2,
        "is_active": True
    }
    create_resp = client.post(
        "/api/v1/discounts",
        json=create_payload,
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert create_resp.status_code == 201
    discount_id = create_resp.json()["id"]

    # 2. Customer cannot create discount (403 Forbidden)
    cust_create_resp = client.post(
        "/api/v1/discounts",
        json=create_payload,
        headers={"Authorization": f"Bearer {cust_token}"}
    )
    assert cust_create_resp.status_code == 403

    # 3. Validate endpoint (Customer can simulate discount validity)
    val_resp = client.post(
        f"/api/v1/discounts/{discount_id}/validate",
        json={"subtotal": "200.00", "total_quantity": 2},
        headers={"Authorization": f"Bearer {cust_token}"}
    )
    assert val_resp.status_code == 200
    val_data = val_resp.json()
    assert val_data["is_valid"] is True
    assert Decimal(val_data["calculated_discount"]) == Decimal("40.00")
    assert Decimal(val_data["final_subtotal"]) == Decimal("160.00")

    # 4. Admin updates discount
    patch_resp = client.patch(
        f"/api/v1/discounts/{discount_id}",
        json={"discount_value": "45.00"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert patch_resp.status_code == 200
    assert Decimal(patch_resp.json()["discount_value"]) == Decimal("45.00")
