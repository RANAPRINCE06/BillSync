from datetime import datetime, timezone, timedelta
from decimal import Decimal
from typing import List, Optional, Tuple
import uuid
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.exceptions import (
    BadRequestException,
    ConflictException,
    ForbiddenException,
    NotFoundException,
)
from app.models.customer import Customer
from app.models.enums import BillingInterval, InvoiceStatus, UserRole
from app.models.invoice import Invoice, InvoiceItem
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.invoice import InvoiceGenerateRequest
from app.services.discount_service import DiscountService
from app.services.tax_service import TaxService


class InvoiceService:
    """Service layer managing invoice generation, calculation, and access control."""

    @staticmethod
    def _compute_billing_period_end(start_date: datetime, interval: BillingInterval) -> datetime:
        """Calculate billing period end date based on plan interval."""
        if interval == BillingInterval.DAILY:
            return start_date + timedelta(days=1)
        elif interval == BillingInterval.WEEKLY:
            return start_date + timedelta(weeks=1)
        elif interval == BillingInterval.MONTHLY:
            return start_date + timedelta(days=30)
        elif interval == BillingInterval.YEARLY:
            return start_date + timedelta(days=365)
        return start_date + timedelta(days=30)

    @classmethod
    def generate_invoice_for_subscription(
        cls,
        db: Session,
        payload: InvoiceGenerateRequest,
        current_user: Optional[User] = None
    ) -> Invoice:
        """
        Generate an invoice for a subscription with precise financial calculation,
        duplicate period prevention, and historical item snapshots.
        """
        # 1. Retrieve Subscription with Plan, Customer, and Items
        stmt = (
            select(Subscription)
            .where(Subscription.id == payload.subscription_id)
            .options(
                selectinload(Subscription.customer),
                selectinload(Subscription.plan),
                selectinload(Subscription.items)
            )
        )
        subscription = db.scalars(stmt).first()
        if not subscription:
            raise NotFoundException(f"Subscription with ID {payload.subscription_id} not found.")

        # 2. Authorization check if requested by a customer
        if current_user and current_user.role == UserRole.CUSTOMER:
            if not subscription.customer or subscription.customer.user_id != current_user.id:
                raise ForbiddenException("You can only generate invoices for your own subscriptions.")

        # 3. Validate Customer
        if not subscription.customer:
            raise BadRequestException("Cannot generate invoice: Subscription has no associated customer.")

        # 4. Validate Subscription Items
        if not subscription.items or len(subscription.items) == 0:
            raise BadRequestException("Cannot generate invoice: Subscription contains no billable items.")

        # 5. Determine Dates
        issue_date = payload.issue_date or datetime.now(timezone.utc)
        due_date = payload.due_date or (issue_date + timedelta(days=15))

        billing_period_start = payload.billing_period_start or subscription.next_billing_date or subscription.start_date
        if payload.billing_period_end:
            billing_period_end = payload.billing_period_end
        else:
            billing_period_end = cls._compute_billing_period_end(
                billing_period_start,
                subscription.plan.billing_interval if subscription.plan else BillingInterval.MONTHLY
            )

        if billing_period_end <= billing_period_start:
            raise BadRequestException("Billing period end date must be after billing period start date.")

        # 6. Duplicate Invoice Prevention Check
        existing_invoice = db.scalars(
            select(Invoice).where(
                Invoice.subscription_id == subscription.id,
                Invoice.billing_period_start == billing_period_start,
                Invoice.billing_period_end == billing_period_end
            )
        ).first()

        if existing_invoice:
            raise ConflictException(
                message=(
                    f"An invoice already exists for subscription {subscription.id} for the billing period "
                    f"{billing_period_start.strftime('%Y-%m-%d')} to {billing_period_end.strftime('%Y-%m-%d')}."
                ),
                details={
                    "existing_invoice_id": str(existing_invoice.id),
                    "invoice_number": existing_invoice.invoice_number
                }
            )

        # 7. Calculate Line Items and Historical Snapshots using TaxService
        tax_rate = TaxService.validate_tax_rate(payload.tax_rate)
        invoice_items: List[InvoiceItem] = []
        item_tuples = []
        item_taxes: List[Decimal] = []
        total_quantity = 0

        for item in subscription.items:
            if item.quantity <= 0:
                raise BadRequestException(f"Invalid quantity {item.quantity} for subscription item {item.id}.")
            if item.unit_price < Decimal("0.00"):
                raise BadRequestException(f"Invalid unit price {item.unit_price} for subscription item {item.id}.")

            line_tax = TaxService.calculate_item_tax(item.unit_price, item.quantity, tax_rate)
            line_total = TaxService.calculate_item_line_total(item.unit_price, item.quantity, tax_rate)
            item_tuples.append((item.unit_price, item.quantity))
            item_taxes.append(line_tax)
            total_quantity += item.quantity

            # Fetch product description if available
            desc = "Subscription Service Item"
            if item.product and item.product.name:
                desc = f"{item.product.name} (Recurring Service)"

            inv_item = InvoiceItem(
                product_id=item.product_id,
                description=desc,
                quantity=item.quantity,
                unit_price=item.unit_price,
                tax_rate=tax_rate,
                line_total=line_total
            )
            invoice_items.append(inv_item)

        subtotal = TaxService.calculate_subtotal(item_tuples)
        tax_amount = TaxService.calculate_invoice_tax(item_taxes)

        # 8. Resolve and apply discount using DiscountService
        applied_discount_id = None
        discount_entity = None

        if payload.discount_id:
            discount_entity = DiscountService.get_discount_by_id(db, payload.discount_id)
        elif payload.discount_code:
            discount_entity = DiscountService.get_discount_by_name(db, payload.discount_code)
            if not discount_entity:
                raise NotFoundException(f"Discount with code '{payload.discount_code}' not found.")

        if discount_entity:
            discount_amount = DiscountService.validate_discount_entity(
                discount_entity,
                subtotal=subtotal,
                total_quantity=total_quantity,
                at_time=issue_date
            )
            DiscountService.consume_discount_usage(discount_entity)
            applied_discount_id = discount_entity.id
        elif payload.discount_amount is not None:
            discount_amount = TaxService.to_decimal(payload.discount_amount, "Discount amount")
            if discount_amount < Decimal("0.00"):
                raise BadRequestException("Discount amount cannot be negative.")
            if discount_amount > subtotal:
                raise BadRequestException(
                    f"Fixed discount of {discount_amount} cannot exceed eligible subtotal of {subtotal}."
                )
        else:
            discount_amount = Decimal("0.00")

        total = max(Decimal("0.00"), (subtotal + tax_amount - discount_amount).quantize(Decimal("0.01")))
        balance_due = total
        amount_paid = Decimal("0.00")

        # 9. Generate Unique Invoice Number
        invoice_num = f"INV-{datetime.now(timezone.utc).strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

        # 10. Create Invoice Entity
        invoice = Invoice(
            invoice_number=invoice_num,
            customer_id=subscription.customer_id,
            subscription_id=subscription.id,
            discount_id=applied_discount_id,
            billing_period_start=billing_period_start,
            billing_period_end=billing_period_end,
            status=InvoiceStatus.CONFIRMED,
            issue_date=issue_date,
            due_date=due_date,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total=total,
            amount_paid=amount_paid,
            balance_due=balance_due,
            items=invoice_items
        )

        db.add(invoice)

        # 10. Transaction-safe commit with unique constraint violation handling
        try:
            db.commit()
            db.refresh(invoice)
        except IntegrityError as exc:
            db.rollback()
            if "uq_invoice_subscription_billing_period" in str(exc) or "unique constraint" in str(exc).lower():
                raise ConflictException(
                    message="An invoice for this subscription and billing period already exists.",
                    details={"subscription_id": str(subscription.id)}
                )
            raise BadRequestException(f"Database constraint error: {str(exc)}")

        return invoice

    @classmethod
    def list_invoices(
        cls,
        db: Session,
        current_user: Optional[User] = None,
        customer_id: Optional[uuid.UUID] = None,
        page: int = 1,
        size: int = 20
    ) -> Tuple[List[Invoice], int]:
        """
        List invoices with pagination and customer-level isolation.
        """
        if page < 1:
            page = 1
        if size < 1 or size > 100:
            size = 20

        query = select(Invoice)

        # Customer role enforcement: only view own customer invoices
        if current_user and current_user.role == UserRole.CUSTOMER:
            customer = db.scalars(
                select(Customer).where(Customer.user_id == current_user.id)
            ).first()
            if not customer:
                return [], 0
            query = query.where(Invoice.customer_id == customer.id)
        elif customer_id:
            query = query.where(Invoice.customer_id == customer_id)

        count_query = select(func.count()).select_from(query.subquery())
        total = db.scalar(count_query) or 0

        query = query.order_by(Invoice.created_at.desc()).offset((page - 1) * size).limit(size)
        invoices = list(db.scalars(query).all())

        return invoices, total

    @classmethod
    def get_invoice_by_id(
        cls,
        db: Session,
        invoice_id: uuid.UUID,
        current_user: Optional[User] = None
    ) -> Invoice:
        """
        Retrieve a single invoice with full details and line items.
        Enforces customer data ownership.
        """
        stmt = (
            select(Invoice)
            .where(Invoice.id == invoice_id)
            .options(
                selectinload(Invoice.items),
                selectinload(Invoice.customer),
                selectinload(Invoice.discount)
            )
        )
        invoice = db.scalars(stmt).first()
        if not invoice:
            raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

        # Customer role enforcement
        if current_user and current_user.role == UserRole.CUSTOMER:
            if not invoice.customer or invoice.customer.user_id != current_user.id:
                raise ForbiddenException("You do not have permission to view this invoice.")

        return invoice
