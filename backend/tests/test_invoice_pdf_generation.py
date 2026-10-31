from datetime import datetime, timezone, timedelta
from decimal import Decimal
import io
import os
import tempfile
import uuid
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash
from app.models import (
    Customer,
    Invoice,
    InvoiceItem,
    Payment,
    Plan,
    Product,
    Subscription,
    SubscriptionItem,
    User,
    BillingInterval,
    InvoiceStatus,
    PaymentMethod,
    PaymentStatus,
    ProductType,
    SubscriptionStatus,
    UserRole,
)
from app.services.pdf_service import InvoicePDFService


def create_user(db_session: Session, role: UserRole) -> tuple[User, str]:
    uid = uuid.uuid4().hex[:6]
    user = User(
        name=f"User {role.value} {uid}",
        email=f"pdf_test_{uid}@billsync.local",
        password_hash=get_password_hash("SecurePass123!"),
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id))
    return user, token


def setup_customer_and_invoice(db_session: Session, user: User = None) -> tuple[Customer, Invoice]:
    uid = uuid.uuid4().hex[:6]
    customer = Customer(
        user_id=user.id if user else None,
        name=f"Acme Enterprise {uid}",
        email=f"acme_{uid}@example.com",
        phone="+1-555-0199",
        billing_address="100 Technology Plaza\nSuite 400\nSan Francisco, CA 94105"
    )
    db_session.add(customer)
    db_session.flush()

    now = datetime.now(timezone.utc)
    invoice = Invoice(
        invoice_number=f"INV-{now.strftime('%Y%m')}-{uid.upper()}",
        customer_id=customer.id,
        billing_period_start=now,
        billing_period_end=now + timedelta(days=30),
        status=InvoiceStatus.CONFIRMED,
        issue_date=now,
        due_date=now + timedelta(days=15),
        subtotal=Decimal("400.00"),
        tax_amount=Decimal("40.00"),
        discount_amount=Decimal("50.00"),
        total=Decimal("390.00"),
        amount_paid=Decimal("0.00"),
        balance_due=Decimal("390.00")
    )
    db_session.add(invoice)
    db_session.flush()

    # Historical items
    item1 = InvoiceItem(
        invoice_id=invoice.id,
        description="Cloud Infrastructure Cluster (Standard Node)",
        quantity=2,
        unit_price=Decimal("150.00"),
        tax_rate=Decimal("10.00"),
        line_total=Decimal("330.00")
    )
    item2 = InvoiceItem(
        invoice_id=invoice.id,
        description="Premium Managed Support SLA",
        quantity=1,
        unit_price=Decimal("100.00"),
        tax_rate=Decimal("10.00"),
        line_total=Decimal("110.00")
    )
    db_session.add_all([item1, item2])
    db_session.commit()
    db_session.refresh(invoice)
    return customer, invoice


def test_generate_pdf_normal_invoice_success_and_validity(client: TestClient, db_session: Session):
    """
    Validates that:
    1. GET /api/v1/invoices/{id}/pdf returns HTTP 200 with application/pdf.
    2. Content-Disposition has attachment with filename Invoice-{invoice_number}.pdf.
    3. The response bytes form a valid PDF readable by pypdf.
    4. Persisted invoice totals, tax, discount, balance, customer, and items appear accurately.
    """
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, invoice = setup_customer_and_invoice(db_session)

    res = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers=headers)
    assert res.status_code == 200
    assert res.headers["content-type"] == "application/pdf"
    assert f'filename="Invoice-{invoice.invoice_number}.pdf"' in res.headers["content-disposition"]

    pdf_bytes = res.content
    assert pdf_bytes.startswith(b"%PDF-")

    # Read and parse with pypdf
    reader = PdfReader(io.BytesIO(pdf_bytes))
    assert len(reader.pages) >= 1

    extracted_text = ""
    for page in reader.pages:
        extracted_text += page.extract_text() + "\n"

    # Verify key invoice text components
    assert "BILLSYNC" in extracted_text
    assert invoice.invoice_number in extracted_text
    assert customer.name in extracted_text
    assert "San Francisco" in extracted_text
    assert "Cloud Infrastructure Cluster" in extracted_text
    assert "Premium Managed Support" in extracted_text

    # Verify financial totals
    assert "$400.00" in extracted_text  # Subtotal
    assert "$40.00" in extracted_text   # Tax Amount
    assert "-$50.00" in extracted_text  # Discount Amount
    assert "$390.00" in extracted_text  # Total Amount & Balance Due
    assert "Page 1 of 1" in extracted_text


def test_pdf_content_with_recorded_payments(client: TestClient, db_session: Session):
    """
    Validates that payment records attached to an invoice are rendered in the PDF,
    and status/balance accurately reflect partial payment.
    """
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, invoice = setup_customer_and_invoice(db_session)

    # Record a payment of 150.00
    now = datetime.now(timezone.utc)
    pay_ref = f"pay_{uuid.uuid4().hex[:8]}"
    payment = Payment(
        invoice_id=invoice.id,
        amount=Decimal("150.00"),
        payment_method=PaymentMethod.CREDIT_CARD,
        payment_reference=pay_ref,
        payment_date=now,
        status=PaymentStatus.SUCCESSFUL
    )
    db_session.add(payment)

    invoice.amount_paid = Decimal("150.00")
    invoice.balance_due = Decimal("240.00")
    invoice.status = InvoiceStatus.PARTIALLY_PAID
    db_session.commit()

    res = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers=headers)
    assert res.status_code == 200

    reader = PdfReader(io.BytesIO(res.content))
    extracted = "".join(page.extract_text() for page in reader.pages)

    assert "PARTIALLY PAID" in extracted
    assert "PAYMENT HISTORY" in extracted
    assert pay_ref in extracted
    assert "$150.00" in extracted  # Payment amount & Amount paid
    assert "$240.00" in extracted  # Balance due


def test_pdf_customer_ownership_and_role_authorization(client: TestClient, db_session: Session):
    """
    Validates role-based access control:
    - Admin can download any invoice.
    - Staff can download any invoice.
    - Associated Customer can download own invoice.
    - Unassociated Customer receives 403 Forbidden.
    - Anonymous request receives 401 Unauthorized.
    """
    admin_user, admin_token = create_user(db_session, UserRole.ADMIN)
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    owner_user, owner_token = create_user(db_session, UserRole.CUSTOMER)
    attacker_user, attacker_token = create_user(db_session, UserRole.CUSTOMER)

    customer, invoice = setup_customer_and_invoice(db_session, user=owner_user)

    # 1. Admin download -> 200
    res_admin = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers={"Authorization": f"Bearer {admin_token}"})
    assert res_admin.status_code == 200

    # 2. Staff download -> 200
    res_staff = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers={"Authorization": f"Bearer {staff_token}"})
    assert res_staff.status_code == 200

    # 3. Owner Customer download -> 200
    res_owner = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers={"Authorization": f"Bearer {owner_token}"})
    assert res_owner.status_code == 200

    # 4. Attacker Customer download -> 403 Forbidden
    res_attacker = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers={"Authorization": f"Bearer {attacker_token}"})
    assert res_attacker.status_code == 403
    assert "permission" in res_attacker.text.lower()

    # 5. Unauthenticated download -> 401 Unauthorized
    res_anon = client.get(f"/api/v1/invoices/{invoice.id}/pdf")
    assert res_anon.status_code == 401


def test_pdf_missing_invoice_returns_404(client: TestClient, db_session: Session):
    """Validates that a request for a non-existent invoice returns 404 Not Found."""
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    random_id = uuid.uuid4()

    res = client.get(f"/api/v1/invoices/{random_id}/pdf", headers=headers)
    assert res.status_code == 404
    assert f"Invoice with ID {random_id} not found." in res.text


def test_pdf_invoice_with_missing_optional_customer_details(client: TestClient, db_session: Session):
    """
    Validates PDF generation when customer phone and billing address are None,
    and invoice is a direct charge with no subscription.
    """
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}

    uid = uuid.uuid4().hex[:6]
    customer = Customer(
        name=f"Minimal Client {uid}",
        email=f"minimal_{uid}@example.com",
        phone=None,
        billing_address=None
    )
    db_session.add(customer)
    db_session.flush()

    now = datetime.now(timezone.utc)
    invoice = Invoice(
        invoice_number=f"INV-MIN-{uid.upper()}",
        customer_id=customer.id,
        subscription_id=None,  # Direct billing
        billing_period_start=now,
        billing_period_end=now + timedelta(days=30),
        status=InvoiceStatus.PAID,
        issue_date=now,
        due_date=now + timedelta(days=15),
        subtotal=Decimal("100.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total=Decimal("100.00"),
        amount_paid=Decimal("100.00"),
        balance_due=Decimal("0.00")
    )
    db_session.add(invoice)
    db_session.flush()

    item = InvoiceItem(
        invoice_id=invoice.id,
        description="One-Off Consulting Session",
        quantity=1,
        unit_price=Decimal("100.00"),
        tax_rate=Decimal("0.00"),
        line_total=Decimal("100.00")
    )
    db_session.add(item)
    db_session.commit()

    res = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers=headers)
    assert res.status_code == 200

    reader = PdfReader(io.BytesIO(res.content))
    extracted = "".join(page.extract_text() for page in reader.pages)
    assert "Minimal Client" in extracted
    assert "Direct Billing" in extracted
    assert "PAID" in extracted
    assert "$100.00" in extracted


def test_pdf_large_invoice_multi_page(client: TestClient, db_session: Session):
    """
    Validates that an invoice with dozens of items automatically paginates,
    keeps page headers and footers intact, and displays 'Page X of Y'.
    """
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, invoice = setup_customer_and_invoice(db_session)

    # Add 40 additional items to force multi-page layout
    for i in range(1, 41):
        item = InvoiceItem(
            invoice_id=invoice.id,
            description=f"Automated Provisioning Node #{i} with High-Availability Multi-Region Redundancy Cluster Configuration",
            quantity=1,
            unit_price=Decimal("50.00"),
            tax_rate=Decimal("10.00"),
            line_total=Decimal("55.00")
        )
        db_session.add(item)
    db_session.commit()

    res = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers=headers)
    assert res.status_code == 200

    reader = PdfReader(io.BytesIO(res.content))
    total_pages = len(reader.pages)
    assert total_pages >= 2, f"Expected at least 2 pages for 42 items, got {total_pages}"

    first_page_text = reader.pages[0].extract_text()
    last_page_text = reader.pages[-1].extract_text()

    assert f"Page 1 of {total_pages}" in first_page_text
    assert f"Page {total_pages} of {total_pages}" in last_page_text


def test_download_pdf_does_not_mutate_invoice_or_payments(client: TestClient, db_session: Session):
    """
    Validates that downloading the PDF is an idempotent read operation
    that does not modify invoice fields, status, balances, or payment timestamps.
    """
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, invoice = setup_customer_and_invoice(db_session)

    initial_status = invoice.status
    initial_total = invoice.total
    initial_balance = invoice.balance_due
    initial_paid = invoice.amount_paid
    initial_updated = invoice.updated_at

    # Download 3 times
    for _ in range(3):
        res = client.get(f"/api/v1/invoices/{invoice.id}/pdf", headers=headers)
        assert res.status_code == 200

    db_session.expire_all()
    db_session.refresh(invoice)

    assert invoice.status == initial_status
    assert invoice.total == initial_total
    assert invoice.balance_due == initial_balance
    assert invoice.amount_paid == initial_paid
    assert invoice.updated_at == initial_updated


def test_pdf_service_with_custom_logo(db_session: Session):
    """
    Validates that InvoicePDFService correctly loads and embeds an image logo
    when a valid logo file path is provided.
    """
    from PIL import Image as PILImage
    customer, invoice = setup_customer_and_invoice(db_session)

    # Create temporary PNG logo
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tmp:
        tmp_path = tmp.name
        img = PILImage.new("RGB", (200, 60), color=(37, 99, 235))
        img.save(tmp_path, "PNG")

    try:
        pdf_bytes = InvoicePDFService.generate_pdf(invoice=invoice, logo_path=tmp_path)
        assert pdf_bytes.startswith(b"%PDF-")
        reader = PdfReader(io.BytesIO(pdf_bytes))
        assert len(reader.pages) == 1
    finally:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
