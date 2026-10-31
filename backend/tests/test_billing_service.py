from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

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
    InvoiceStatus,
    ProductType,
    SubscriptionStatus,
    UserRole,
)
from app.schemas.billing import BillingRunRequest
from app.services.billing_service import BillingService


def create_user_token(db_session: Session, role: UserRole) -> tuple[User, str]:
    user = User(
        name=f"Billing {role.value}",
        email=f"bill_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="test_pw",
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id))
    return user, token


def create_subscription_for_interval(
    db_session: Session,
    interval: BillingInterval,
    start_date: datetime,
    next_billing_date: datetime,
    status: SubscriptionStatus = SubscriptionStatus.ACTIVE,
    unit_price: Decimal = Decimal("100.00"),
    quantity: int = 1,
    with_items: bool = True
) -> Subscription:
    customer = Customer(
        name=f"Customer {uuid.uuid4().hex[:4]}",
        email=f"cust_{uuid.uuid4().hex[:6]}@example.com"
    )
    product = Product(
        name=f"SaaS Plan {interval.value}",
        product_type=ProductType.SUBSCRIPTION,
        sales_price=unit_price
    )
    db_session.add_all([customer, product])
    db_session.flush()

    plan = Plan(
        product_id=product.id,
        name=f"Plan {interval.value}",
        billing_interval=interval,
        price=unit_price
    )
    db_session.add(plan)
    db_session.flush()

    sub = Subscription(
        subscription_number=f"SUB-B-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=status,
        start_date=start_date,
        next_billing_date=next_billing_date
    )
    db_session.add(sub)
    db_session.flush()

    if with_items:
        sub_item = SubscriptionItem(
            subscription_id=sub.id,
            product_id=product.id,
            quantity=quantity,
            unit_price=unit_price
        )
        db_session.add(sub_item)

    db_session.commit()
    return sub


# 1. Daily billing date calculation
def test_daily_billing_period_calculation():
    start = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    next_date = BillingService.calculate_next_billing_period_end(start, BillingInterval.DAILY)
    assert next_date == datetime(2026, 11, 2, 10, 0, 0, tzinfo=timezone.utc)


# 2. Weekly billing date calculation
def test_weekly_billing_period_calculation():
    start = datetime(2026, 11, 1, 10, 0, 0, tzinfo=timezone.utc)
    next_date = BillingService.calculate_next_billing_period_end(start, BillingInterval.WEEKLY)
    assert next_date == datetime(2026, 11, 8, 10, 0, 0, tzinfo=timezone.utc)


# 3. Monthly billing date calculation
def test_monthly_billing_period_calculation():
    start = datetime(2026, 3, 15, 10, 0, 0, tzinfo=timezone.utc)
    next_date = BillingService.calculate_next_billing_period_end(start, BillingInterval.MONTHLY)
    assert next_date == datetime(2026, 4, 15, 10, 0, 0, tzinfo=timezone.utc)


# 4. Yearly billing date calculation
def test_yearly_billing_period_calculation():
    start = datetime(2026, 6, 1, 10, 0, 0, tzinfo=timezone.utc)
    next_date = BillingService.calculate_next_billing_period_end(start, BillingInterval.YEARLY)
    assert next_date == datetime(2027, 6, 1, 10, 0, 0, tzinfo=timezone.utc)


# 5. Month-end date handling
def test_month_end_date_handling():
    # January 31 -> February 28 on non-leap year (2025)
    start_jan31_2025 = datetime(2025, 1, 31, 0, 0, 0, tzinfo=timezone.utc)
    next_feb_2025 = BillingService.calculate_next_billing_period_end(start_jan31_2025, BillingInterval.MONTHLY)
    assert next_feb_2025 == datetime(2025, 2, 28, 0, 0, 0, tzinfo=timezone.utc)

    # January 31 -> February 29 on leap year (2024)
    start_jan31_2024 = datetime(2024, 1, 31, 0, 0, 0, tzinfo=timezone.utc)
    next_feb_2024 = BillingService.calculate_next_billing_period_end(start_jan31_2024, BillingInterval.MONTHLY)
    assert next_feb_2024 == datetime(2024, 2, 29, 0, 0, 0, tzinfo=timezone.utc)

    # August 31 -> September 30
    start_aug31 = datetime(2026, 8, 31, 0, 0, 0, tzinfo=timezone.utc)
    next_sep = BillingService.calculate_next_billing_period_end(start_aug31, BillingInterval.MONTHLY)
    assert next_sep == datetime(2026, 9, 30, 0, 0, 0, tzinfo=timezone.utc)


# 6. Leap-year handling
def test_leap_year_handling():
    # Feb 29 2024 (leap year) + 1 year -> Feb 28 2025 (non-leap year)
    leap_date = datetime(2024, 2, 29, 12, 0, 0, tzinfo=timezone.utc)
    next_year = BillingService.calculate_next_billing_period_end(leap_date, BillingInterval.YEARLY)
    assert next_year == datetime(2025, 2, 28, 12, 0, 0, tzinfo=timezone.utc)


# 7. Future subscriptions are skipped
def test_future_subscriptions_skipped(db_session: Session):
    future_date = datetime.now(timezone.utc) + timedelta(days=5)
    sub = create_subscription_for_interval(
        db_session,
        BillingInterval.MONTHLY,
        start_date=future_date,
        next_billing_date=future_date
    )

    req = BillingRunRequest(as_of_date=datetime.now(timezone.utc), subscription_ids=[sub.id])
    summary = BillingService.run_billing_cycle(db_session, req)
    assert summary.processed == 0
    assert summary.invoices_created == 0


# 8. Paused subscriptions are skipped
def test_paused_subscriptions_skipped(db_session: Session):
    past_date = datetime.now(timezone.utc) - timedelta(days=1)
    sub = create_subscription_for_interval(
        db_session,
        BillingInterval.MONTHLY,
        start_date=past_date,
        next_billing_date=past_date,
        status=SubscriptionStatus.PAUSED
    )

    req = BillingRunRequest(as_of_date=datetime.now(timezone.utc), subscription_ids=[sub.id])
    summary = BillingService.run_billing_cycle(db_session, req)
    assert summary.processed == 0
    assert summary.invoices_created == 0


# 9. Closed subscriptions are skipped
def test_closed_subscriptions_skipped(db_session: Session):
    past_date = datetime.now(timezone.utc) - timedelta(days=1)
    sub = create_subscription_for_interval(
        db_session,
        BillingInterval.MONTHLY,
        start_date=past_date,
        next_billing_date=past_date,
        status=SubscriptionStatus.CLOSED
    )

    req = BillingRunRequest(as_of_date=datetime.now(timezone.utc), subscription_ids=[sub.id])
    summary = BillingService.run_billing_cycle(db_session, req)
    assert summary.processed == 0
    assert summary.invoices_created == 0


# 10. Successful invoice generation and next_billing_date update
def test_successful_billing_run(db_session: Session):
    due_date = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    sub = create_subscription_for_interval(
        db_session,
        BillingInterval.MONTHLY,
        start_date=due_date,
        next_billing_date=due_date,
        unit_price=Decimal("150.00"),
        quantity=2
    )

    req = BillingRunRequest(
        as_of_date=datetime(2026, 11, 2, 0, 0, 0, tzinfo=timezone.utc),
        subscription_ids=[sub.id],
        auto_advance_dates=True
    )
    summary = BillingService.run_billing_cycle(db_session, req)

    assert summary.processed == 1
    assert summary.invoices_created == 1
    assert summary.results[0].status == "SUCCESS"
    assert summary.results[0].total_amount == Decimal("300.00")

    # 12. Next billing date updated after success
    db_session.refresh(sub)
    expected_next = datetime(2026, 12, 1, 0, 0, 0, tzinfo=timezone.utc)
    assert sub.next_billing_date == expected_next


# 11. Duplicate invoice prevention in billing run
def test_duplicate_invoice_prevention_in_billing_run(db_session: Session):
    due_date = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    sub = create_subscription_for_interval(
        db_session,
        BillingInterval.MONTHLY,
        start_date=due_date,
        next_billing_date=due_date
    )

    # First run creates invoice
    req = BillingRunRequest(as_of_date=datetime(2026, 11, 2, 0, 0, 0, tzinfo=timezone.utc), subscription_ids=[sub.id])
    summary1 = BillingService.run_billing_cycle(db_session, req)
    assert summary1.invoices_created == 1

    # Reset next_billing_date back to due_date to test duplicate check
    sub.next_billing_date = due_date
    db_session.commit()

    # Second run must be skipped due to existing invoice
    summary2 = BillingService.run_billing_cycle(db_session, req)
    assert summary2.invoices_created == 0
    assert summary2.skipped == 1
    assert summary2.results[0].status == "SKIPPED"
    assert "already exists" in summary2.results[0].reason


# 13. Next billing date unchanged after failure
def test_next_billing_date_unchanged_on_failure(db_session: Session):
    due_date = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    # Subscription without items will fail invoice generation
    sub = create_subscription_for_interval(
        db_session,
        BillingInterval.MONTHLY,
        start_date=due_date,
        next_billing_date=due_date,
        with_items=False
    )

    req = BillingRunRequest(as_of_date=datetime(2026, 11, 2, 0, 0, 0, tzinfo=timezone.utc), subscription_ids=[sub.id])
    summary = BillingService.run_billing_cycle(db_session, req)

    assert summary.processed == 1
    assert summary.invoices_created == 0
    assert summary.failed == 1
    assert summary.results[0].status == "FAILED"

    # Date remains unchanged
    db_session.refresh(sub)
    assert sub.next_billing_date == due_date


# 14. Discount usage rollback after failed invoice creation
def test_discount_rollback_on_billing_failure(db_session: Session):
    discount = Discount(
        name=f"BILL_DISC_{uuid.uuid4().hex[:6]}",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("50.00"),
        usage_limit=10,
        usage_count=0,
        is_active=True
    )
    db_session.add(discount)
    db_session.commit()

    due_date = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    sub = create_subscription_for_interval(
        db_session,
        BillingInterval.MONTHLY,
        start_date=due_date,
        next_billing_date=due_date,
        with_items=False  # Will fail
    )

    req = BillingRunRequest(as_of_date=datetime(2026, 11, 2, 0, 0, 0, tzinfo=timezone.utc), subscription_ids=[sub.id])
    summary = BillingService.run_billing_cycle(db_session, req)
    assert summary.failed == 1

    db_session.refresh(discount)
    assert discount.usage_count == 0


# 15 & 16. Multiple subscriptions in one billing run and isolated failure handling
def test_multiple_subscriptions_and_isolated_failures(db_session: Session):
    due_date = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    # Sub 1: Valid
    sub1 = create_subscription_for_interval(db_session, BillingInterval.MONTHLY, due_date, due_date, with_items=True)
    # Sub 2: Invalid (no items -> fails)
    sub2 = create_subscription_for_interval(db_session, BillingInterval.MONTHLY, due_date, due_date, with_items=False)
    # Sub 3: Valid
    sub3 = create_subscription_for_interval(db_session, BillingInterval.WEEKLY, due_date, due_date, with_items=True)

    req = BillingRunRequest(
        as_of_date=datetime(2026, 11, 2, 0, 0, 0, tzinfo=timezone.utc),
        subscription_ids=[sub1.id, sub2.id, sub3.id]
    )
    summary = BillingService.run_billing_cycle(db_session, req)

    assert summary.processed == 3
    assert summary.invoices_created == 2  # Sub1 and Sub3 succeed
    assert summary.failed == 1            # Sub2 fails
    assert summary.skipped == 0


# 17. Unauthorized customer access to billing run API
def test_customer_access_forbidden(client: TestClient, db_session: Session):
    cust_user, cust_token = create_user_token(db_session, UserRole.CUSTOMER)
    response = client.post(
        "/api/v1/billing/run",
        json={},
        headers={"Authorization": f"Bearer {cust_token}"}
    )
    assert response.status_code == 403
    assert response.json()["success"] is False


# 18. Admin and Staff access to billing run API
def test_admin_and_staff_access(client: TestClient, db_session: Session):
    admin_user, admin_token = create_user_token(db_session, UserRole.ADMIN)
    staff_user, staff_token = create_user_token(db_session, UserRole.STAFF)

    # Admin access
    resp_admin = client.post(
        "/api/v1/billing/run",
        json={},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_admin.status_code == 200
    assert resp_admin.json()["success"] is True

    # Staff access
    resp_staff = client.post(
        "/api/v1/billing/run",
        json={},
        headers={"Authorization": f"Bearer {staff_token}"}
    )
    assert resp_staff.status_code == 200
    assert resp_staff.json()["success"] is True

    # Status endpoint
    resp_status = client.get(
        "/api/v1/billing/status",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_status.status_code == 200
    assert "total_active_subscriptions" in resp_status.json()["data"]
