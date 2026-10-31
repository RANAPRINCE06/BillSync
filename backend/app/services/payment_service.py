from datetime import datetime, timezone
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
from app.models.enums import InvoiceStatus, PaymentMethod, PaymentStatus, UserRole
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.user import User
from app.schemas.payment import (
    PaymentCreate,
    PaymentRefundRequest,
    PaymentResponse,
)
from app.services.tax_service import TaxService

logger = logging.getLogger("billsync.payments")


class PaymentService:
    """Service layer managing payment recording, invoice balance management, and refunds."""

    @classmethod
    def to_response(cls, payment: Payment) -> PaymentResponse:
        """Converts a Payment ORM model to a detailed PaymentResponse schema."""
        inv_number = payment.invoice.invoice_number if payment.invoice else None
        cust_name = None
        cust_id = None
        if payment.invoice:
            cust_id = payment.invoice.customer_id
            if payment.invoice.customer:
                cust_name = payment.invoice.customer.name

        return PaymentResponse(
            id=payment.id,
            invoice_id=payment.invoice_id,
            invoice_number=inv_number,
            customer_name=cust_name,
            customer_id=cust_id,
            payment_reference=payment.payment_reference,
            payment_method=payment.payment_method,
            amount=payment.amount,
            payment_date=payment.payment_date,
            status=payment.status,
            notes=payment.notes,
            created_at=payment.created_at,
            updated_at=payment.updated_at,
        )

    @classmethod
    def recalculate_invoice_balance(cls, db: Session, invoice: Invoice) -> None:
        """
        Recalculates invoice amount_paid and balance_due based on successful payments.
        Updates invoice status according to payment completion and due date rules.
        """
        # Sum only SUCCESSFUL payments for this invoice
        total_successful = db.scalar(
            select(func.sum(Payment.amount)).where(
                Payment.invoice_id == invoice.id,
                Payment.status == PaymentStatus.SUCCESSFUL
            )
        )
        amount_paid = (total_successful or Decimal("0.00")).quantize(Decimal("0.01"))

        # Defensive check: amount_paid must not exceed total
        if amount_paid > invoice.total:
            amount_paid = invoice.total

        invoice.amount_paid = amount_paid
        invoice.balance_due = max(Decimal("0.00"), (invoice.total - amount_paid).quantize(Decimal("0.01")))

        # Do not modify status if invoice is cancelled
        if invoice.status == InvoiceStatus.CANCELLED:
            return

        now = datetime.now(timezone.utc)

        # Status rules
        if invoice.balance_due <= Decimal("0.00") and invoice.total > Decimal("0.00"):
            invoice.status = InvoiceStatus.PAID
        elif invoice.total == Decimal("0.00") and amount_paid == Decimal("0.00"):
            invoice.status = InvoiceStatus.PAID
        elif amount_paid > Decimal("0.00"):
            invoice.status = InvoiceStatus.PARTIALLY_PAID
        else:
            # No payment recorded or all payments refunded/failed
            if invoice.due_date and invoice.due_date < now:
                invoice.status = InvoiceStatus.OVERDUE
            else:
                invoice.status = InvoiceStatus.CONFIRMED

    @classmethod
    def record_payment(
        cls,
        db: Session,
        payload: PaymentCreate,
        current_user: Optional[User] = None
    ) -> Payment:
        """
        Records a new payment against an invoice.
        Enforces permissions, concurrency row-locking, status rules, and balance validation.
        """
        # 1. Authorization: Only Staff and Admin can record payments
        if current_user and current_user.role == UserRole.CUSTOMER:
            raise ForbiddenException("Customers are not authorized to record financial payments.")

        # 2. Monetary validation
        amount = TaxService.to_decimal(payload.amount, "Payment amount")
        if amount <= Decimal("0.00"):
            raise BadRequestException("Payment amount must be greater than zero.")

        # 3. Retrieve and lock invoice row to prevent concurrent race conditions
        stmt = (
            select(Invoice)
            .where(Invoice.id == payload.invoice_id)
            .with_for_update()
            .options(
                selectinload(Invoice.customer),
                selectinload(Invoice.payments)
            )
        )
        invoice = db.scalars(stmt).first()
        if not invoice:
            raise NotFoundException(f"Invoice with ID {payload.invoice_id} not found.")

        # 4. Status eligibility check
        if invoice.status == InvoiceStatus.CANCELLED:
            raise BadRequestException("Cannot record payment against a cancelled invoice.")

        if invoice.status == InvoiceStatus.PAID or invoice.balance_due <= Decimal("0.00"):
            raise BadRequestException(
                f"Invoice {invoice.invoice_number} is already fully paid (balance due: {invoice.balance_due})."
            )

        # 5. Overpayment prevention for SUCCESSFUL payments
        if payload.status == PaymentStatus.SUCCESSFUL and amount > invoice.balance_due:
            raise BadRequestException(
                f"Payment amount of {amount} exceeds outstanding balance of {invoice.balance_due}."
            )

        # 6. Payment reference resolution and uniqueness check
        if payload.payment_reference:
            existing_ref = db.scalar(
                select(Payment).where(Payment.payment_reference == payload.payment_reference)
            )
            if existing_ref:
                raise ConflictException(f"Payment with reference '{payload.payment_reference}' already exists.")
            payment_ref = payload.payment_reference
        else:
            payment_ref = f"PAY-{datetime.now(timezone.utc).strftime('%Y%m%d')}-{uuid.uuid4().hex[:8].upper()}"

        payment_date = payload.payment_date or datetime.now(timezone.utc)

        # 7. Create Payment entity
        payment = Payment(
            invoice_id=invoice.id,
            payment_reference=payment_ref,
            payment_method=payload.payment_method,
            amount=amount,
            payment_date=payment_date,
            status=payload.status,
            notes=payload.notes
        )
        db.add(payment)
        db.flush()

        # 8. Recalculate invoice balance if payment is SUCCESSFUL
        if payload.status == PaymentStatus.SUCCESSFUL:
            cls.recalculate_invoice_balance(db, invoice)

        db.commit()
        db.refresh(payment)
        # Ensure relationships are loaded for response mapping
        db.refresh(invoice)
        payment.invoice = invoice

        logger.info(
            "Payment %s recorded for invoice %s (amount=%s, status=%s)",
            payment.payment_reference, invoice.invoice_number, payment.amount, payment.status
        )
        return payment

    @classmethod
    def refund_payment(
        cls,
        db: Session,
        payment_id: uuid.UUID,
        payload: Optional[PaymentRefundRequest] = None,
        current_user: Optional[User] = None
    ) -> Payment:
        """
        Executes a safe full-refund workflow on a successful payment.
        Validates status, updates invoice balances, preserves audit records, and prevents duplicate refunds.
        """
        # 1. Authorization: Only Staff and Admin can issue refunds
        if current_user and current_user.role == UserRole.CUSTOMER:
            raise ForbiddenException("Customers are not authorized to process refunds.")

        # 2. Retrieve payment with invoice and lock invoice row
        payment = db.get(Payment, payment_id)
        if not payment:
            raise NotFoundException(f"Payment with ID {payment_id} not found.")

        # 3. Status checks
        if payment.status == PaymentStatus.REFUNDED:
            raise ConflictException("Payment has already been refunded.")

        if payment.status != PaymentStatus.SUCCESSFUL:
            raise BadRequestException(
                f"Cannot refund payment with status '{payment.status.value}'. Only SUCCESSFUL payments can be refunded."
            )

        stmt = (
            select(Invoice)
            .where(Invoice.id == payment.invoice_id)
            .with_for_update()
            .options(selectinload(Invoice.customer))
        )
        invoice = db.scalars(stmt).first()
        if not invoice:
            raise NotFoundException(f"Associated invoice {payment.invoice_id} not found.")

        # 4. Mark payment as REFUNDED and append audit note
        reason_text = payload.reason if payload and payload.reason else "Administrative refund"
        timestamp = datetime.now(timezone.utc).isoformat()
        refund_note = f"[REFUNDED at {timestamp}] {reason_text}"

        payment.status = PaymentStatus.REFUNDED
        payment.notes = f"{payment.notes}\n{refund_note}" if payment.notes else refund_note
        db.flush()

        # 5. Recalculate invoice balance (refunded payment will now be excluded)
        cls.recalculate_invoice_balance(db, invoice)

        db.commit()
        db.refresh(payment)
        payment.invoice = invoice

        logger.info(
            "Payment %s refunded for invoice %s (amount=%s)",
            payment.payment_reference, invoice.invoice_number, payment.amount
        )
        return payment

    @classmethod
    def get_payment_by_id(
        cls,
        db: Session,
        payment_id: uuid.UUID,
        current_user: Optional[User] = None
    ) -> Payment:
        """Fetches payment details with customer isolation verification."""
        stmt = (
            select(Payment)
            .where(Payment.id == payment_id)
            .options(
                selectinload(Payment.invoice).selectinload(Invoice.customer)
            )
        )
        payment = db.scalars(stmt).first()
        if not payment:
            raise NotFoundException(f"Payment with ID {payment_id} not found.")

        # Customer isolation
        if current_user and current_user.role == UserRole.CUSTOMER:
            if not payment.invoice or not payment.invoice.customer or payment.invoice.customer.user_id != current_user.id:
                raise ForbiddenException("You do not have permission to view this payment.")

        return payment

    @classmethod
    def list_payments(
        cls,
        db: Session,
        current_user: Optional[User] = None,
        invoice_id: Optional[uuid.UUID] = None,
        customer_id: Optional[uuid.UUID] = None,
        status: Optional[PaymentStatus] = None,
        method: Optional[PaymentMethod] = None,
        search: Optional[str] = None,
        page: int = 1,
        size: int = 20
    ) -> Tuple[List[Payment], int]:
        """
        Retrieves paginated payments list.
        Enforces that CUSTOMER users only see payments for their own invoices.
        """
        stmt = (
            select(Payment)
            .join(Payment.invoice)
            .options(
                selectinload(Payment.invoice).selectinload(Invoice.customer)
            )
        )

        # Customer data ownership isolation
        if current_user and current_user.role == UserRole.CUSTOMER:
            stmt = stmt.join(Invoice.customer).where(Customer.user_id == current_user.id)
        elif customer_id:
            stmt = stmt.where(Invoice.customer_id == customer_id)

        if invoice_id:
            stmt = stmt.where(Payment.invoice_id == invoice_id)

        if status:
            stmt = stmt.where(Payment.status == status)

        if method:
            stmt = stmt.where(Payment.payment_method == method)

        if search:
            search_pattern = f"%{search}%"
            stmt = stmt.where(
                or_(
                    Payment.payment_reference.ilike(search_pattern),
                    Invoice.invoice_number.ilike(search_pattern),
                    Payment.notes.ilike(search_pattern)
                )
            )

        # Total count
        count_stmt = select(func.count()).select_from(stmt.subquery())
        total = db.scalar(count_stmt) or 0

        # Pagination & Ordering
        stmt = stmt.order_by(Payment.payment_date.desc()).offset((page - 1) * size).limit(size)
        items = list(db.scalars(stmt).all())

        return items, total

    @classmethod
    def list_invoice_payments(
        cls,
        db: Session,
        invoice_id: uuid.UUID,
        current_user: Optional[User] = None
    ) -> List[Payment]:
        """Lists all payments recorded against a specific invoice."""
        # Validate invoice access
        stmt = (
            select(Invoice)
            .where(Invoice.id == invoice_id)
            .options(selectinload(Invoice.customer))
        )
        invoice = db.scalars(stmt).first()
        if not invoice:
            raise NotFoundException(f"Invoice with ID {invoice_id} not found.")

        if current_user and current_user.role == UserRole.CUSTOMER:
            if not invoice.customer or invoice.customer.user_id != current_user.id:
                raise ForbiddenException("You do not have permission to view payments for this invoice.")

        pay_stmt = (
            select(Payment)
            .where(Payment.invoice_id == invoice_id)
            .options(
                selectinload(Payment.invoice).selectinload(Invoice.customer)
            )
            .order_by(Payment.payment_date.desc())
        )
        return list(db.scalars(pay_stmt).all())
