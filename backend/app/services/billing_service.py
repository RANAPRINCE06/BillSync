import calendar
from datetime import datetime, timezone, timedelta
from decimal import Decimal
import logging
from typing import List, Optional, Tuple
import uuid
from sqlalchemy import select, func, and_
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    BadRequestException,
    ConflictException,
    NotFoundException,
)
from app.models.enums import BillingInterval, SubscriptionStatus
from app.models.invoice import Invoice
from app.models.subscription import Subscription
from app.schemas.billing import (
    BillingRunRequest,
    BillingRunSummary,
    BillingStatusResponse,
    BillingSubscriptionResult,
)
from app.schemas.invoice import InvoiceGenerateRequest
from app.services.invoice_service import InvoiceService

logger = logging.getLogger("billsync.billing")


class BillingService:
    """Service managing recurring subscription billing runs and date automation."""

    @staticmethod
    def calculate_next_billing_period_end(
        start_date: datetime,
        interval: BillingInterval
    ) -> datetime:
        """
        Computes the exact billing period end date based on interval.
        Properly handles month-ends (e.g., Jan 31 -> Feb 28/29), leap years, and year transitions.
        """
        if interval == BillingInterval.DAILY:
            return start_date + timedelta(days=1)

        elif interval == BillingInterval.WEEKLY:
            return start_date + timedelta(days=7)

        elif interval == BillingInterval.MONTHLY:
            # Advance 1 month preserving month-end day
            year = start_date.year + (start_date.month // 12)
            month = (start_date.month % 12) + 1
            max_days = calendar.monthrange(year, month)[1]
            day = min(start_date.day, max_days)
            return start_date.replace(year=year, month=month, day=day)

        elif interval == BillingInterval.YEARLY:
            # Advance 1 year handling leap years (e.g., Feb 29 -> Feb 28 on non-leap years)
            year = start_date.year + 1
            max_days = calendar.monthrange(year, start_date.month)[1]
            day = min(start_date.day, max_days)
            return start_date.replace(year=year, day=day)

        return start_date + timedelta(days=30)

    @classmethod
    def get_billing_status(cls, db: Session, as_of: Optional[datetime] = None) -> BillingStatusResponse:
        """Overview of upcoming and currently due subscriptions."""
        now = as_of or datetime.now(timezone.utc)
        in_7_days = now + timedelta(days=7)
        in_30_days = now + timedelta(days=30)

        # Total active subscriptions
        total_active = db.scalar(
            select(func.count(Subscription.id)).where(Subscription.status == SubscriptionStatus.ACTIVE)
        ) or 0

        # Due now
        due_now = db.scalar(
            select(func.count(Subscription.id)).where(
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.next_billing_date <= now,
                Subscription.next_billing_date.is_not(None)
            )
        ) or 0

        # Due in next 7 days
        upcoming_7 = db.scalar(
            select(func.count(Subscription.id)).where(
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.next_billing_date > now,
                Subscription.next_billing_date <= in_7_days
            )
        ) or 0

        # Due in next 30 days
        upcoming_30 = db.scalar(
            select(func.count(Subscription.id)).where(
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.next_billing_date > now,
                Subscription.next_billing_date <= in_30_days
            )
        ) or 0

        return BillingStatusResponse(
            as_of=now,
            total_active_subscriptions=total_active,
            due_subscriptions_count=due_now,
            upcoming_7_days_count=upcoming_7,
            upcoming_30_days_count=upcoming_30
        )

    @classmethod
    def run_billing_cycle(
        cls,
        db: Session,
        request: BillingRunRequest
    ) -> BillingRunSummary:
        """
        Executes a recurring billing cycle.
        Finds due active subscriptions, generates invoices, and advances billing dates.
        Failure on one subscription never blocks others.
        """
        as_of = request.as_of_date or datetime.now(timezone.utc)

        # 1. Query due subscriptions
        stmt = (
            select(Subscription)
            .where(
                Subscription.status == SubscriptionStatus.ACTIVE,
                Subscription.next_billing_date <= as_of,
                Subscription.next_billing_date.is_not(None)
            )
            .options(
                selectinload(Subscription.plan),
                selectinload(Subscription.customer),
                selectinload(Subscription.items)
            )
        )

        if request.subscription_ids:
            stmt = stmt.where(Subscription.id.in_(request.subscription_ids))

        subscriptions = list(db.scalars(stmt).all())

        results: List[BillingSubscriptionResult] = []
        invoices_created = 0
        skipped = 0
        failed = 0

        for sub in subscriptions:
            # Check eligibility
            if sub.status != SubscriptionStatus.ACTIVE:
                skipped += 1
                results.append(BillingSubscriptionResult(
                    subscription_id=sub.id,
                    subscription_number=sub.subscription_number,
                    status="SKIPPED",
                    reason=f"Subscription status is {sub.status}, not ACTIVE."
                ))
                continue

            period_start = sub.next_billing_date or sub.start_date
            interval = sub.plan.billing_interval if sub.plan else BillingInterval.MONTHLY
            period_end = cls.calculate_next_billing_period_end(period_start, interval)

            # Check if subscription has already expired or reached end_date
            if sub.end_date and period_start >= sub.end_date:
                sub.status = SubscriptionStatus.EXPIRED
                db.commit()
                skipped += 1
                results.append(BillingSubscriptionResult(
                    subscription_id=sub.id,
                    subscription_number=sub.subscription_number,
                    status="SKIPPED",
                    reason=f"Subscription has reached its end_date of {sub.end_date.isoformat()}."
                ))
                continue

            # Pre-check for duplicate invoice
            existing_invoice = db.scalars(
                select(Invoice).where(
                    Invoice.subscription_id == sub.id,
                    Invoice.billing_period_start == period_start,
                    Invoice.billing_period_end == period_end
                )
            ).first()

            if existing_invoice:
                # Advance next_billing_date if requested to prevent getting stuck
                old_date = sub.next_billing_date
                if request.auto_advance_dates:
                    sub.next_billing_date = period_end
                    if sub.end_date and sub.next_billing_date >= sub.end_date:
                        sub.status = SubscriptionStatus.EXPIRED
                    db.commit()

                skipped += 1
                results.append(BillingSubscriptionResult(
                    subscription_id=sub.id,
                    subscription_number=sub.subscription_number,
                    status="SKIPPED",
                    invoice_id=existing_invoice.id,
                    invoice_number=existing_invoice.invoice_number,
                    billing_period_start=period_start,
                    billing_period_end=period_end,
                    total_amount=existing_invoice.total,
                    previous_next_billing_date=old_date,
                    new_next_billing_date=sub.next_billing_date,
                    reason="Invoice already exists for this billing period."
                ))
                continue

            # Process single subscription inside isolated transaction
            old_next_billing_date = sub.next_billing_date
            try:
                # Generate invoice using InvoiceService
                inv_req = InvoiceGenerateRequest(
                    subscription_id=sub.id,
                    billing_period_start=period_start,
                    billing_period_end=period_end,
                    tax_rate=request.default_tax_rate
                )
                invoice = InvoiceService.generate_invoice_for_subscription(
                    db=db,
                    payload=inv_req,
                    current_user=None  # System process
                )

                # Update next_billing_date
                if request.auto_advance_dates:
                    sub.next_billing_date = period_end
                    if sub.end_date and sub.next_billing_date >= sub.end_date:
                        sub.status = SubscriptionStatus.EXPIRED
                    db.commit()

                invoices_created += 1
                results.append(BillingSubscriptionResult(
                    subscription_id=sub.id,
                    subscription_number=sub.subscription_number,
                    status="SUCCESS",
                    invoice_id=invoice.id,
                    invoice_number=invoice.invoice_number,
                    billing_period_start=period_start,
                    billing_period_end=period_end,
                    total_amount=invoice.total,
                    previous_next_billing_date=old_next_billing_date,
                    new_next_billing_date=sub.next_billing_date
                ))

            except ConflictException as exc:
                db.rollback()
                skipped += 1
                results.append(BillingSubscriptionResult(
                    subscription_id=sub.id,
                    subscription_number=sub.subscription_number,
                    status="SKIPPED",
                    previous_next_billing_date=old_next_billing_date,
                    new_next_billing_date=old_next_billing_date,
                    reason=exc.message
                ))

            except Exception as exc:
                db.rollback()
                failed += 1
                err_msg = str(getattr(exc, "message", exc))
                logger.warning(
                    "Recurring billing failed for subscription %s: %s",
                    sub.subscription_number, err_msg
                )
                results.append(BillingSubscriptionResult(
                    subscription_id=sub.id,
                    subscription_number=sub.subscription_number,
                    status="FAILED",
                    previous_next_billing_date=old_next_billing_date,
                    new_next_billing_date=old_next_billing_date,
                    reason=err_msg
                ))

        return BillingRunSummary(
            processed=len(subscriptions),
            invoices_created=invoices_created,
            skipped=skipped,
            failed=failed,
            results=results
        )
