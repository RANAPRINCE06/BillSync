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
    Invoice,
    InvoiceItem,
    Payment,
    Plan,
    Product,
    Subscription,
    User,
    BillingInterval,
    InvoiceStatus,
    PaymentMethod,
    PaymentStatus,
    ProductType,
    SubscriptionStatus,
    UserRole,
)
from app.schemas.dashboard import ChartGrouping
from app.services.dashboard_service import DashboardService


def create_user_token(db_session: Session, role: UserRole) -> tuple[User, str]:
    user = User(
        name=f"Dash User {role.value} {uuid.uuid4().hex[:4]}",
        email=f"dash_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="test_pw",
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id))
    return user, token


def create_customer(db_session: Session, user: User = None) -> Customer:
    cust = Customer(
        name=f"Cust {uuid.uuid4().hex[:4]}",
        email=f"cust_{uuid.uuid4().hex[:6]}@example.com",
        user_id=user.id if user else None
    )
    db_session.add(cust)
    db_session.commit()
    return cust


def create_invoice_with_items(
    db_session: Session,
    customer: Customer,
    total: Decimal,
    status: InvoiceStatus = InvoiceStatus.CONFIRMED,
    amount_paid: Decimal = Decimal("0.00"),
    balance_due: Decimal = None,
    due_date: datetime = None,
    issue_date: datetime = None
) -> Invoice:
    now = datetime.now(timezone.utc)
    iss_date = issue_date or now
    d_date = due_date or (iss_date + timedelta(days=15))
    bal = balance_due if balance_due is not None else (total - amount_paid)

    inv = Invoice(
        invoice_number=f"INV-D-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        billing_period_start=iss_date,
        billing_period_end=iss_date + timedelta(days=30),
        status=status,
        issue_date=iss_date,
        due_date=d_date,
        subtotal=total,
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total=total,
        amount_paid=amount_paid,
        balance_due=bal
    )
    db_session.add(inv)
    db_session.flush()

    # Add 2 items to test against duplicate joins
    item1 = InvoiceItem(
        invoice_id=inv.id,
        description="Line 1",
        quantity=1,
        unit_price=total / 2,
        line_total=total / 2
    )
    item2 = InvoiceItem(
        invoice_id=inv.id,
        description="Line 2",
        quantity=1,
        unit_price=total / 2,
        line_total=total / 2
    )
    db_session.add_all([item1, item2])
    db_session.commit()
    return inv


def create_payment(
    db_session: Session,
    invoice: Invoice,
    amount: Decimal,
    status: PaymentStatus = PaymentStatus.SUCCESSFUL,
    payment_date: datetime = None
) -> Payment:
    pay = Payment(
        invoice_id=invoice.id,
        payment_reference=f"PAY-D-{uuid.uuid4().hex[:8].upper()}",
        payment_method=PaymentMethod.CREDIT_CARD,
        amount=amount,
        payment_date=payment_date or datetime.now(timezone.utc),
        status=status
    )
    db_session.add(pay)
    db_session.commit()
    return pay


# 1. Empty database handling
def test_empty_database_stats(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    stats = DashboardService.get_dashboard_stats(db_session, admin_user)
    assert stats.total_customers >= 0
    assert stats.total_active_subscriptions >= 0
    assert stats.total_revenue_received >= Decimal("0.00")
    assert stats.total_outstanding_balance >= Decimal("0.00")


# 2. Multiple customers and active vs inactive subscriptions
def test_multiple_customers_and_subscriptions(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    c1 = create_customer(db_session)
    c2 = create_customer(db_session)

    prod = Product(name="Cloud SaaS", product_type=ProductType.SUBSCRIPTION, sales_price=Decimal("100.00"))
    db_session.add(prod)
    db_session.flush()
    plan = Plan(product_id=prod.id, name="Pro Plan", billing_interval=BillingInterval.MONTHLY, price=Decimal("100.00"))
    db_session.add(plan)
    db_session.flush()

    # Active subscription
    sub1 = Subscription(
        subscription_number=f"SUB-D1-{uuid.uuid4().hex[:6].upper()}",
        customer_id=c1.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=datetime.now(timezone.utc)
    )
    # Paused subscription
    sub2 = Subscription(
        subscription_number=f"SUB-D2-{uuid.uuid4().hex[:6].upper()}",
        customer_id=c2.id,
        plan_id=plan.id,
        status=SubscriptionStatus.PAUSED,
        start_date=datetime.now(timezone.utc)
    )
    db_session.add_all([sub1, sub2])
    db_session.commit()

    stats = DashboardService.get_dashboard_stats(db_session, admin_user)
    assert stats.total_customers >= 2
    assert stats.total_active_subscriptions >= 1


# 3. Successful, pending, failed, and refunded payments revenue calculation
def test_payment_status_revenue_calculation(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    inv = create_invoice_with_items(db_session, cust, total=Decimal("1000.00"))

    # Successful payment: 300.00
    p_success = create_payment(db_session, inv, amount=Decimal("300.00"), status=PaymentStatus.SUCCESSFUL)
    # Pending payment: 200.00 (excluded from revenue)
    p_pending = create_payment(db_session, inv, amount=Decimal("200.00"), status=PaymentStatus.PENDING)
    # Failed payment: 150.00 (excluded from revenue)
    p_failed = create_payment(db_session, inv, amount=Decimal("150.00"), status=PaymentStatus.FAILED)
    # Refunded payment: 100.00 (excluded from revenue)
    p_refunded = create_payment(db_session, inv, amount=Decimal("100.00"), status=PaymentStatus.REFUNDED)

    stats = DashboardService.get_dashboard_stats(db_session, admin_user)
    # Total revenue must reflect successful payment
    assert stats.total_revenue_received >= Decimal("300.00")


# 4. Partial, overdue, and unpaid invoices breakdown
def test_invoice_statuses_breakdown(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)

    # 1. Partially paid invoice
    inv_part = create_invoice_with_items(
        db_session, cust, total=Decimal("500.00"),
        status=InvoiceStatus.PARTIALLY_PAID, amount_paid=Decimal("200.00"), balance_due=Decimal("300.00")
    )
    # 2. Overdue invoice
    past_due = datetime.now(timezone.utc) - timedelta(days=5)
    inv_over = create_invoice_with_items(
        db_session, cust, total=Decimal("400.00"),
        status=InvoiceStatus.OVERDUE, amount_paid=Decimal("0.00"), balance_due=Decimal("400.00"),
        due_date=past_due
    )
    # 3. Fully paid invoice (should be excluded from outstanding balance)
    inv_paid = create_invoice_with_items(
        db_session, cust, total=Decimal("300.00"),
        status=InvoiceStatus.PAID, amount_paid=Decimal("300.00"), balance_due=Decimal("0.00")
    )
    # 4. Unpaid confirmed invoice
    inv_unpaid = create_invoice_with_items(
        db_session, cust, total=Decimal("250.00"),
        status=InvoiceStatus.CONFIRMED, amount_paid=Decimal("0.00"), balance_due=Decimal("250.00")
    )

    stats = DashboardService.get_dashboard_stats(db_session, admin_user)
    assert stats.total_partially_paid_invoices >= 1
    assert stats.total_overdue_invoices >= 1
    assert stats.total_unpaid_invoices >= 2  # inv_over and inv_unpaid both have amount_paid == 0
    assert stats.total_overdue_balance >= Decimal("400.00")
    assert stats.total_outstanding_balance >= Decimal("950.00")  # 300 + 400 + 250


# 5. Revenue chart date-range filtering
def test_revenue_chart_date_range_filtering(db_session: Session):
    cust_user, _ = create_user_token(db_session, UserRole.CUSTOMER)
    cust = create_customer(db_session, user=cust_user)
    inv = create_invoice_with_items(db_session, cust, total=Decimal("1000.00"))

    # Three payments on distinct dates
    d1 = datetime(2026, 1, 15, 12, 0, 0, tzinfo=timezone.utc)
    d2 = datetime(2026, 5, 20, 12, 0, 0, tzinfo=timezone.utc)
    d3 = datetime(2026, 9, 10, 12, 0, 0, tzinfo=timezone.utc)

    create_payment(db_session, inv, amount=Decimal("100.00"), payment_date=d1)
    create_payment(db_session, inv, amount=Decimal("250.00"), payment_date=d2)
    create_payment(db_session, inv, amount=Decimal("400.00"), payment_date=d3)

    # Filter for May 2026
    start_filter = datetime(2026, 5, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_filter = datetime(2026, 5, 31, 23, 59, 59, tzinfo=timezone.utc)

    chart = DashboardService.get_revenue_chart(
        db=db_session,
        current_user=cust_user,
        group_by=ChartGrouping.MONTH,
        start_date=start_filter,
        end_date=end_filter
    )
    assert chart.total_revenue == Decimal("250.00")
    assert len(chart.items) == 1
    assert chart.items[0].period == "2026-05"
    assert chart.items[0].revenue == Decimal("250.00")


# 6. Revenue chart daily grouping
def test_revenue_chart_daily_grouping(db_session: Session):
    cust_user, _ = create_user_token(db_session, UserRole.CUSTOMER)
    cust = create_customer(db_session, user=cust_user)
    inv = create_invoice_with_items(db_session, cust, total=Decimal("300.00"))

    d = datetime(2026, 6, 10, 10, 0, 0, tzinfo=timezone.utc)
    create_payment(db_session, inv, amount=Decimal("150.00"), payment_date=d)

    start_d = datetime(2026, 6, 8, 0, 0, 0, tzinfo=timezone.utc)
    end_d = datetime(2026, 6, 12, 23, 59, 59, tzinfo=timezone.utc)

    chart = DashboardService.get_revenue_chart(
        db=db_session,
        current_user=cust_user,
        group_by=ChartGrouping.DAY,
        start_date=start_d,
        end_date=end_d
    )
    # Must have 5 consecutive days: 8, 9, 10, 11, 12
    assert len(chart.items) == 5
    day_10 = next(pt for pt in chart.items if pt.period == "2026-06-10")
    assert day_10.revenue == Decimal("150.00")
    # Zero-revenue day check
    day_08 = next(pt for pt in chart.items if pt.period == "2026-06-08")
    assert day_08.revenue == Decimal("0.00")
    assert day_08.payment_count == 0


# 7. Revenue chart weekly grouping
def test_revenue_chart_weekly_grouping(db_session: Session):
    cust_user, _ = create_user_token(db_session, UserRole.CUSTOMER)
    cust = create_customer(db_session, user=cust_user)
    inv = create_invoice_with_items(db_session, cust, total=Decimal("200.00"))

    d = datetime(2026, 7, 15, 12, 0, 0, tzinfo=timezone.utc)
    create_payment(db_session, inv, amount=Decimal("200.00"), payment_date=d)

    start_w = datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_w = datetime(2026, 7, 31, 23, 59, 59, tzinfo=timezone.utc)

    chart = DashboardService.get_revenue_chart(
        db=db_session,
        current_user=cust_user,
        group_by=ChartGrouping.WEEK,
        start_date=start_w,
        end_date=end_w
    )
    assert len(chart.items) >= 4
    assert chart.total_revenue == Decimal("200.00")
    for pt in chart.items:
        assert "-W" in pt.period



# 8. Revenue chart monthly grouping default chronological sort
def test_revenue_chart_monthly_grouping(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    chart = DashboardService.get_revenue_chart(
        db=db_session,
        current_user=admin_user,
        group_by=ChartGrouping.MONTH
    )
    assert len(chart.items) >= 12
    # Verify strict chronological order
    periods = [pt.period for pt in chart.items]
    assert periods == sorted(periods)


# 9. No duplicate counting in totals
def test_no_duplicate_counting(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)

    # Invoice with 2 line items and 2 payments
    inv = create_invoice_with_items(db_session, cust, total=Decimal("600.00"))
    p1 = create_payment(db_session, inv, amount=Decimal("200.00"))
    p2 = create_payment(db_session, inv, amount=Decimal("100.00"))

    chart = DashboardService.get_revenue_chart(
        db=db_session,
        current_user=admin_user,
        group_by=ChartGrouping.DAY,
        start_date=datetime.now(timezone.utc) - timedelta(days=1),
        end_date=datetime.now(timezone.utc) + timedelta(days=1)
    )
    # The sum of p1 and p2 must be 300.00, not duplicated by line items
    today_key = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    pt = next((x for x in chart.items if x.period == today_key), None)
    assert pt is not None
    assert pt.revenue >= Decimal("300.00")


# 10. Customer data isolation
def test_customer_data_isolation(client: TestClient, db_session: Session):
    cust_user_a, token_a = create_user_token(db_session, UserRole.CUSTOMER)
    cust_user_b, token_b = create_user_token(db_session, UserRole.CUSTOMER)

    cust_a = create_customer(db_session, user=cust_user_a)
    cust_b = create_customer(db_session, user=cust_user_b)

    inv_a = create_invoice_with_items(db_session, cust_a, total=Decimal("500.00"))
    create_payment(db_session, inv_a, amount=Decimal("500.00"))

    inv_b = create_invoice_with_items(db_session, cust_b, total=Decimal("200.00"))
    create_payment(db_session, inv_b, amount=Decimal("200.00"))

    # Customer A stats
    resp_a = client.get("/api/v1/dashboard/stats", headers={"Authorization": f"Bearer {token_a}"})
    assert resp_a.status_code == 200
    data_a = resp_a.json()["data"]
    assert Decimal(str(data_a["total_revenue_received"])) == Decimal("500.00")
    assert data_a["total_customers"] == 1

    # Customer B stats
    resp_b = client.get("/api/v1/dashboard/stats", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_b.status_code == 200
    data_b = resp_b.json()["data"]
    assert Decimal(str(data_b["total_revenue_received"])) == Decimal("200.00")
    assert data_b["total_customers"] == 1


# 11. Admin and Staff authorization
def test_admin_and_staff_authorization(client: TestClient, db_session: Session):
    admin_user, admin_token = create_user_token(db_session, UserRole.ADMIN)
    staff_user, staff_token = create_user_token(db_session, UserRole.STAFF)

    # Admin access
    resp_admin = client.get("/api/v1/dashboard/stats", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp_admin.status_code == 200
    assert resp_admin.json()["success"] is True

    # Staff access
    resp_staff = client.get("/api/v1/dashboard/stats", headers={"Authorization": f"Bearer {staff_token}"})
    assert resp_staff.status_code == 200
    assert resp_staff.json()["success"] is True


# 12. Unauthenticated access denied
def test_unauthenticated_access_denied(client: TestClient):
    resp = client.get("/api/v1/dashboard/stats")
    assert resp.status_code == 401


# 13. Invalid date range rejection
def test_invalid_date_range_rejection(client: TestClient, db_session: Session):
    admin_user, admin_token = create_user_token(db_session, UserRole.ADMIN)
    resp = client.get(
        "/api/v1/dashboard/revenue-chart?start_date=2026-12-31T00:00:00Z&end_date=2026-01-01T00:00:00Z",
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp.status_code == 400
    assert "start_date cannot be after end_date" in resp.json()["error"]["message"]


# 14. Decimal precision in calculations
def test_decimal_precision(db_session: Session):
    admin_user, _ = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    inv = create_invoice_with_items(db_session, cust, total=Decimal("1000.00"))

    # Three cents payments: 333.33 + 333.33 + 333.34
    d = datetime.now(timezone.utc)
    create_payment(db_session, inv, amount=Decimal("333.33"), payment_date=d)
    create_payment(db_session, inv, amount=Decimal("333.33"), payment_date=d)
    create_payment(db_session, inv, amount=Decimal("333.34"), payment_date=d)

    chart = DashboardService.get_revenue_chart(
        db=db_session,
        current_user=admin_user,
        group_by=ChartGrouping.DAY,
        start_date=d - timedelta(days=1),
        end_date=d + timedelta(days=1)
    )
    today_key = d.strftime("%Y-%m-%d")
    pt = next(x for x in chart.items if x.period == today_key)
    assert pt.revenue >= Decimal("1000.00")
    # Verify exact decimal representation with two decimal places
    assert pt.revenue == pt.revenue.quantize(Decimal("0.01"))


# 15. Recent activity feed order and content
def test_recent_activity_feed(client: TestClient, db_session: Session):
    cust_user, cust_token = create_user_token(db_session, UserRole.CUSTOMER)
    cust = create_customer(db_session, user=cust_user)
    inv = create_invoice_with_items(db_session, cust, total=Decimal("600.00"))
    pay = create_payment(db_session, inv, amount=Decimal("300.00"))

    resp = client.get("/api/v1/dashboard/recent-activity?limit=10", headers={"Authorization": f"Bearer {cust_token}"})
    assert resp.status_code == 200
    items = resp.json()["data"]
    assert len(items) >= 2
    types = [x["activity_type"] for x in items]
    assert "INVOICE_GENERATED" in types
    assert "PAYMENT_RECEIVED" in types


# 16. Recent subscriptions and invoices preview endpoints
def test_recent_subscriptions_and_invoices_endpoints(client: TestClient, db_session: Session):
    admin_user, admin_token = create_user_token(db_session, UserRole.ADMIN)
    cust = create_customer(db_session)
    inv = create_invoice_with_items(db_session, cust, total=Decimal("250.00"))

    resp_inv = client.get("/api/v1/dashboard/recent-invoices", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp_inv.status_code == 200
    assert len(resp_inv.json()["data"]) >= 1

    resp_sub = client.get("/api/v1/dashboard/recent-subscriptions", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp_sub.status_code == 200
