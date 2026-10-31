from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash
from app.models import (
    Customer,
    Discount,
    Invoice,
    Plan,
    Product,
    Quotation,
    QuotationItem,
    Subscription,
    SubscriptionItem,
    User,
    BillingInterval,
    DiscountType,
    InvoiceStatus,
    ProductType,
    QuotationStatus,
    SubscriptionStatus,
    UserRole,
)
from app.services.billing_service import BillingService, BillingRunRequest
from app.services.tax_service import TaxService
from app.services.discount_service import DiscountService
from app.core.exceptions import BadRequestException


def create_user(db_session: Session, role: UserRole) -> tuple[User, str]:
    uid = uuid.uuid4().hex[:6]
    user = User(
        name=f"Finance Lead {uid}",
        email=f"finance_{uid}@billsync.local",
        password_hash=get_password_hash("FinancePass123!"),
        role=role,
        is_active=True
    )
    db_session.add(user)
    db_session.commit()
    token = create_access_token(subject=str(user.id))
    return user, token


def create_customer_and_product(db_session: Session) -> tuple[Customer, Product, Plan]:
    uid = uuid.uuid4().hex[:6]
    customer = Customer(
        name=f"Acme Corp {uid}",
        email=f"acme_{uid}@example.com",
        billing_address="123 Financial Way, Suite 100"
    )
    product = Product(
        name=f"BillSync SaaS Enterprise {uid}",
        description="Enterprise platform tier",
        product_type=ProductType.SUBSCRIPTION,
        sales_price=Decimal("250.00"),
        cost_price=Decimal("40.00"),
        is_active=True
    )
    db_session.add_all([customer, product])
    db_session.flush()

    plan = Plan(
        product_id=product.id,
        name=f"Enterprise Monthly {uid}",
        price=Decimal("250.00"),
        billing_interval=BillingInterval.MONTHLY,
        is_active=True
    )
    db_session.add(plan)
    db_session.commit()
    return customer, product, plan


def test_quotation_conversion_initial_invoice_financial_fidelity(client: TestClient, db_session: Session):
    """
    Validates that:
    1. Quotation with negotiated pricing, tax rate, and discount converts to subscription.
    2. Generating the initial invoice inherits both quotation line-item tax rates and discount amount.
    3. Reconciles subtotal + tax - discount == total == amount_paid + balance_due.
    """
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, product, plan = create_customer_and_product(db_session)

    # 1. Draft Quotation:
    # 2 units @ negotiated price 200.00 (catalog is 250.00)
    # Tax rate 10.00%
    # Discount amount 50.00
    # Subtotal = 400.00, Tax = 40.00, Discount = 50.00, Total = 390.00
    now = datetime.now(timezone.utc)
    quote_payload = {
        "customer_id": str(customer.id),
        "valid_until": (now + timedelta(days=14)).isoformat(),
        "items": [
            {
                "product_id": str(product.id),
                "quantity": 2,
                "unit_price": "200.00",
                "tax_rate": "10.00"
            }
        ],
        "discount_amount": "50.00"
    }
    create_res = client.post("/api/v1/quotations", json=quote_payload, headers=headers)
    assert create_res.status_code == 201
    quote = create_res.json()["data"]
    quote_id = quote["id"]
    assert Decimal(str(quote["subtotal"])) == Decimal("400.00")
    assert Decimal(str(quote["tax_amount"])) == Decimal("40.00")
    assert Decimal(str(quote["discount_amount"])) == Decimal("50.00")
    assert Decimal(str(quote["total"])) == Decimal("390.00")

    # Accept quotation
    acc_res = client.post(f"/api/v1/quotations/{quote_id}/accept", headers=headers)
    assert acc_res.status_code == 200

    # Convert to subscription without auto-generating invoice
    conv_payload = {
        "start_date": now.isoformat(),
        "plan_id": str(plan.id),
        "generate_initial_invoice": False
    }
    conv_res = client.post(f"/api/v1/quotations/{quote_id}/convert-to-subscription", json=conv_payload, headers=headers)
    assert conv_res.status_code == 201
    sub_id = conv_res.json()["data"]["id"]

    # Generate initial invoice via API with omitted discount and tax rate
    inv_payload = {
        "subscription_id": sub_id,
        "billing_period_start": now.isoformat(),
        "billing_period_end": (now + timedelta(days=30)).isoformat()
    }
    inv_res = client.post("/api/v1/invoices/generate", json=inv_payload, headers=headers)
    assert inv_res.status_code == 201, inv_res.text
    inv = inv_res.json()

    # Verify financial consistency
    subtotal = Decimal(str(inv["subtotal"]))
    tax_amount = Decimal(str(inv["tax_amount"]))
    discount_amount = Decimal(str(inv["discount_amount"]))
    total = Decimal(str(inv["total"]))
    balance_due = Decimal(str(inv["balance_due"]))
    amount_paid = Decimal(str(inv["amount_paid"]))

    assert subtotal == Decimal("400.00")
    assert tax_amount == Decimal("40.00")
    assert discount_amount == Decimal("50.00")
    assert total == Decimal("390.00")
    assert balance_due == Decimal("390.00")
    assert amount_paid == Decimal("0.00")
    assert total == (subtotal + tax_amount - discount_amount)
    assert total == (amount_paid + balance_due)


def test_quotation_conversion_auto_initial_invoice(client: TestClient, db_session: Session):
    """
    Validates that when generate_initial_invoice=True during conversion,
    the initial invoice automatically created retains quotation discount and tax.
    """
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, product, plan = create_customer_and_product(db_session)

    now = datetime.now(timezone.utc)
    quote_payload = {
        "customer_id": str(customer.id),
        "valid_until": (now + timedelta(days=14)).isoformat(),
        "items": [
            {
                "product_id": str(product.id),
                "quantity": 3,
                "unit_price": "100.00",
                "tax_rate": "15.00"
            }
        ],
        "discount_amount": "20.00"
    }
    create_res = client.post("/api/v1/quotations", json=quote_payload, headers=headers)
    assert create_res.status_code == 201
    quote_id = create_res.json()["data"]["id"]

    client.post(f"/api/v1/quotations/{quote_id}/accept", headers=headers)

    # Convert with auto-generating initial invoice
    conv_payload = {
        "start_date": now.isoformat(),
        "plan_id": str(plan.id),
        "generate_initial_invoice": True
    }
    conv_res = client.post(f"/api/v1/quotations/{quote_id}/convert-to-subscription", json=conv_payload, headers=headers)
    assert conv_res.status_code == 201
    sub_id = conv_res.json()["data"]["id"]

    # Retrieve the automatically created invoice
    invoices = list(db_session.scalars(select(Invoice).where(Invoice.subscription_id == uuid.UUID(sub_id))).all())
    assert len(invoices) == 1
    inv = invoices[0]

    # Subtotal = 3 * 100.00 = 300.00
    # Tax = 15% on 300.00 = 45.00
    # Discount = 20.00
    # Total = 300.00 + 45.00 - 20.00 = 325.00
    assert inv.subtotal == Decimal("300.00")
    assert inv.tax_amount == Decimal("45.00")
    assert inv.discount_amount == Decimal("20.00")
    assert inv.total == Decimal("325.00")
    assert inv.balance_due == Decimal("325.00")


def test_recurring_invoice_does_not_reuse_one_time_quotation_discount(client: TestClient, db_session: Session):
    """
    Validates that:
    1. Initial invoice gets the quotation discount.
    2. Subsequent recurring billing invoices do NOT get the quotation discount, billing full price + tax.
    """
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, product, plan = create_customer_and_product(db_session)

    now = datetime.now(timezone.utc)
    quote_payload = {
        "customer_id": str(customer.id),
        "items": [
            {
                "product_id": str(product.id),
                "quantity": 1,
                "unit_price": "200.00",
                "tax_rate": "10.00"
            }
        ],
        "discount_amount": "50.00"
    }
    create_res = client.post("/api/v1/quotations", json=quote_payload, headers=headers)
    quote_id = create_res.json()["data"]["id"]
    client.post(f"/api/v1/quotations/{quote_id}/accept", headers=headers)

    # Convert with initial invoice: Subtotal 200, Tax 20, Discount 50, Total 170
    conv_res = client.post(
        f"/api/v1/quotations/{quote_id}/convert-to-subscription",
        json={"plan_id": str(plan.id), "generate_initial_invoice": True},
        headers=headers
    )
    sub_id = conv_res.json()["data"]["id"]
    sub_uuid = uuid.UUID(sub_id)

    # Check initial invoice
    inv1 = db_session.scalars(select(Invoice).where(Invoice.subscription_id == sub_uuid)).first()
    assert inv1 is not None
    assert inv1.total == Decimal("170.00")
    assert inv1.discount_amount == Decimal("50.00")

    # Advance subscription due date into the past for Month 2 recurring billing
    sub = db_session.get(Subscription, sub_uuid)
    sub.next_billing_date = now - timedelta(days=1)
    db_session.commit()

    # Run recurring billing cycle
    run_req = BillingRunRequest(subscription_ids=[sub_uuid], default_tax_rate=Decimal("10.00"))
    summary = BillingService.run_billing_cycle(db=db_session, request=run_req)
    assert summary.invoices_created == 1

    # Check Month 2 invoice
    invoices = list(db_session.scalars(
        select(Invoice).where(Invoice.subscription_id == sub_uuid).order_by(Invoice.created_at.desc())
    ).all())
    assert len(invoices) == 2
    inv2 = invoices[0]  # latest
    # Subtotal 200.00, Tax 10% = 20.00, Discount = 0.00, Total = 220.00
    assert inv2.subtotal == Decimal("200.00")
    assert inv2.tax_amount == Decimal("20.00")
    assert inv2.discount_amount == Decimal("0.00")
    assert inv2.total == Decimal("220.00")
    assert inv2.balance_due == Decimal("220.00")


def test_fixed_and_percentage_discounts(db_session: Session):
    """Tests TaxService and DiscountService with percentage and fixed discounts and precision."""
    subtotal = Decimal("100.00")

    # Percentage discount: 15% of 100 = 15.00
    pct_discount = Discount(
        name=f"PCT15_{uuid.uuid4().hex[:4]}",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("15.00"),
        is_active=True
    )
    db_session.add(pct_discount)
    db_session.commit()

    amt1 = DiscountService.validate_discount_entity(pct_discount, subtotal=subtotal)
    assert amt1 == Decimal("15.00")

    # Fractional percentage: 12.375% quantizes to 12.38%, 12.38% of 150.00 = 18.57
    pct_frac = Discount(
        name=f"FRAC_{uuid.uuid4().hex[:4]}",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("12.375"),
        is_active=True
    )
    amt2 = DiscountService.validate_discount_entity(pct_frac, subtotal=Decimal("150.00"))
    assert amt2 == Decimal("18.57")

    # Fixed discount exceeding subtotal must raise BadRequestException
    fixed_oversized = Discount(
        name=f"FIXED_{uuid.uuid4().hex[:4]}",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("150.00"),
        is_active=True
    )
    with pytest.raises(BadRequestException, match="cannot exceed eligible subtotal"):
        DiscountService.validate_discount_entity(fixed_oversized, subtotal=Decimal("100.00"))


def test_discount_expiration_and_usage_limits(db_session: Session):
    """Validates that expired or maxed-out discounts are rejected."""
    now = datetime.now(timezone.utc)

    # Expired discount
    expired = Discount(
        name=f"EXP_{uuid.uuid4().hex[:4]}",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("10.00"),
        end_date=now - timedelta(days=1),
        is_active=True
    )
    db_session.add(expired)
    db_session.commit()

    with pytest.raises(BadRequestException, match="expired"):
        DiscountService.validate_discount_entity(expired, subtotal=Decimal("100.00"))

    # Max uses exceeded
    maxed = Discount(
        name=f"MAX_{uuid.uuid4().hex[:4]}",
        discount_type=DiscountType.FIXED,
        discount_value=Decimal("10.00"),
        usage_limit=2,
        usage_count=2,
        is_active=True
    )
    db_session.add(maxed)
    db_session.commit()

    with pytest.raises(BadRequestException, match="usage limit"):
        DiscountService.validate_discount_entity(maxed, subtotal=Decimal("100.00"))


def test_payment_and_refund_balance_reconciliation(client: TestClient, db_session: Session):
    """Tests invoice balance reconciliation across partial payment, full payment, and refund."""
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, product, plan = create_customer_and_product(db_session)

    # Create active subscription directly
    now = datetime.now(timezone.utc)
    sub = Subscription(
        subscription_number=f"SUB-{uuid.uuid4().hex[:6]}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        next_billing_date=now
    )
    db_session.add(sub)
    db_session.flush()

    sub_item = SubscriptionItem(
        subscription_id=sub.id,
        product_id=product.id,
        quantity=2,
        unit_price=Decimal("100.00")
    )
    db_session.add(sub_item)
    db_session.commit()

    # Generate invoice: 2 * 100 = 200, Tax 10% = 20, Total = 220
    inv_res = client.post("/api/v1/invoices/generate", json={
        "subscription_id": str(sub.id),
        "tax_rate": "10.00"
    }, headers=headers)
    assert inv_res.status_code == 201
    inv_id = inv_res.json()["id"]

    # 1. Partial payment: 100.00
    p1 = client.post("/api/v1/payments", json={
        "invoice_id": inv_id,
        "amount": "100.00",
        "payment_method": "CREDIT_CARD",
        "transaction_reference": f"txn_{uuid.uuid4().hex[:6]}",
        "status": "SUCCESSFUL"
    }, headers=headers)
    assert p1.status_code == 201
    inv_state1 = client.get(f"/api/v1/invoices/{inv_id}", headers=headers).json()
    assert inv_state1["status"] == "PARTIALLY_PAID"
    assert Decimal(str(inv_state1["amount_paid"])) == Decimal("100.00")
    assert Decimal(str(inv_state1["balance_due"])) == Decimal("120.00")

    # 2. Overpayment attempt: 150.00 (balance due is only 120.00)
    p_over = client.post("/api/v1/payments", json={
        "invoice_id": inv_id,
        "amount": "150.00",
        "payment_method": "CREDIT_CARD",
        "transaction_reference": f"txn_{uuid.uuid4().hex[:6]}",
        "status": "SUCCESSFUL"
    }, headers=headers)
    assert p_over.status_code == 400

    # 3. Pay remaining 120.00 -> PAID
    p2 = client.post("/api/v1/payments", json={
        "invoice_id": inv_id,
        "amount": "120.00",
        "payment_method": "BANK_TRANSFER",
        "transaction_reference": f"txn_{uuid.uuid4().hex[:6]}",
        "status": "SUCCESSFUL"
    }, headers=headers)
    assert p2.status_code == 201
    p2_id = p2.json()["data"]["id"]
    inv_state2 = client.get(f"/api/v1/invoices/{inv_id}", headers=headers).json()
    assert inv_state2["status"] == "PAID"
    assert Decimal(str(inv_state2["amount_paid"])) == Decimal("220.00")
    assert Decimal(str(inv_state2["balance_due"])) == Decimal("0.00")

    # 4. Refund p2 (120.00) -> returns to PARTIALLY_PAID
    ref = client.post(f"/api/v1/payments/{p2_id}/refund", json={"refund_reason": "Refund requested"}, headers=headers)
    assert ref.status_code == 200
    inv_state3 = client.get(f"/api/v1/invoices/{inv_id}", headers=headers).json()
    assert inv_state3["status"] == "PARTIALLY_PAID"
    assert Decimal(str(inv_state3["amount_paid"])) == Decimal("100.00")
    assert Decimal(str(inv_state3["balance_due"])) == Decimal("120.00")


def test_decimal_rounding_and_invalid_financial_inputs():
    """Validates Decimal precision, rounding behavior, and input boundaries."""
    # Rounding HALF_UP check: 33.335 -> 33.34
    assert TaxService.to_decimal(Decimal("33.335")) == Decimal("33.34")
    assert TaxService.to_decimal("33.334") == Decimal("33.33")

    # Negative unit price rejection
    with pytest.raises(BadRequestException, match="cannot be negative"):
        TaxService.calculate_item_tax(Decimal("-5.00"), 1, Decimal("10.00"))

    # Negative quantity rejection
    with pytest.raises(BadRequestException, match="cannot be negative"):
        TaxService.calculate_item_tax(Decimal("50.00"), -1, Decimal("10.00"))

    # Negative tax rate rejection
    with pytest.raises(BadRequestException, match="cannot be negative"):
        TaxService.validate_tax_rate(Decimal("-1.00"))

    # Excessive tax rate rejection (> 100%)
    with pytest.raises(BadRequestException, match="cannot exceed 100"):
        TaxService.validate_tax_rate(Decimal("100.01"))


def test_duplicate_invoice_prevention(client: TestClient, db_session: Session):
    """Validates that generating two invoices for the exact same billing period is blocked."""
    staff_user, staff_token = create_user(db_session, UserRole.STAFF)
    headers = {"Authorization": f"Bearer {staff_token}"}
    customer, product, plan = create_customer_and_product(db_session)

    now = datetime.now(timezone.utc)
    sub = Subscription(
        subscription_number=f"SUB-{uuid.uuid4().hex[:6]}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        next_billing_date=now
    )
    db_session.add(sub)
    db_session.flush()

    sub_item = SubscriptionItem(
        subscription_id=sub.id,
        product_id=product.id,
        quantity=1,
        unit_price=Decimal("150.00")
    )
    db_session.add(sub_item)
    db_session.commit()

    payload = {
        "subscription_id": str(sub.id),
        "billing_period_start": now.isoformat(),
        "billing_period_end": (now + timedelta(days=30)).isoformat()
    }
    res1 = client.post("/api/v1/invoices/generate", json=payload, headers=headers)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/invoices/generate", json=payload, headers=headers)
    assert res2.status_code == 409
    assert "already exists" in res2.text
