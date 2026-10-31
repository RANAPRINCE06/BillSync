from datetime import datetime, timezone, timedelta
from decimal import Decimal
import logging
from typing import Any, Dict, List, Optional
import uuid
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import BadRequestException, ForbiddenException
from app.models.customer import Customer
from app.models.enums import InvoiceStatus, PaymentStatus, SubscriptionStatus, UserRole
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.dashboard import (
    ActivityType,
    ChartGrouping,
    DashboardStatsResponse,
    RecentActivityItem,
    RecentActivityResponse,
    RevenueChartPoint,
    RevenueChartResponse,
)

logger = logging.getLogger("billsync.dashboard")


class DashboardService:
    """Service layer managing dashboard metrics, revenue charts, and financial activity feeds."""

    @classmethod
    def _get_customer_id_for_user(cls, db: Session, user: User) -> Optional[uuid.UUID]:
        """Resolves Customer ID associated with a user if role is CUSTOMER."""
        if user.role != UserRole.CUSTOMER:
            return None
        customer = db.scalar(select(Customer).where(Customer.user_id == user.id))
        return customer.id if customer else None

    @classmethod
    def get_dashboard_stats(cls, db: Session, current_user: User) -> DashboardStatsResponse:
        """
        Calculates real-time, database-backed operational and financial metrics.
        Scopes strictly to customer's own data if authenticated user is a CUSTOMER.
        """
        is_customer = current_user.role == UserRole.CUSTOMER
        cust_id = cls._get_customer_id_for_user(db, current_user) if is_customer else None

        # If user is a customer but has no customer record yet, return clean zeroes
        if is_customer and not cust_id:
            return DashboardStatsResponse()

        # 1. Total customers
        if is_customer:
            total_customers = 1
        else:
            total_customers = db.scalar(select(func.count(Customer.id))) or 0

        # 2. Total active subscriptions
        sub_stmt = select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
        if is_customer:
            sub_stmt = sub_stmt.where(Subscription.customer_id == cust_id)
        total_active_subs = db.scalar(sub_stmt) or 0

        # 3. Total invoices
        inv_stmt = select(func.count(Invoice.id))
        if is_customer:
            inv_stmt = inv_stmt.where(Invoice.customer_id == cust_id)
        total_invoices = db.scalar(inv_stmt) or 0

        # 4. Total revenue received (Sum of SUCCESSFUL payments, excluding refunded)
        pay_stmt = select(func.sum(Payment.amount)).where(Payment.status == PaymentStatus.SUCCESSFUL)
        if is_customer:
            pay_stmt = pay_stmt.select_from(Payment).join(Invoice, Payment.invoice_id == Invoice.id).where(
                Invoice.customer_id == cust_id
            )
        total_revenue_scalar = db.scalar(pay_stmt)
        total_revenue = (total_revenue_scalar or Decimal("0.00")).quantize(Decimal("0.01"))

        # 5. Total outstanding balance (Non-cancelled, unpaid/partially-paid invoices with balance_due > 0)
        out_stmt = select(func.sum(Invoice.balance_due)).where(
            Invoice.status.notin_([InvoiceStatus.CANCELLED, InvoiceStatus.PAID]),
            Invoice.balance_due > Decimal("0.00")
        )
        if is_customer:
            out_stmt = out_stmt.where(Invoice.customer_id == cust_id)
        out_scalar = db.scalar(out_stmt)
        total_outstanding = (out_scalar or Decimal("0.00")).quantize(Decimal("0.01"))

        # 6. Total overdue invoice balance
        od_bal_stmt = select(func.sum(Invoice.balance_due)).where(
            Invoice.status == InvoiceStatus.OVERDUE,
            Invoice.balance_due > Decimal("0.00")
        )
        if is_customer:
            od_bal_stmt = od_bal_stmt.where(Invoice.customer_id == cust_id)
        od_bal_scalar = db.scalar(od_bal_stmt)
        total_overdue_balance = (od_bal_scalar or Decimal("0.00")).quantize(Decimal("0.01"))

        # 7. Total overdue invoices count
        od_cnt_stmt = select(func.count(Invoice.id)).where(Invoice.status == InvoiceStatus.OVERDUE)
        if is_customer:
            od_cnt_stmt = od_cnt_stmt.where(Invoice.customer_id == cust_id)
        total_overdue_count = db.scalar(od_cnt_stmt) or 0

        # 8. Total partially paid invoices count
        pp_stmt = select(func.count(Invoice.id)).where(Invoice.status == InvoiceStatus.PARTIALLY_PAID)
        if is_customer:
            pp_stmt = pp_stmt.where(Invoice.customer_id == cust_id)
        total_partially_paid = db.scalar(pp_stmt) or 0

        # 9. Total unpaid invoices count (Confirmed or Overdue with 0 amount_paid)
        unpaid_stmt = select(func.count(Invoice.id)).where(
            Invoice.status.in_([InvoiceStatus.CONFIRMED, InvoiceStatus.OVERDUE]),
            Invoice.amount_paid == Decimal("0.00")
        )
        if is_customer:
            unpaid_stmt = unpaid_stmt.where(Invoice.customer_id == cust_id)
        total_unpaid = db.scalar(unpaid_stmt) or 0

        return DashboardStatsResponse(
            total_customers=total_customers,
            total_active_subscriptions=total_active_subs,
            total_invoices=total_invoices,
            total_revenue_received=total_revenue,
            total_outstanding_balance=total_outstanding,
            total_overdue_balance=total_overdue_balance,
            total_overdue_invoices=total_overdue_count,
            total_partially_paid_invoices=total_partially_paid,
            total_unpaid_invoices=total_unpaid,
            # Frontend aliases
            active_subscriptions=total_active_subs,
            total_customers_count=total_customers,
            revenue_received=total_revenue,
            outstanding_payments=total_outstanding,
            overdue_invoices=total_overdue_count
        )

    @classmethod
    def get_revenue_chart(
        cls,
        db: Session,
        current_user: User,
        group_by: ChartGrouping = ChartGrouping.MONTH,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> RevenueChartResponse:
        """
        Builds chronological revenue series grouped by day, week, or month.
        Includes zero-revenue buckets to ensure continuous chart curves.
        """
        is_customer = current_user.role == UserRole.CUSTOMER
        cust_id = cls._get_customer_id_for_user(db, current_user) if is_customer else None

        if is_customer and not cust_id:
            return RevenueChartResponse(group_by=group_by, items=[], total_revenue=Decimal("0.00"))

        now_utc = datetime.now(timezone.utc)

        # 1. Date Range Validation & Sensible Chronological Defaults
        if start_date and end_date and start_date > end_date:
            raise BadRequestException("start_date cannot be after end_date.")

        if not end_date:
            end_date = now_utc

        if not start_date:
            if group_by == ChartGrouping.DAY:
                start_date = end_date - timedelta(days=29)
            elif group_by == ChartGrouping.WEEK:
                start_date = end_date - timedelta(weeks=11)
            else:  # MONTH
                # Past 12 calendar months
                y = end_date.year
                m = end_date.month
                for _ in range(11):
                    m -= 1
                    if m == 0:
                        m = 12
                        y -= 1
                start_date = datetime(y, m, 1, 0, 0, 0, tzinfo=timezone.utc)

        # Normalize start to beginning of day, end to end of day
        s_date = datetime(start_date.year, start_date.month, start_date.day, 0, 0, 0, tzinfo=timezone.utc)
        e_date = datetime(end_date.year, end_date.month, end_date.day, 23, 59, 59, tzinfo=timezone.utc)

        # 2. Build Zero-Revenue Buckets Chronologically
        buckets: Dict[str, Dict[str, Any]] = {}

        if group_by == ChartGrouping.DAY:
            curr = s_date.date()
            stop = e_date.date()
            while curr <= stop:
                key = curr.strftime("%Y-%m-%d")
                buckets[key] = {
                    "period": key,
                    "month": curr.strftime("%b %d"),
                    "date": curr.isoformat(),
                    "revenue": Decimal("0.00"),
                    "payment_count": 0
                }
                curr += timedelta(days=1)

        elif group_by == ChartGrouping.WEEK:
            # Align to Monday of the starting week
            curr = s_date.date() - timedelta(days=s_date.weekday())
            stop = e_date.date()
            while curr <= stop:
                iso_y, iso_w, _ = curr.isocalendar()
                key = f"{iso_y}-W{iso_w:02d}"
                buckets[key] = {
                    "period": key,
                    "month": f"W{iso_w} ({curr.strftime('%b %d')})",
                    "date": curr.isoformat(),
                    "revenue": Decimal("0.00"),
                    "payment_count": 0
                }
                curr += timedelta(weeks=1)

        else:  # MONTH
            curr_y = s_date.year
            curr_m = s_date.month
            end_y = e_date.year
            end_m = e_date.month
            while (curr_y < end_y) or (curr_y == end_y and curr_m <= end_m):
                key = f"{curr_y:04d}-{curr_m:02d}"
                dt = datetime(curr_y, curr_m, 1)
                buckets[key] = {
                    "period": key,
                    "month": dt.strftime("%b %Y"),
                    "date": dt.date().isoformat(),
                    "revenue": Decimal("0.00"),
                    "payment_count": 0
                }
                curr_m += 1
                if curr_m > 12:
                    curr_m = 1
                    curr_y += 1

        # 3. Query Database for Successful Payments in Date Range
        stmt = (
            select(Payment)
            .where(
                Payment.status == PaymentStatus.SUCCESSFUL,
                Payment.payment_date >= s_date,
                Payment.payment_date <= e_date
            )
        )
        if is_customer:
            stmt = stmt.join(Invoice, Payment.invoice_id == Invoice.id).where(Invoice.customer_id == cust_id)

        payments = list(db.scalars(stmt).all())

        # 4. Aggregate Revenue into Chronological Buckets
        total_rev = Decimal("0.00")
        for p in payments:
            p_date = p.payment_date
            if group_by == ChartGrouping.DAY:
                key = p_date.strftime("%Y-%m-%d")
            elif group_by == ChartGrouping.WEEK:
                iso_y, iso_w, _ = p_date.isocalendar()
                key = f"{iso_y}-W{iso_w:02d}"
            else:
                key = f"{p_date.year:04d}-{p_date.month:02d}"

            if key in buckets:
                buckets[key]["revenue"] += p.amount
                buckets[key]["payment_count"] += 1
            else:
                # Outside pre-initialized range: add dynamically
                buckets[key] = {
                    "period": key,
                    "month": p_date.strftime("%b %Y") if group_by == ChartGrouping.MONTH else key,
                    "date": p_date.date().isoformat(),
                    "revenue": p.amount,
                    "payment_count": 1
                }
            total_rev += p.amount

        # 5. Build Sorted Output Points
        sorted_keys = sorted(buckets.keys())
        points = [
            RevenueChartPoint(
                period=buckets[k]["period"],
                month=buckets[k]["month"],
                date=buckets[k]["date"],
                revenue=buckets[k]["revenue"].quantize(Decimal("0.01")),
                payment_count=buckets[k]["payment_count"]
            )
            for k in sorted_keys
        ]

        return RevenueChartResponse(
            group_by=group_by,
            start_date=s_date,
            end_date=e_date,
            items=points,
            total_revenue=total_rev.quantize(Decimal("0.01"))
        )

    @classmethod
    def get_recent_activity(
        cls,
        db: Session,
        current_user: User,
        limit: int = 10
    ) -> RecentActivityResponse:
        """
        Gathers recent financial activities (invoices, payments, refunds, active subscriptions).
        Enforces customer isolation.
        """
        is_customer = current_user.role == UserRole.CUSTOMER
        cust_id = cls._get_customer_id_for_user(db, current_user) if is_customer else None

        if is_customer and not cust_id:
            return RecentActivityResponse(items=[], total=0)

        activities: List[RecentActivityItem] = []

        # A. Recent Invoices
        inv_stmt = (
            select(Invoice)
            .options(selectinload(Invoice.customer))
            .order_by(Invoice.issue_date.desc())
            .limit(limit)
        )
        if is_customer:
            inv_stmt = inv_stmt.where(Invoice.customer_id == cust_id)
        for inv in db.scalars(inv_stmt).all():
            c_name = inv.customer.name if inv.customer else "Client"
            activities.append(RecentActivityItem(
                id=inv.id,
                activity_type=ActivityType.INVOICE_GENERATED,
                reference=inv.invoice_number,
                title=f"Invoice Generated: {inv.invoice_number}",
                description=f"Invoice created for {c_name} with balance {inv.balance_due}",
                amount=inv.total,
                status=inv.status.value,
                customer_name=c_name,
                timestamp=inv.issue_date
            ))

        # B. Recent Successful Payments
        pay_stmt = (
            select(Payment)
            .options(selectinload(Payment.invoice).selectinload(Invoice.customer))
            .where(Payment.status == PaymentStatus.SUCCESSFUL)
            .order_by(Payment.payment_date.desc())
            .limit(limit)
        )
        if is_customer:
            pay_stmt = pay_stmt.join(Invoice, Payment.invoice_id == Invoice.id).where(Invoice.customer_id == cust_id)
        for p in db.scalars(pay_stmt).all():
            c_name = p.invoice.customer.name if (p.invoice and p.invoice.customer) else "Client"
            inv_num = p.invoice.invoice_number if p.invoice else ""
            activities.append(RecentActivityItem(
                id=p.id,
                activity_type=ActivityType.PAYMENT_RECEIVED,
                reference=p.payment_reference,
                title=f"Payment Received: {p.payment_reference}",
                description=f"Received {p.amount} via {p.payment_method.value} for {inv_num}",
                amount=p.amount,
                status=p.status.value,
                customer_name=c_name,
                timestamp=p.payment_date
            ))

        # C. Recent Refunds
        ref_stmt = (
            select(Payment)
            .options(selectinload(Payment.invoice).selectinload(Invoice.customer))
            .where(Payment.status == PaymentStatus.REFUNDED)
            .order_by(Payment.updated_at.desc())
            .limit(limit)
        )
        if is_customer:
            ref_stmt = ref_stmt.join(Invoice, Payment.invoice_id == Invoice.id).where(Invoice.customer_id == cust_id)
        for p in db.scalars(ref_stmt).all():
            c_name = p.invoice.customer.name if (p.invoice and p.invoice.customer) else "Client"
            activities.append(RecentActivityItem(
                id=p.id,
                activity_type=ActivityType.PAYMENT_REFUNDED,
                reference=p.payment_reference,
                title=f"Payment Refunded: {p.payment_reference}",
                description=f"Refunded {p.amount} for {c_name}",
                amount=p.amount,
                status=p.status.value,
                customer_name=c_name,
                timestamp=p.updated_at
            ))

        # D. Recent Active Subscriptions
        sub_stmt = (
            select(Subscription)
            .options(selectinload(Subscription.customer), selectinload(Subscription.plan))
            .where(Subscription.status == SubscriptionStatus.ACTIVE)
            .order_by(Subscription.created_at.desc())
            .limit(limit)
        )
        if is_customer:
            sub_stmt = sub_stmt.where(Subscription.customer_id == cust_id)
        for sub in db.scalars(sub_stmt).all():
            c_name = sub.customer.name if sub.customer else "Client"
            plan_name = sub.plan.name if sub.plan else "Subscription Plan"
            activities.append(RecentActivityItem(
                id=sub.id,
                activity_type=ActivityType.SUBSCRIPTION_ACTIVATED,
                reference=sub.subscription_number,
                title=f"Subscription Active: {sub.subscription_number}",
                description=f"{c_name} enrolled in {plan_name}",
                amount=sub.plan.price if sub.plan else None,
                status=sub.status.value,
                customer_name=c_name,
                timestamp=sub.created_at
            ))

        # Sort all combined activities chronologically descending
        activities.sort(key=lambda x: x.timestamp, reverse=True)
        top_activities = activities[:limit]

        return RecentActivityResponse(
            items=top_activities,
            total=len(top_activities)
        )

    @classmethod
    def get_recent_subscriptions(
        cls,
        db: Session,
        current_user: User,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Provides recent subscription cards matching DashboardPage.jsx format."""
        is_customer = current_user.role == UserRole.CUSTOMER
        cust_id = cls._get_customer_id_for_user(db, current_user) if is_customer else None

        if is_customer and not cust_id:
            return []

        stmt = (
            select(Subscription)
            .options(selectinload(Subscription.customer), selectinload(Subscription.plan))
            .order_by(Subscription.created_at.desc())
            .limit(limit)
        )
        if is_customer:
            stmt = stmt.where(Subscription.customer_id == cust_id)

        subs = list(db.scalars(stmt).all())
        return [
            {
                "id": str(s.id),
                "subscription_number": s.subscription_number,
                "customer_name": s.customer.name if s.customer else "—",
                "plan_name": s.plan.name if s.plan else "—",
                "status": s.status.value,
                "start_date": s.start_date.isoformat() if s.start_date else None,
                "next_billing_date": s.next_billing_date.isoformat() if s.next_billing_date else None,
            }
            for s in subs
        ]

    @classmethod
    def get_recent_invoices(
        cls,
        db: Session,
        current_user: User,
        limit: int = 5
    ) -> List[Dict[str, Any]]:
        """Provides recent invoices table rows matching DashboardPage.jsx format."""
        is_customer = current_user.role == UserRole.CUSTOMER
        cust_id = cls._get_customer_id_for_user(db, current_user) if is_customer else None

        if is_customer and not cust_id:
            return []

        stmt = (
            select(Invoice)
            .options(selectinload(Invoice.customer))
            .order_by(Invoice.issue_date.desc())
            .limit(limit)
        )
        if is_customer:
            stmt = stmt.where(Invoice.customer_id == cust_id)

        invoices = list(db.scalars(stmt).all())
        return [
            {
                "id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "customer_name": inv.customer.name if inv.customer else "—",
                "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
                "due_date": inv.due_date.isoformat() if inv.due_date else None,
                "total": float(inv.total),
                "balance_due": float(inv.balance_due),
                "status": inv.status.value,
            }
            for inv in invoices
        ]
