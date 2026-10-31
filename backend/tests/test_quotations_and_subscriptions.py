from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.core.security import create_access_token
from app.models import (
    Customer,
    Plan,
    Product,
    Quotation,
    QuotationItem,
    Subscription,
    SubscriptionItem,
    User,
    BillingInterval,
    ProductType,
    QuotationStatus,
    SubscriptionStatus,
    UserRole,
)
from app.schemas.billing import BillingRunRequest
from app.schemas.quotation import (
    QuotationConvertToSubscriptionRequest,
    QuotationCreate,
    QuotationItemCreate,
    QuotationUpdate,
)
from app.schemas.subscription import SubscriptionCreate
from app.services.billing_service import BillingService
from app.services.quotation_service import QuotationService
from app.services.subscription_service import SubscriptionService


def create_user_token(db_session: Session, role: UserRole) -> tuple[User, str]:
    user = User(
        name=f"User {role.value} {uuid.uuid4().hex[:4]}",
        email=f"user_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="test_hash",
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id))
    return user, token


def create_customer(db_session: Session, user: User = None) -> Customer:
    cust = Customer(
        name=f"Customer {uuid.uuid4().hex[:4]}",
        email=f"cust_{uuid.uuid4().hex[:6]}@example.com",
        user_id=user.id if user else None
    )
    db_session.add(cust)
    db_session.commit()
    return cust


def create_catalog(db_session: Session, allow_pause: bool = True, allow_renewal: bool = True) -> tuple[Product, Plan]:
    prod = Product(
        name=f"Enterprise SaaS {uuid.uuid4().hex[:4]}",
        product_type=ProductType.SUBSCRIPTION,
        sales_price=Decimal("150.00")
    )
    db_session.add(prod)
    db_session.flush()

    plan = Plan(
        product_id=prod.id,
        name="Enterprise Monthly",
        billing_interval=BillingInterval.MONTHLY,
        price=Decimal("150.00"),
        allow_pause=allow_pause,
        allow_renewal=allow_renewal,
        allow_early_close=True,
        is_active=True
    )
    db_session.add(plan)
    db_session.commit()
    return prod, plan


# 1. Quotation creation and updates
def test_quotation_creation_and_update(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, plan = create_catalog(db_session)

    # Create quotation with item
    payload = QuotationCreate(
        customer_id=cust.id,
        items=[
            QuotationItemCreate(
                product_id=prod.id,
                quantity=2,
                unit_price=Decimal("150.00"),
                tax_rate=Decimal("10.00")
            )
        ]
    )
    q = QuotationService.create_quotation(db_session, payload, admin_user)

    assert q.status == QuotationStatus.DRAFT
    assert q.subtotal == Decimal("300.00")
    assert q.tax_amount == Decimal("30.00")
    assert q.total == Decimal("330.00")

    # Update with discount
    update_payload = QuotationUpdate(discount_amount=Decimal("30.00"))
    q_updated = QuotationService.update_quotation(db_session, q.id, update_payload, admin_user)
    assert q_updated.discount_amount == Decimal("30.00")
    assert q_updated.total == Decimal("300.00")


# 2. Invalid products, prices, and quantities rejection
def test_invalid_products_prices_quantities_rejection(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, _ = create_catalog(db_session)

    # Quantity <= 0 rejected at schema level
    with pytest.raises(Exception):
        QuotationCreate(customer_id=cust.id, items=[QuotationItemCreate(product_id=prod.id, quantity=0, unit_price=Decimal("100.00"))])

    # Negative price rejected at schema level
    with pytest.raises(Exception):
        QuotationCreate(customer_id=cust.id, items=[QuotationItemCreate(product_id=prod.id, quantity=1, unit_price=Decimal("-10.00"))])

    # Non-existent product
    with pytest.raises(NotFoundException) as exc3:
        QuotationService.create_quotation(
            db_session,
            QuotationCreate(customer_id=cust.id, items=[QuotationItemCreate(product_id=uuid.uuid4(), quantity=1, unit_price=Decimal("100.00"))]),
            admin_user
        )
    assert "not found" in exc3.value.message


# 3. Customer ownership and role authorization
def test_customer_ownership_and_role_authorization(client: TestClient, db_session: Session):
    cust_user_a, token_a = create_user_token(db_session, UserRole.CUSTOMER)
    cust_user_b, token_b = create_user_token(db_session, UserRole.CUSTOMER)
    admin_user, admin_token = create_user_token(db_session, UserRole.ADMIN)

    cust_a = create_customer(db_session, user=cust_user_a)
    cust_b = create_customer(db_session, user=cust_user_b)
    prod, _ = create_catalog(db_session)

    # Customer cannot create quotation -> 403
    resp_create = client.post(
        "/api/v1/quotations",
        json={"customer_id": str(cust_a.id), "items": [{"product_id": str(prod.id), "quantity": 1, "unit_price": 100}]},
        headers={"Authorization": f"Bearer {token_a}"}
    )
    assert resp_create.status_code == 403

    # Admin creates quotation for Customer A
    q_a = QuotationService.create_quotation(
        db_session,
        QuotationCreate(customer_id=cust_a.id, items=[QuotationItemCreate(product_id=prod.id, quantity=1, unit_price=Decimal("100.00"))]),
        admin_user
    )

    # Customer A can view their own quotation
    resp_a = client.get(f"/api/v1/quotations/{q_a.id}", headers={"Authorization": f"Bearer {token_a}"})
    assert resp_a.status_code == 200

    # Customer B cannot view Customer A's quotation -> 403
    resp_b = client.get(f"/api/v1/quotations/{q_a.id}", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_b.status_code == 403


# 4. Quotation acceptance and rejection
def test_quotation_acceptance_and_rejection(client: TestClient, db_session: Session):
    cust_user, cust_token = create_user_token(db_session, UserRole.CUSTOMER)
    admin_user, admin_token = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session, user=cust_user)
    prod, _ = create_catalog(db_session)

    # Quotation 1: Accept
    q1 = QuotationService.create_quotation(
        db_session,
        QuotationCreate(customer_id=cust.id, items=[QuotationItemCreate(product_id=prod.id, quantity=1, unit_price=Decimal("100.00"))]),
        admin_user
    )
    resp_accept = client.post(f"/api/v1/quotations/{q1.id}/accept", headers={"Authorization": f"Bearer {cust_token}"})
    assert resp_accept.status_code == 200
    assert resp_accept.json()["data"]["status"] == "ACCEPTED"

    # Quotation 2: Reject
    q2 = QuotationService.create_quotation(
        db_session,
        QuotationCreate(customer_id=cust.id, items=[QuotationItemCreate(product_id=prod.id, quantity=1, unit_price=Decimal("100.00"))]),
        admin_user
    )
    resp_reject = client.post(f"/api/v1/quotations/{q2.id}/reject", headers={"Authorization": f"Bearer {cust_token}"})
    assert resp_reject.status_code == 200
    assert resp_reject.json()["data"]["status"] == "REJECTED"


# 5. Duplicate conversion prevention
def test_duplicate_conversion_prevention(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, plan = create_catalog(db_session)

    q = QuotationService.create_quotation(
        db_session,
        QuotationCreate(customer_id=cust.id, status=QuotationStatus.ACCEPTED, items=[QuotationItemCreate(product_id=prod.id, quantity=1, unit_price=Decimal("150.00"))]),
        admin_user
    )

    # First conversion: succeeds
    sub = QuotationService.convert_to_subscription(db_session, q.id, QuotationConvertToSubscriptionRequest(plan_id=plan.id), admin_user)
    assert sub.status == SubscriptionStatus.ACTIVE

    # Second conversion: rejected with ConflictException
    with pytest.raises(ConflictException) as exc_info:
        QuotationService.convert_to_subscription(db_session, q.id, QuotationConvertToSubscriptionRequest(plan_id=plan.id), admin_user)
    assert "already been converted" in exc_info.value.message


# 6. Unaccepted quotation conversion rejection
def test_unaccepted_quotation_conversion_rejection(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, plan = create_catalog(db_session)

    # Quotation in DRAFT status
    q = QuotationService.create_quotation(
        db_session,
        QuotationCreate(customer_id=cust.id, status=QuotationStatus.DRAFT, items=[QuotationItemCreate(product_id=prod.id, quantity=1, unit_price=Decimal("150.00"))]),
        admin_user
    )

    with pytest.raises(BadRequestException) as exc_info:
        QuotationService.convert_to_subscription(db_session, q.id, None, admin_user)
    assert "Only ACCEPTED quotations" in exc_info.value.message


# 7. Subscription item and price snapshots preserved
def test_subscription_item_and_price_snapshots(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, plan = create_catalog(db_session)  # Catalog list price is 150.00

    # Custom negotiated discount price: 85.00
    q = QuotationService.create_quotation(
        db_session,
        QuotationCreate(customer_id=cust.id, status=QuotationStatus.ACCEPTED, items=[QuotationItemCreate(product_id=prod.id, quantity=3, unit_price=Decimal("85.00"))]),
        admin_user
    )

    sub = QuotationService.convert_to_subscription(db_session, q.id, QuotationConvertToSubscriptionRequest(plan_id=plan.id), admin_user)
    assert len(sub.items) == 1
    assert sub.items[0].quantity == 3
    assert sub.items[0].unit_price == Decimal("85.00")  # Locked snapshot, not catalog price of 150.00


# 8. Subscription lifecycle transitions (confirm, activate, pause, resume, close)
def test_subscription_lifecycle_transitions(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, plan = create_catalog(db_session, allow_pause=True)

    # Start in DRAFT
    sub = SubscriptionService.create_subscription(
        db_session,
        SubscriptionCreate(customer_id=cust.id, plan_id=plan.id, status=SubscriptionStatus.DRAFT),
        admin_user
    )
    assert sub.status == SubscriptionStatus.DRAFT

    # Confirm
    SubscriptionService.confirm_subscription(db_session, sub.id, admin_user)
    assert sub.status == SubscriptionStatus.CONFIRMED

    # Activate
    SubscriptionService.activate_subscription(db_session, sub.id, admin_user)
    assert sub.status == SubscriptionStatus.ACTIVE
    assert sub.next_billing_date is not None

    # Pause
    SubscriptionService.pause_subscription(db_session, sub.id, admin_user)
    assert sub.status == SubscriptionStatus.PAUSED

    # Resume
    SubscriptionService.resume_subscription(db_session, sub.id, admin_user)
    assert sub.status == SubscriptionStatus.ACTIVE

    # Close
    SubscriptionService.close_subscription(db_session, sub.id, admin_user)
    assert sub.status == SubscriptionStatus.CLOSED


# 9. Plan policy enforcement (pause/renewal disabled)
def test_subscription_plan_policy_enforcement(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, plan = create_catalog(db_session, allow_pause=False, allow_renewal=False)

    sub = SubscriptionService.create_subscription(
        db_session,
        SubscriptionCreate(customer_id=cust.id, plan_id=plan.id, status=SubscriptionStatus.ACTIVE),
        admin_user
    )

    # Attempting to pause must fail because allow_pause is False
    with pytest.raises(BadRequestException) as exc1:
        SubscriptionService.pause_subscription(db_session, sub.id, admin_user)
    assert "does not allow pausing" in exc1.value.message

    # Attempting to renew must fail because allow_renewal is False
    with pytest.raises(BadRequestException) as exc2:
        SubscriptionService.renew_subscription(db_session, sub.id, admin_user)
    assert "does not allow renewal" in exc2.value.message


# 10. BillingService integration with converted subscription
def test_billing_service_integration_with_converted_subscription(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, plan = create_catalog(db_session)

    # Convert accepted quotation
    q = QuotationService.create_quotation(
        db_session,
        QuotationCreate(customer_id=cust.id, status=QuotationStatus.ACCEPTED, items=[QuotationItemCreate(product_id=prod.id, quantity=2, unit_price=Decimal("150.00"))]),
        admin_user
    )
    start = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    sub = QuotationService.convert_to_subscription(
        db_session,
        q.id,
        QuotationConvertToSubscriptionRequest(plan_id=plan.id, start_date=start),
        admin_user
    )
    assert sub.status == SubscriptionStatus.ACTIVE
    assert sub.next_billing_date == start

    # Run BillingService cycle
    req = BillingRunRequest(as_of_date=datetime(2026, 11, 2, 0, 0, 0, tzinfo=timezone.utc), subscription_ids=[sub.id])
    summary = BillingService.run_billing_cycle(db_session, req)

    assert summary.invoices_created == 1
    assert summary.results[0].status == "SUCCESS"
    assert summary.results[0].total_amount == Decimal("300.00")

    # Verify next_billing_date advanced by 1 month
    db_session.refresh(sub)
    assert sub.next_billing_date == datetime(2026, 12, 1, 0, 0, 0, tzinfo=timezone.utc)


# 11. Initial invoice generation flag during conversion
def test_initial_invoice_generation_during_conversion(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    prod, plan = create_catalog(db_session)

    q = QuotationService.create_quotation(
        db_session,
        QuotationCreate(customer_id=cust.id, status=QuotationStatus.ACCEPTED, items=[QuotationItemCreate(product_id=prod.id, quantity=1, unit_price=Decimal("200.00"))]),
        admin_user
    )

    # Convert with generate_initial_invoice = True
    sub = QuotationService.convert_to_subscription(
        db_session,
        q.id,
        QuotationConvertToSubscriptionRequest(plan_id=plan.id, generate_initial_invoice=True),
        admin_user
    )
    db_session.refresh(sub)
    assert len(sub.invoices) == 1
    assert sub.invoices[0].total == Decimal("200.00")
