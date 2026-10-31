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
from app.schemas.payment import PaymentCreate, PaymentRefundRequest
from app.services.payment_service import PaymentService


def create_user_token(db_session: Session, role: UserRole) -> tuple[User, str]:
    user = User(
        name=f"User {role.value} {uuid.uuid4().hex[:4]}",
        email=f"user_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="hashed_pw",
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id))
    return user, token


def create_test_invoice(
    db_session: Session,
    total: Decimal = Decimal("500.00"),
    status: InvoiceStatus = InvoiceStatus.CONFIRMED,
    due_date: datetime = None,
    customer_user: User = None
) -> Invoice:
    customer = Customer(
        name=f"Customer {uuid.uuid4().hex[:4]}",
        email=f"cust_{uuid.uuid4().hex[:6]}@example.com",
        user_id=customer_user.id if customer_user else None
    )
    product = Product(
        name="API Service",
        product_type=ProductType.SERVICE,
        sales_price=total
    )
    db_session.add_all([customer, product])
    db_session.flush()

    plan = Plan(
        product_id=product.id,
        name="Pro Plan",
        billing_interval=BillingInterval.MONTHLY,
        price=total
    )
    db_session.add(plan)
    db_session.flush()

    sub = Subscription(
        subscription_number=f"SUB-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=datetime.now(timezone.utc),
        next_billing_date=datetime.now(timezone.utc) + timedelta(days=30)
    )
    db_session.add(sub)
    db_session.flush()

    now = datetime.now(timezone.utc)
    inv_due = due_date or (now + timedelta(days=15))

    invoice = Invoice(
        invoice_number=f"INV-{now.strftime('%Y%m')}-{uuid.uuid4().hex[:6].upper()}",
        customer_id=customer.id,
        subscription_id=sub.id,
        billing_period_start=now,
        billing_period_end=now + timedelta(days=30),
        status=status,
        issue_date=now,
        due_date=inv_due,
        subtotal=total,
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total=total,
        amount_paid=Decimal("0.00"),
        balance_due=total
    )
    db_session.add(invoice)
    db_session.flush()

    inv_item = InvoiceItem(
        invoice_id=invoice.id,
        product_id=product.id,
        description="Monthly Subscription",
        quantity=1,
        unit_price=total,
        tax_rate=Decimal("0.00"),
        line_total=total
    )
    db_session.add(inv_item)
    db_session.commit()
    db_session.refresh(invoice)
    return invoice


# 1. Successful full payment
def test_successful_full_payment(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))
    payload = PaymentCreate(
        invoice_id=inv.id,
        amount=Decimal("500.00"),
        payment_method=PaymentMethod.CREDIT_CARD
    )
    payment = PaymentService.record_payment(db_session, payload)

    assert payment.status == PaymentStatus.SUCCESSFUL
    assert payment.amount == Decimal("500.00")

    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("500.00")
    assert inv.balance_due == Decimal("0.00")
    assert inv.status == InvoiceStatus.PAID


# 2. Successful partial payment
def test_successful_partial_payment(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))
    payload = PaymentCreate(
        invoice_id=inv.id,
        amount=Decimal("200.00"),
        payment_method=PaymentMethod.UPI
    )
    payment = PaymentService.record_payment(db_session, payload)

    assert payment.status == PaymentStatus.SUCCESSFUL
    assert payment.amount == Decimal("200.00")

    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("200.00")
    assert inv.balance_due == Decimal("300.00")
    assert inv.status == InvoiceStatus.PARTIALLY_PAID


# 3. Multiple partial payments
def test_multiple_partial_payments(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("1000.00"))

    # First payment: 300.00
    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("300.00"), payment_method=PaymentMethod.BANK_TRANSFER)
    )
    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("300.00")
    assert inv.balance_due == Decimal("700.00")
    assert inv.status == InvoiceStatus.PARTIALLY_PAID

    # Second payment: 400.00
    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("400.00"), payment_method=PaymentMethod.CREDIT_CARD)
    )
    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("700.00")
    assert inv.balance_due == Decimal("300.00")
    assert inv.status == InvoiceStatus.PARTIALLY_PAID

    # Third payment: 300.00
    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("300.00"), payment_method=PaymentMethod.CASH)
    )
    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("1000.00")
    assert inv.balance_due == Decimal("0.00")
    assert inv.status == InvoiceStatus.PAID


# 4. Payment greater than outstanding balance
def test_payment_greater_than_outstanding_balance(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))
    payload = PaymentCreate(
        invoice_id=inv.id,
        amount=Decimal("550.00"),
        payment_method=PaymentMethod.CREDIT_CARD
    )
    with pytest.raises(BadRequestException) as exc_info:
        PaymentService.record_payment(db_session, payload)
    assert "exceeds outstanding balance" in exc_info.value.message


# 5. Zero payment rejection
def test_zero_payment(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))
    with pytest.raises(Exception):  # Pydantic or Service level
        PaymentCreate(
            invoice_id=inv.id,
            amount=Decimal("0.00"),
            payment_method=PaymentMethod.CREDIT_CARD
        )


# 6. Negative payment rejection
def test_negative_payment(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))
    with pytest.raises(Exception):  # Pydantic gt=0 validation
        PaymentCreate(
            invoice_id=inv.id,
            amount=Decimal("-100.00"),
            payment_method=PaymentMethod.CREDIT_CARD
        )


# 7. Failed payment does not update invoice
def test_failed_payment_does_not_update_invoice(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))
    payload = PaymentCreate(
        invoice_id=inv.id,
        amount=Decimal("250.00"),
        payment_method=PaymentMethod.CREDIT_CARD,
        status=PaymentStatus.FAILED
    )
    payment = PaymentService.record_payment(db_session, payload)

    assert payment.status == PaymentStatus.FAILED
    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("0.00")
    assert inv.balance_due == Decimal("500.00")
    assert inv.status == InvoiceStatus.CONFIRMED


# 8. Pending payment does not update invoice
def test_pending_payment_does_not_update_invoice(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))
    payload = PaymentCreate(
        invoice_id=inv.id,
        amount=Decimal("250.00"),
        payment_method=PaymentMethod.BANK_TRANSFER,
        status=PaymentStatus.PENDING
    )
    payment = PaymentService.record_payment(db_session, payload)

    assert payment.status == PaymentStatus.PENDING
    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("0.00")
    assert inv.balance_due == Decimal("500.00")
    assert inv.status == InvoiceStatus.CONFIRMED


# 9. Fully paid invoice status and further payment rejection
def test_fully_paid_invoice_rejection(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("300.00"))
    # Pay fully
    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("300.00"), payment_method=PaymentMethod.CREDIT_CARD)
    )
    db_session.refresh(inv)
    assert inv.status == InvoiceStatus.PAID

    # Attempt second payment
    with pytest.raises(BadRequestException) as exc_info:
        PaymentService.record_payment(
            db_session,
            PaymentCreate(invoice_id=inv.id, amount=Decimal("50.00"), payment_method=PaymentMethod.CREDIT_CARD)
        )
    assert "already fully paid" in exc_info.value.message


# 10. Partially paid invoice status transitions
def test_partially_paid_invoice_status(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("600.00"))
    assert inv.status == InvoiceStatus.CONFIRMED

    # Partial 1
    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("150.00"), payment_method=PaymentMethod.UPI)
    )
    db_session.refresh(inv)
    assert inv.status == InvoiceStatus.PARTIALLY_PAID

    # Partial 2
    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("450.00"), payment_method=PaymentMethod.UPI)
    )
    db_session.refresh(inv)
    assert inv.status == InvoiceStatus.PAID


# 11. Overdue invoice handling
def test_overdue_invoice_handling(db_session: Session):
    # Due date was 5 days ago
    past_due = datetime.now(timezone.utc) - timedelta(days=5)
    inv = create_test_invoice(db_session, total=Decimal("400.00"), due_date=past_due)

    # Recalculate invoice status without payment -> OVERDUE
    PaymentService.recalculate_invoice_balance(db_session, inv)
    assert inv.status == InvoiceStatus.OVERDUE

    # Partial payment -> status becomes PARTIALLY_PAID
    pay = PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("100.00"), payment_method=PaymentMethod.CASH)
    )
    db_session.refresh(inv)
    assert inv.status == InvoiceStatus.PARTIALLY_PAID

    # Refund the payment -> status returns to OVERDUE because due_date is in past
    PaymentService.refund_payment(db_session, pay.id, PaymentRefundRequest(reason="Customer check bounced"))
    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("0.00")
    assert inv.balance_due == Decimal("400.00")
    assert inv.status == InvoiceStatus.OVERDUE


# 12. Cancelled invoice payment rejection
def test_cancelled_invoice_rejection(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("400.00"), status=InvoiceStatus.CANCELLED)
    with pytest.raises(BadRequestException) as exc_info:
        PaymentService.record_payment(
            db_session,
            PaymentCreate(invoice_id=inv.id, amount=Decimal("100.00"), payment_method=PaymentMethod.CREDIT_CARD)
        )
    assert "cancelled invoice" in exc_info.value.message


# 13. Duplicate payment reference prevention
def test_duplicate_payment_reference_prevention(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))
    ref = f"CUSTOM-REF-{uuid.uuid4().hex[:6]}"

    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("100.00"), payment_reference=ref)
    )

    with pytest.raises(ConflictException) as exc_info:
        PaymentService.record_payment(
            db_session,
            PaymentCreate(invoice_id=inv.id, amount=Decimal("100.00"), payment_reference=ref)
        )
    assert "already exists" in exc_info.value.message


# 14. Customer payment isolation
def test_customer_payment_isolation(client: TestClient, db_session: Session):
    cust_user_a, token_a = create_user_token(db_session, UserRole.CUSTOMER)
    cust_user_b, token_b = create_user_token(db_session, UserRole.CUSTOMER)
    admin_user, admin_token = create_user_token(db_session, UserRole.ADMIN)

    inv_a = create_test_invoice(db_session, total=Decimal("500.00"), customer_user=cust_user_a)

    # Admin records payment for customer A's invoice
    resp_pay = client.post(
        "/api/v1/payments",
        json={"invoice_id": str(inv_a.id), "amount": 250.00, "payment_method": "CREDIT_CARD"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_pay.status_code == 201
    pay_id = resp_pay.json()["data"]["id"]

    # Customer A can view their own payment
    resp_a = client.get(f"/api/v1/payments/{pay_id}", headers={"Authorization": f"Bearer {token_a}"})
    assert resp_a.status_code == 200

    # Customer B is forbidden from viewing Customer A's payment
    resp_b = client.get(f"/api/v1/payments/{pay_id}", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_b.status_code == 403

    # Customer B cannot view Customer A's invoice payments
    resp_inv_b = client.get(f"/api/v1/invoices/{inv_a.id}/payments", headers={"Authorization": f"Bearer {token_b}"})
    assert resp_inv_b.status_code == 403


# 15. Admin and Staff permissions
def test_admin_and_staff_permissions(client: TestClient, db_session: Session):
    admin_user, admin_token = create_user_token(db_session, UserRole.ADMIN)
    staff_user, staff_token = create_user_token(db_session, UserRole.STAFF)
    cust_user, cust_token = create_user_token(db_session, UserRole.CUSTOMER)

    inv = create_test_invoice(db_session, total=Decimal("400.00"))

    # Customer cannot record payment -> 403
    resp_cust = client.post(
        "/api/v1/payments",
        json={"invoice_id": str(inv.id), "amount": 100.00},
        headers={"Authorization": f"Bearer {cust_token}"}
    )
    assert resp_cust.status_code == 403

    # Staff can record payment -> 201
    resp_staff = client.post(
        "/api/v1/payments",
        json={"invoice_id": str(inv.id), "amount": 100.00, "payment_method": "BANK_TRANSFER"},
        headers={"Authorization": f"Bearer {staff_token}"}
    )
    assert resp_staff.status_code == 201
    pay_id = resp_staff.json()["data"]["id"]

    # Customer cannot refund payment -> 403
    resp_cust_ref = client.post(
        f"/api/v1/payments/{pay_id}/refund",
        json={"reason": "Test refund"},
        headers={"Authorization": f"Bearer {cust_token}"}
    )
    assert resp_cust_ref.status_code == 403

    # Admin can refund payment -> 200
    resp_admin_ref = client.post(
        f"/api/v1/payments/{pay_id}/refund",
        json={"reason": "Customer cancellation"},
        headers={"Authorization": f"Bearer {admin_token}"}
    )
    assert resp_admin_ref.status_code == 200
    assert resp_admin_ref.json()["data"]["status"] == "REFUNDED"


# 16. Refund validation and duplicate refund prevention
def test_refund_validation(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))

    # Record successful payment
    pay = PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("200.00"))
    )
    db_session.refresh(inv)
    assert inv.balance_due == Decimal("300.00")

    # Refund payment
    refunded_pay = PaymentService.refund_payment(
        db_session,
        pay.id,
        PaymentRefundRequest(reason="Duplicate transaction")
    )
    assert refunded_pay.status == PaymentStatus.REFUNDED
    assert "Duplicate transaction" in refunded_pay.notes

    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("0.00")
    assert inv.balance_due == Decimal("500.00")

    # Duplicate refund attempt must fail
    with pytest.raises(ConflictException) as exc_info:
        PaymentService.refund_payment(db_session, pay.id)
    assert "already been refunded" in exc_info.value.message

    # Attempt to refund a FAILED payment must fail
    failed_pay = PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("100.00"), status=PaymentStatus.FAILED)
    )
    with pytest.raises(BadRequestException) as exc_info2:
        PaymentService.refund_payment(db_session, failed_pay.id)
    assert "Only SUCCESSFUL payments can be refunded" in exc_info2.value.message


# 17. Row locking and concurrent payment calculation safety
def test_concurrent_payment_safety(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("500.00"))

    # Pay exactly 250.00
    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("250.00"))
    )
    db_session.refresh(inv)
    assert inv.balance_due == Decimal("250.00")

    # Pay remaining 250.00
    PaymentService.record_payment(
        db_session,
        PaymentCreate(invoice_id=inv.id, amount=Decimal("250.00"))
    )
    db_session.refresh(inv)
    assert inv.balance_due == Decimal("0.00")
    assert inv.status == InvoiceStatus.PAID

    # Third payment must be rejected because balance_due is now 0.00
    with pytest.raises(BadRequestException):
        PaymentService.record_payment(
            db_session,
            PaymentCreate(invoice_id=inv.id, amount=Decimal("1.00"))
        )


# 18. Correct Decimal financial calculations
def test_decimal_financial_precision(db_session: Session):
    inv = create_test_invoice(db_session, total=Decimal("1000.00"))

    # Three cents split payments
    PaymentService.record_payment(db_session, PaymentCreate(invoice_id=inv.id, amount=Decimal("333.33")))
    PaymentService.record_payment(db_session, PaymentCreate(invoice_id=inv.id, amount=Decimal("333.33")))
    PaymentService.record_payment(db_session, PaymentCreate(invoice_id=inv.id, amount=Decimal("333.34")))

    db_session.refresh(inv)
    assert inv.amount_paid == Decimal("1000.00")
    assert inv.balance_due == Decimal("0.00")
    assert inv.status == InvoiceStatus.PAID
