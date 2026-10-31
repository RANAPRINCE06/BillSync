from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    User, Customer, Product, Plan, Quotation, QuotationItem,
    Subscription, SubscriptionItem, Invoice, InvoiceItem, Payment, Discount,
    UserRole, BillingInterval, ProductType, QuotationStatus,
    SubscriptionStatus, InvoiceStatus, PaymentMethod, PaymentStatus, DiscountType
)


def test_user_and_customer_relationship(db_session: Session):
    """Test User creation and 1:1 relationship with Customer."""
    user = User(
        name="Alice Cooper",
        email=f"alice_{uuid.uuid4().hex[:6]}@example.com",
        password_hash="hashed_pw_test",
        role=UserRole.CUSTOMER,
        is_active=True
    )
    db_session.add(user)
    db_session.flush()

    customer = Customer(
        user_id=user.id,
        name="Alice Cooper",
        email=user.email,
        phone="+1234567890",
        billing_address="123 Financial Way, Suite 400"
    )
    db_session.add(customer)
    db_session.commit()

    # Verify query and reverse relationship
    fetched_user = db_session.get(User, user.id)
    assert fetched_user is not None
    assert fetched_user.customer is not None
    assert fetched_user.customer.billing_address == "123 Financial Way, Suite 400"
    assert fetched_user.customer.user.email == user.email


def test_product_and_plan_relationship(db_session: Session):
    """Test Product creation with linked Plan."""
    product = Product(
        name=f"Cloud Storage Tier - {uuid.uuid4().hex[:4]}",
        description="Secure cloud storage plan",
        product_type=ProductType.SUBSCRIPTION,
        sales_price=Decimal("49.99"),
        cost_price=Decimal("15.00"),
        is_active=True
    )
    db_session.add(product)
    db_session.flush()

    plan = Plan(
        product_id=product.id,
        name="Monthly Pro 100GB",
        billing_interval=BillingInterval.MONTHLY,
        price=Decimal("49.99"),
        minimum_quantity=1,
        allow_pause=True,
        allow_early_close=True,
        allow_renewal=True,
        is_active=True
    )
    db_session.add(plan)
    db_session.commit()

    fetched_product = db_session.get(Product, product.id)
    assert fetched_product is not None
    assert len(fetched_product.plans) >= 1
    assert fetched_product.plans[0].billing_interval == BillingInterval.MONTHLY


def test_quotation_and_items(db_session: Session):
    """Test Quotation creation and cascade items."""
    customer = Customer(
        name="Bob Builder",
        email=f"bob_{uuid.uuid4().hex[:6]}@example.com",
        billing_address="456 Construct Ave"
    )
    product = Product(
        name="Consulting Hourly",
        product_type=ProductType.SERVICE,
        sales_price=Decimal("150.00")
    )
    db_session.add_all([customer, product])
    db_session.flush()

    quotation = Quotation(
        quotation_number=f"QT-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        status=QuotationStatus.DRAFT,
        valid_until=datetime.now(timezone.utc) + timedelta(days=30),
        subtotal=Decimal("300.00"),
        tax_amount=Decimal("30.00"),
        discount_amount=Decimal("0.00"),
        total=Decimal("330.00")
    )
    db_session.add(quotation)
    db_session.flush()

    item = QuotationItem(
        quotation_id=quotation.id,
        product_id=product.id,
        quantity=2,
        unit_price=Decimal("150.00"),
        tax_rate=Decimal("10.00"),
        line_total=Decimal("330.00")
    )
    db_session.add(item)
    db_session.commit()

    fetched_quotation = db_session.get(Quotation, quotation.id)
    assert fetched_quotation is not None
    assert len(fetched_quotation.items) == 1
    assert fetched_quotation.items[0].line_total == Decimal("330.00")


def test_subscription_and_items(db_session: Session):
    """Test Subscription linked to Customer and Plan."""
    customer = Customer(
        name="Charlie Tech",
        email=f"charlie_{uuid.uuid4().hex[:6]}@example.com"
    )
    product = Product(
        name="SaaS License",
        sales_price=Decimal("29.00")
    )
    db_session.add_all([customer, product])
    db_session.flush()

    plan = Plan(
        product_id=product.id,
        name="Basic Monthly",
        billing_interval=BillingInterval.MONTHLY,
        price=Decimal("29.00")
    )
    db_session.add(plan)
    db_session.flush()

    now = datetime.now(timezone.utc)
    sub = Subscription(
        subscription_number=f"SUB-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now,
        next_billing_date=now + timedelta(days=30)
    )
    db_session.add(sub)
    db_session.flush()

    sub_item = SubscriptionItem(
        subscription_id=sub.id,
        product_id=product.id,
        quantity=5,
        unit_price=Decimal("29.00")
    )
    db_session.add(sub_item)
    db_session.commit()

    fetched_sub = db_session.get(Subscription, sub.id)
    assert fetched_sub is not None
    assert fetched_sub.status == SubscriptionStatus.ACTIVE
    assert len(fetched_sub.items) == 1
    assert fetched_sub.items[0].quantity == 5


def test_invoice_and_payment_flow(db_session: Session):
    """Test Invoice, InvoiceItem, Payment recording and historical preservation."""
    customer = Customer(
        name="Delta Corp",
        email=f"delta_{uuid.uuid4().hex[:6]}@example.com"
    )
    product = Product(
        name="Database Engine",
        sales_price=Decimal("199.00")
    )
    db_session.add_all([customer, product])
    db_session.flush()

    now = datetime.now(timezone.utc)
    invoice = Invoice(
        invoice_number=f"INV-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        billing_period_start=now,
        billing_period_end=now + timedelta(days=30),
        status=InvoiceStatus.CONFIRMED,
        issue_date=now,
        due_date=now + timedelta(days=14),
        subtotal=Decimal("199.00"),
        tax_amount=Decimal("19.90"),
        discount_amount=Decimal("0.00"),
        total=Decimal("218.90"),
        amount_paid=Decimal("0.00"),
        balance_due=Decimal("218.90")
    )
    db_session.add(invoice)
    db_session.flush()

    # Invoice item preserving historical rates
    inv_item = InvoiceItem(
        invoice_id=invoice.id,
        product_id=product.id,
        description="Database Engine (1 Month)",
        quantity=1,
        unit_price=Decimal("199.00"),
        tax_rate=Decimal("10.00"),
        line_total=Decimal("218.90")
    )
    db_session.add(inv_item)
    db_session.flush()

    # Record Payment
    payment = Payment(
        invoice_id=invoice.id,
        payment_reference=f"PAY-{uuid.uuid4().hex[:8].upper()}",
        payment_method=PaymentMethod.CREDIT_CARD,
        amount=Decimal("218.90"),
        payment_date=now,
        status=PaymentStatus.SUCCESSFUL
    )
    db_session.add(payment)
    db_session.commit()

    fetched_inv = db_session.get(Invoice, invoice.id)
    assert fetched_inv is not None
    assert len(fetched_inv.items) == 1
    assert len(fetched_inv.payments) == 1
    assert fetched_inv.payments[0].amount == Decimal("218.90")
    assert fetched_inv.payments[0].status == PaymentStatus.SUCCESSFUL


def test_duplicate_invoice_billing_period_constraint(db_session: Session):
    """Test that duplicate invoice creation for the same subscription and period is prevented."""
    customer = Customer(name="Echo Corp", email=f"echo_{uuid.uuid4().hex[:6]}@example.com")
    product = Product(name="App Service", sales_price=Decimal("50.00"))
    db_session.add_all([customer, product])
    db_session.flush()

    plan = Plan(product_id=product.id, name="App Plan", billing_interval=BillingInterval.MONTHLY, price=Decimal("50.00"))
    db_session.add(plan)
    db_session.flush()

    now = datetime(2026, 11, 1, 0, 0, 0, tzinfo=timezone.utc)
    end_date = now + timedelta(days=30)
    sub = Subscription(
        subscription_number=f"SUB-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        plan_id=plan.id,
        status=SubscriptionStatus.ACTIVE,
        start_date=now
    )
    db_session.add(sub)
    db_session.flush()

    inv1 = Invoice(
        invoice_number=f"INV-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        subscription_id=sub.id,
        billing_period_start=now,
        billing_period_end=end_date,
        status=InvoiceStatus.CONFIRMED,
        issue_date=now,
        due_date=now + timedelta(days=7),
        subtotal=Decimal("50.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total=Decimal("50.00"),
        balance_due=Decimal("50.00")
    )
    db_session.add(inv1)
    db_session.commit()

    # Attempting to insert second invoice for exact same subscription and billing period
    inv2 = Invoice(
        invoice_number=f"INV-{uuid.uuid4().hex[:8].upper()}",
        customer_id=customer.id,
        subscription_id=sub.id,
        billing_period_start=now,
        billing_period_end=end_date,
        status=InvoiceStatus.DRAFT,
        issue_date=now,
        due_date=now + timedelta(days=7),
        subtotal=Decimal("50.00"),
        tax_amount=Decimal("0.00"),
        discount_amount=Decimal("0.00"),
        total=Decimal("50.00"),
        balance_due=Decimal("50.00")
    )
    db_session.add(inv2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_discount_creation(db_session: Session):
    """Test Discount rule entity creation."""
    discount = Discount(
        name="HACKATHON2026",
        discount_type=DiscountType.PERCENTAGE,
        discount_value=Decimal("20.00"),
        minimum_quantity=1,
        usage_limit=100,
        is_active=True
    )
    db_session.add(discount)
    db_session.commit()

    fetched = db_session.get(Discount, discount.id)
    assert fetched is not None
    assert fetched.discount_value == Decimal("20.00")
    assert fetched.is_active is True
