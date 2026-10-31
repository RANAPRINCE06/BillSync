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
from app.models.enums import QuotationStatus, SubscriptionStatus, UserRole
from app.models.product import Plan, Product
from app.models.quotation import Quotation, QuotationItem
from app.models.subscription import Subscription, SubscriptionItem
from app.models.user import User
from app.schemas.invoice import InvoiceGenerateRequest
from app.schemas.quotation import (
    QuotationConvertToSubscriptionRequest,
    QuotationCreate,
    QuotationItemResponse,
    QuotationResponse,
    QuotationUpdate,
)
from app.services.invoice_service import InvoiceService
from app.services.tax_service import TaxService

logger = logging.getLogger("billsync.quotations")


class QuotationService:
    """Service layer managing quotation creation, calculation, acceptance, and conversion."""

    @classmethod
    def to_response(cls, quotation: Quotation) -> QuotationResponse:
        """Converts Quotation ORM entity into unified QuotationResponse."""
        cust_name = quotation.customer.name if quotation.customer else None
        item_responses: List[QuotationItemResponse] = []
        for it in quotation.items:
            p_name = it.product.name if it.product else None
            item_responses.append(QuotationItemResponse(
                id=it.id,
                quotation_id=it.quotation_id,
                product_id=it.product_id,
                product_name=p_name,
                quantity=it.quantity,
                unit_price=it.unit_price,
                tax_rate=it.tax_rate,
                line_total=it.line_total,
            ))

        return QuotationResponse(
            id=quotation.id,
            quotation_number=quotation.quotation_number,
            customer_id=quotation.customer_id,
            customer_name=cust_name,
            status=quotation.status,
            valid_until=quotation.valid_until,
            subtotal=quotation.subtotal,
            tax_amount=quotation.tax_amount,
            discount_amount=quotation.discount_amount,
            total=quotation.total,
            created_at=quotation.created_at,
            updated_at=quotation.updated_at,
            items=item_responses,
        )

    @classmethod
    def create_quotation(
        cls,
        db: Session,
        payload: QuotationCreate,
        current_user: User
    ) -> Quotation:
        """Creates a new quotation with validated items and accurate financial calculations."""
        if current_user.role == UserRole.CUSTOMER:
            raise ForbiddenException("Customers are not permitted to draft quotations.")

        customer = db.get(Customer, payload.customer_id)
        if not customer:
            raise NotFoundException(f"Customer with ID {payload.customer_id} not found.")

        if not payload.items or len(payload.items) == 0:
            raise BadRequestException("Quotation must include at least one line item.")

        now = datetime.now(timezone.utc)
        quotation_num = payload.quotation_number or f"QT-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

        existing_num = db.scalar(select(Quotation).where(Quotation.quotation_number == quotation_num))
        if existing_num:
            raise ConflictException(f"Quotation with number '{quotation_num}' already exists.")

        item_tuples = []
        item_taxes = []
        quotation_items: List[QuotationItem] = []

        for item_data in payload.items:
            product = db.get(Product, item_data.product_id)
            if not product:
                raise NotFoundException(f"Catalog product with ID {item_data.product_id} not found.")
            if item_data.quantity <= 0:
                raise BadRequestException(f"Item quantity must be greater than zero. Received {item_data.quantity}.")
            if item_data.unit_price < Decimal("0.00"):
                raise BadRequestException(f"Item unit price cannot be negative. Received {item_data.unit_price}.")

            unit_price = TaxService.to_decimal(item_data.unit_price, "Unit price")
            tax_rate = TaxService.to_decimal(item_data.tax_rate, "Tax rate")
            line_total = TaxService.calculate_item_line_total(unit_price, item_data.quantity, tax_rate)
            line_tax = TaxService.calculate_item_tax(unit_price, item_data.quantity, tax_rate)

            item_tuples.append((unit_price, item_data.quantity))
            item_taxes.append(line_tax)

            quotation_items.append(QuotationItem(
                product_id=product.id,
                quantity=item_data.quantity,
                unit_price=unit_price,
                tax_rate=tax_rate,
                line_total=line_total
            ))

        subtotal = TaxService.calculate_subtotal(item_tuples)
        tax_amount = TaxService.calculate_invoice_tax(item_taxes)
        discount_amount = TaxService.to_decimal(payload.discount_amount, "Discount amount")
        if discount_amount < Decimal("0.00"):
            raise BadRequestException("Discount amount cannot be negative.")
        if discount_amount > subtotal:
            raise BadRequestException(f"Discount amount of {discount_amount} cannot exceed subtotal of {subtotal}.")

        total = max(Decimal("0.00"), (subtotal + tax_amount - discount_amount).quantize(Decimal("0.01")))

        quotation = Quotation(
            quotation_number=quotation_num,
            customer_id=customer.id,
            status=payload.status,
            valid_until=payload.valid_until,
            subtotal=subtotal,
            tax_amount=tax_amount,
            discount_amount=discount_amount,
            total=total,
            items=quotation_items
        )
        db.add(quotation)
        db.commit()
        db.refresh(quotation)
        return quotation

    @classmethod
    def get_quotation_by_id(
        cls,
        db: Session,
        quotation_id: uuid.UUID,
        current_user: User
    ) -> Quotation:
        """Retrieves single quotation with customer data isolation."""
        stmt = (
            select(Quotation)
            .where(Quotation.id == quotation_id)
            .options(
                selectinload(Quotation.customer),
                selectinload(Quotation.items).selectinload(QuotationItem.product)
            )
        )
        quotation = db.scalars(stmt).first()
        if not quotation:
            raise NotFoundException(f"Quotation with ID {quotation_id} not found.")

        if current_user.role == UserRole.CUSTOMER:
            if not quotation.customer or quotation.customer.user_id != current_user.id:
                raise ForbiddenException("You do not have access to this quotation.")

        return quotation

    @classmethod
    def list_quotations(
        cls,
        db: Session,
        current_user: User,
        customer_id: Optional[uuid.UUID] = None,
        status: Optional[QuotationStatus] = None,
        search: Optional[str] = None,
        page: int = 1,
        size: int = 20
    ) -> Tuple[List[Quotation], int]:
        """Lists quotations with role-based filtering and search."""
        stmt = (
            select(Quotation)
            .options(
                selectinload(Quotation.customer),
                selectinload(Quotation.items).selectinload(QuotationItem.product)
            )
        )

        if current_user.role == UserRole.CUSTOMER:
            stmt = stmt.join(Quotation.customer).where(Customer.user_id == current_user.id)
        elif customer_id:
            stmt = stmt.where(Quotation.customer_id == customer_id)

        if status:
            stmt = stmt.where(Quotation.status == status)

        if search:
            search_pat = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Quotation.quotation_number.ilike(search_pat),
                    Quotation.customer.has(Customer.name.ilike(search_pat))
                )
            )

        total_stmt = select(func.count()).select_from(stmt.subquery())
        total = db.scalar(total_stmt) or 0

        stmt = stmt.order_by(Quotation.created_at.desc()).offset((page - 1) * size).limit(size)
        items = list(db.scalars(stmt).all())
        return items, total

    @classmethod
    def update_quotation(
        cls,
        db: Session,
        quotation_id: uuid.UUID,
        payload: QuotationUpdate,
        current_user: User
    ) -> Quotation:
        """Updates quotation details, items, or status."""
        quotation = cls.get_quotation_by_id(db, quotation_id, current_user)

        # Customers cannot edit items, pricing, or customer assignment
        if current_user.role == UserRole.CUSTOMER:
            if payload.customer_id or payload.items or payload.discount_amount is not None:
                raise ForbiddenException("Customers cannot modify quotation items or financial totals.")
            # Customers may only accept or reject their own quotations
            if payload.status and payload.status not in (QuotationStatus.ACCEPTED, QuotationStatus.REJECTED):
                raise ForbiddenException("Customers may only accept or reject quotations.")

        # Check if already converted
        converted = db.scalar(select(Subscription).where(Subscription.quotation_id == quotation.id))
        if converted:
            raise BadRequestException("Cannot modify quotation that has already been converted to a subscription.")

        if payload.status:
            quotation.status = payload.status

        if payload.valid_until is not None:
            quotation.valid_until = payload.valid_until

        if payload.items:
            # Replace line items and recalculate
            quotation.items.clear()
            item_tuples = []
            item_taxes = []
            for item_data in payload.items:
                product = db.get(Product, item_data.product_id)
                if not product:
                    raise NotFoundException(f"Catalog product {item_data.product_id} not found.")
                unit_price = TaxService.to_decimal(item_data.unit_price, "Unit price")
                tax_rate = TaxService.to_decimal(item_data.tax_rate, "Tax rate")
                line_total = TaxService.calculate_item_line_total(unit_price, item_data.quantity, tax_rate)
                line_tax = TaxService.calculate_item_tax(unit_price, item_data.quantity, tax_rate)

                item_tuples.append((unit_price, item_data.quantity))
                item_taxes.append(line_tax)

                quotation.items.append(QuotationItem(
                    product_id=product.id,
                    quantity=item_data.quantity,
                    unit_price=unit_price,
                    tax_rate=tax_rate,
                    line_total=line_total
                ))

            subtotal = TaxService.calculate_subtotal(item_tuples)
            tax_amount = TaxService.calculate_invoice_tax(item_taxes)
            quotation.subtotal = subtotal
            quotation.tax_amount = tax_amount

        if payload.discount_amount is not None:
            disc = TaxService.to_decimal(payload.discount_amount, "Discount amount")
            if disc < Decimal("0.00"):
                raise BadRequestException("Discount amount cannot be negative.")
            if disc > quotation.subtotal:
                raise BadRequestException("Discount amount cannot exceed subtotal.")
            quotation.discount_amount = disc

        quotation.total = max(
            Decimal("0.00"),
            (quotation.subtotal + quotation.tax_amount - quotation.discount_amount).quantize(Decimal("0.01"))
        )

        db.commit()
        db.refresh(quotation)
        return quotation

    @classmethod
    def accept_quotation(
        cls,
        db: Session,
        quotation_id: uuid.UUID,
        current_user: User
    ) -> Quotation:
        """Marks quotation as ACCEPTED by customer or staff."""
        quotation = cls.get_quotation_by_id(db, quotation_id, current_user)

        if quotation.status == QuotationStatus.ACCEPTED:
            return quotation

        if quotation.status in (QuotationStatus.REJECTED, QuotationStatus.EXPIRED):
            raise BadRequestException(f"Cannot accept quotation with status '{quotation.status.value}'.")

        quotation.status = QuotationStatus.ACCEPTED
        db.commit()
        db.refresh(quotation)
        logger.info("Quotation %s accepted", quotation.quotation_number)
        return quotation

    @classmethod
    def reject_quotation(
        cls,
        db: Session,
        quotation_id: uuid.UUID,
        current_user: User
    ) -> Quotation:
        """Marks quotation as REJECTED."""
        quotation = cls.get_quotation_by_id(db, quotation_id, current_user)

        converted = db.scalar(select(Subscription).where(Subscription.quotation_id == quotation.id))
        if converted:
            raise BadRequestException("Cannot reject quotation that has already been converted to a subscription.")

        quotation.status = QuotationStatus.REJECTED
        db.commit()
        db.refresh(quotation)
        logger.info("Quotation %s rejected", quotation.quotation_number)
        return quotation

    @classmethod
    def delete_quotation(
        cls,
        db: Session,
        quotation_id: uuid.UUID,
        current_user: User
    ) -> None:
        """Deletes a DRAFT quotation."""
        if current_user.role == UserRole.CUSTOMER:
            raise ForbiddenException("Customers cannot delete quotations.")

        quotation = db.get(Quotation, quotation_id)
        if not quotation:
            raise NotFoundException(f"Quotation with ID {quotation_id} not found.")

        if quotation.status not in (QuotationStatus.DRAFT, QuotationStatus.REJECTED):
            raise BadRequestException(f"Cannot delete quotation with status '{quotation.status.value}'.")

        db.delete(quotation)
        db.commit()

    @classmethod
    def convert_to_subscription(
        cls,
        db: Session,
        quotation_id: uuid.UUID,
        payload: Optional[QuotationConvertToSubscriptionRequest] = None,
        current_user: Optional[User] = None
    ) -> Subscription:
        """
        Converts an accepted quotation into an active subscription.
        Preserves product, pricing, and quantity snapshots.
        Prevents duplicate conversion and optionally generates initial invoice.
        """
        if current_user and current_user.role == UserRole.CUSTOMER:
            raise ForbiddenException("Customers cannot convert quotations to subscriptions.")

        stmt = (
            select(Quotation)
            .where(Quotation.id == quotation_id)
            .options(
                selectinload(Quotation.customer),
                selectinload(Quotation.items).selectinload(QuotationItem.product)
            )
        )
        quotation = db.scalars(stmt).first()
        if not quotation:
            raise NotFoundException(f"Quotation with ID {quotation_id} not found.")

        # 1. Quotation Acceptance Validation
        if quotation.status != QuotationStatus.ACCEPTED:
            raise BadRequestException(
                f"Only ACCEPTED quotations can be converted to subscriptions. Current status is '{quotation.status.value}'."
            )

        # 2. Duplicate Conversion Prevention Check
        existing_sub = db.scalars(
            select(Subscription).where(Subscription.quotation_id == quotation.id)
        ).first()
        if existing_sub:
            raise ConflictException(
                f"Quotation {quotation.quotation_number} has already been converted to subscription {existing_sub.subscription_number}."
            )

        # 3. Resolve Target Plan
        plan = None
        req = payload or QuotationConvertToSubscriptionRequest()
        if req.plan_id:
            plan = db.get(Plan, req.plan_id)
            if not plan or not plan.is_active:
                raise BadRequestException(f"Specified plan {req.plan_id} is invalid or inactive.")
        else:
            # Find first plan matching one of the quotation products
            for item in quotation.items:
                matched_plan = db.scalar(
                    select(Plan).where(Plan.product_id == item.product_id, Plan.is_active == True)
                )
                if matched_plan:
                    plan = matched_plan
                    break
            # Fallback to any active plan
            if not plan:
                plan = db.scalar(select(Plan).where(Plan.is_active == True))

        if not plan:
            raise BadRequestException("No active subscription plan found to attach to this subscription.")

        # 4. Generate Unique Subscription Number & Date Setup
        now = datetime.now(timezone.utc)
        start_date = req.start_date or now
        sub_number = f"SUB-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}"

        subscription = Subscription(
            subscription_number=sub_number,
            customer_id=quotation.customer_id,
            plan_id=plan.id,
            quotation_id=quotation.id,
            status=SubscriptionStatus.ACTIVE,
            start_date=start_date,
            end_date=req.end_date,
            next_billing_date=start_date,  # Ready for immediate or upcoming billing cycle
            payment_terms=req.payment_terms
        )
        db.add(subscription)
        db.flush()

        # 5. Preserve Accepted Line Item Pricing & Quantities Snapshot
        for q_item in quotation.items:
            sub_item = SubscriptionItem(
                subscription_id=subscription.id,
                product_id=q_item.product_id,
                quantity=q_item.quantity,
                unit_price=q_item.unit_price  # Locked pricing snapshot
            )
            db.add(sub_item)
        db.flush()

        # 6. Optional Initial Invoice Generation
        if req.generate_initial_invoice:
            inv_payload = InvoiceGenerateRequest(
                subscription_id=subscription.id,
                billing_period_start=start_date,
                discount_amount=quotation.discount_amount
            )
            InvoiceService.generate_invoice_for_subscription(
                db=db,
                payload=inv_payload,
                current_user=current_user
            )

        db.commit()
        db.refresh(subscription)
        logger.info(
            "Quotation %s successfully converted to subscription %s (plan=%s)",
            quotation.quotation_number, subscription.subscription_number, plan.name
        )
        return subscription
