from datetime import datetime, timezone, timedelta
from decimal import Decimal
import logging
from typing import List, Optional, Tuple
import uuid
from sqlalchemy import select, func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.models.customer import Customer
from app.models.enums import BillingInterval, SubscriptionStatus, UserRole
from app.models.product import Plan, Product
from app.models.subscription import Subscription, SubscriptionItem
from app.models.user import User
from app.schemas.subscription import (
    SubscriptionCreate,
    SubscriptionItemResponse,
    SubscriptionResponse,
    SubscriptionUpdate,
)
from app.services.billing_service import BillingService
from app.services.tax_service import TaxService

logger = logging.getLogger("billsync.subscriptions")


class SubscriptionService:
    """Service layer managing subscription lifecycles, plan rules, item snapshots, and access control."""

    @classmethod
    def to_response(cls, sub: Subscription) -> SubscriptionResponse:
        """Converts Subscription ORM model into unified SubscriptionResponse."""
        cust_name = sub.customer.name if sub.customer else None
        plan_name = sub.plan.name if sub.plan else None
        b_interval = sub.plan.billing_interval if sub.plan else None

        item_responses: List[SubscriptionItemResponse] = []
        for it in sub.items:
            p_name = it.product.name if it.product else None
            item_responses.append(SubscriptionItemResponse(
                id=it.id,
                subscription_id=it.subscription_id,
                product_id=it.product_id,
                product_name=p_name,
                quantity=it.quantity,
                unit_price=it.unit_price,
            ))

        return SubscriptionResponse(
            id=sub.id,
            subscription_number=sub.subscription_number,
            customer_id=sub.customer_id,
            customer_name=cust_name,
            plan_id=sub.plan_id,
            plan_name=plan_name,
            billing_interval=b_interval,
            quotation_id=sub.quotation_id,
            status=sub.status,
            start_date=sub.start_date,
            end_date=sub.end_date,
            next_billing_date=sub.next_billing_date,
            payment_terms=sub.payment_terms,
            created_at=sub.created_at,
            updated_at=sub.updated_at,
            items=item_responses,
        )

    @classmethod
    def create_subscription(
        cls,
        db: Session,
        payload: SubscriptionCreate,
        current_user: User
    ) -> Subscription:
        """Creates a new subscription with pricing plan association and locked line items."""
        if current_user.role == UserRole.CUSTOMER:
            raise ForbiddenException("Customers are not permitted to provision subscriptions directly.")

        customer = db.get(Customer, payload.customer_id)
        if not customer:
            raise NotFoundException(f"Customer with ID {payload.customer_id} not found.")

        plan = db.get(Plan, payload.plan_id)
        if not plan:
            raise NotFoundException(f"Subscription plan with ID {payload.plan_id} not found.")
        if not plan.is_active:
            raise BadRequestException(f"Subscription plan '{plan.name}' is inactive.")

        now = datetime.now(timezone.utc)
        sub_number = payload.subscription_number or f"SUB-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

        existing_num = db.scalar(select(Subscription).where(Subscription.subscription_number == sub_number))
        if existing_num:
            raise ConflictException(f"Subscription with number '{sub_number}' already exists.")

        start_date = payload.start_date or now
        if payload.end_date and payload.end_date <= start_date:
            raise BadRequestException("Subscription end_date must be strictly after start_date.")

        # Next billing date initialized to start_date for recurring billing readiness
        next_billing_date = start_date if payload.status == SubscriptionStatus.ACTIVE else None

        subscription = Subscription(
            subscription_number=sub_number,
            customer_id=customer.id,
            plan_id=plan.id,
            quotation_id=payload.quotation_id,
            status=payload.status,
            start_date=start_date,
            end_date=payload.end_date,
            next_billing_date=next_billing_date,
            payment_terms=payload.payment_terms
        )
        db.add(subscription)
        db.flush()

        # Populate subscription items
        if payload.items and len(payload.items) > 0:
            for it in payload.items:
                prod = db.get(Product, it.product_id)
                if not prod:
                    raise NotFoundException(f"Product with ID {it.product_id} not found.")
                if it.quantity <= 0:
                    raise BadRequestException(f"Quantity must be greater than zero. Received {it.quantity}.")
                if it.unit_price < Decimal("0.00"):
                    raise BadRequestException("Unit price cannot be negative.")
                sub_item = SubscriptionItem(
                    subscription_id=subscription.id,
                    product_id=prod.id,
                    quantity=it.quantity,
                    unit_price=TaxService.to_decimal(it.unit_price, "Unit price")
                )
                db.add(sub_item)
        else:
            # Default single line item derived from plan product
            sub_item = SubscriptionItem(
                subscription_id=subscription.id,
                product_id=plan.product_id,
                quantity=plan.minimum_quantity,
                unit_price=plan.price
            )
            db.add(sub_item)

        db.commit()
        db.refresh(subscription)
        return subscription

    @classmethod
    def get_subscription_by_id(
        cls,
        db: Session,
        subscription_id: uuid.UUID,
        current_user: User
    ) -> Subscription:
        """Retrieves subscription with customer isolation check."""
        stmt = (
            select(Subscription)
            .where(Subscription.id == subscription_id)
            .options(
                selectinload(Subscription.customer),
                selectinload(Subscription.plan),
                selectinload(Subscription.items).selectinload(SubscriptionItem.product)
            )
        )
        subscription = db.scalars(stmt).first()
        if not subscription:
            raise NotFoundException(f"Subscription with ID {subscription_id} not found.")

        if current_user.role == UserRole.CUSTOMER:
            if not subscription.customer or subscription.customer.user_id != current_user.id:
                raise ForbiddenException("You do not have access to this subscription.")

        return subscription

    @classmethod
    def list_subscriptions(
        cls,
        db: Session,
        current_user: User,
        customer_id: Optional[uuid.UUID] = None,
        status: Optional[SubscriptionStatus] = None,
        plan_id: Optional[uuid.UUID] = None,
        search: Optional[str] = None,
        page: int = 1,
        size: int = 20
    ) -> Tuple[List[Subscription], int]:
        """Lists subscriptions with customer ownership filtering."""
        stmt = (
            select(Subscription)
            .options(
                selectinload(Subscription.customer),
                selectinload(Subscription.plan),
                selectinload(Subscription.items).selectinload(SubscriptionItem.product)
            )
        )

        if current_user.role == UserRole.CUSTOMER:
            stmt = stmt.join(Subscription.customer).where(Customer.user_id == current_user.id)
        elif customer_id:
            stmt = stmt.where(Subscription.customer_id == customer_id)

        if status:
            stmt = stmt.where(Subscription.status == status)

        if plan_id:
            stmt = stmt.where(Subscription.plan_id == plan_id)

        if search:
            search_pat = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Subscription.subscription_number.ilike(search_pat),
                    Subscription.customer.has(Customer.name.ilike(search_pat))
                )
            )

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = db.scalar(total_stmt) or 0

        stmt = stmt.order_by(Subscription.created_at.desc()).offset((page - 1) * size).limit(size)
        items = list(db.scalars(stmt).all())
        return items, total

    # -------------------------------------------------------------------------
    # Lifecycle Transitions
    # -------------------------------------------------------------------------

    @classmethod
    def confirm_subscription(cls, db: Session, subscription_id: uuid.UUID, current_user: User) -> Subscription:
        """Transitions subscription to CONFIRMED."""
        sub = cls.get_subscription_by_id(db, subscription_id, current_user)
        if sub.status in (SubscriptionStatus.ACTIVE, SubscriptionStatus.CLOSED):
            raise BadRequestException(f"Cannot confirm subscription with status '{sub.status.value}'.")

        sub.status = SubscriptionStatus.CONFIRMED
        db.commit()
        db.refresh(sub)
        logger.info("Subscription %s confirmed", sub.subscription_number)
        return sub

    @classmethod
    def activate_subscription(cls, db: Session, subscription_id: uuid.UUID, current_user: User) -> Subscription:
        """Transitions subscription to ACTIVE and sets next billing date."""
        sub = cls.get_subscription_by_id(db, subscription_id, current_user)
        if sub.status == SubscriptionStatus.CLOSED:
            raise BadRequestException("Cannot activate a permanently closed subscription.")

        now = datetime.now(timezone.utc)
        sub.status = SubscriptionStatus.ACTIVE
        if not sub.start_date:
            sub.start_date = now
        if not sub.next_billing_date:
            sub.next_billing_date = sub.start_date

        db.commit()
        db.refresh(sub)
        logger.info("Subscription %s activated", sub.subscription_number)
        return sub

    @classmethod
    def pause_subscription(cls, db: Session, subscription_id: uuid.UUID, current_user: User) -> Subscription:
        """Pauses an active subscription if plan policy allows pausing."""
        sub = cls.get_subscription_by_id(db, subscription_id, current_user)
        if sub.status != SubscriptionStatus.ACTIVE:
            raise BadRequestException(f"Cannot pause subscription with status '{sub.status.value}'. Must be ACTIVE.")

        if sub.plan and not sub.plan.allow_pause:
            raise BadRequestException(f"Plan '{sub.plan.name}' does not allow pausing.")

        sub.status = SubscriptionStatus.PAUSED
        db.commit()
        db.refresh(sub)
        logger.info("Subscription %s paused", sub.subscription_number)
        return sub

    @classmethod
    def resume_subscription(cls, db: Session, subscription_id: uuid.UUID, current_user: User) -> Subscription:
        """Resumes a paused subscription and aligns upcoming billing date."""
        sub = cls.get_subscription_by_id(db, subscription_id, current_user)
        if sub.status != SubscriptionStatus.PAUSED:
            raise BadRequestException(f"Cannot resume subscription with status '{sub.status.value}'. Must be PAUSED.")

        now = datetime.now(timezone.utc)
        sub.status = SubscriptionStatus.ACTIVE
        if not sub.next_billing_date or sub.next_billing_date < now:
            sub.next_billing_date = now

        db.commit()
        db.refresh(sub)
        logger.info("Subscription %s resumed", sub.subscription_number)
        return sub

    @classmethod
    def renew_subscription(cls, db: Session, subscription_id: uuid.UUID, current_user: User) -> Subscription:
        """Renews / extends subscription contract based on plan renewal policy."""
        sub = cls.get_subscription_by_id(db, subscription_id, current_user)
        if sub.plan and not sub.plan.allow_renewal:
            raise BadRequestException(f"Plan '{sub.plan.name}' does not allow renewal.")

        now = datetime.now(timezone.utc)
        interval = sub.plan.billing_interval if sub.plan else BillingInterval.MONTHLY
        base_date = sub.end_date if (sub.end_date and sub.end_date > now) else now

        sub.end_date = BillingService.calculate_next_billing_period_end(base_date, interval)
        sub.status = SubscriptionStatus.ACTIVE
        if not sub.next_billing_date or sub.next_billing_date < now:
            sub.next_billing_date = now

        db.commit()
        db.refresh(sub)
        logger.info("Subscription %s renewed until %s", sub.subscription_number, sub.end_date.isoformat())
        return sub

    @classmethod
    def close_subscription(cls, db: Session, subscription_id: uuid.UUID, current_user: User) -> Subscription:
        """Permanently closes / terminates a subscription."""
        sub = cls.get_subscription_by_id(db, subscription_id, current_user)
        if sub.status == SubscriptionStatus.CLOSED:
            return sub

        # Customers must adhere to plan early-close policy; Admin/Staff may always close
        if current_user.role == UserRole.CUSTOMER and sub.plan and not sub.plan.allow_early_close:
            raise BadRequestException(f"Plan '{sub.plan.name}' does not permit early cancellation.")

        sub.status = SubscriptionStatus.CLOSED
        db.commit()
        db.refresh(sub)
        logger.info("Subscription %s closed", sub.subscription_number)
        return sub
