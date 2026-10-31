from datetime import datetime, timezone, timedelta
from decimal import Decimal
import uuid
import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.security import get_password_hash
from app.models import (
    Customer,
    Invoice,
    Payment,
    Plan,
    Product,
    Quotation,
    QuotationItem,
    Subscription,
    SubscriptionItem,
    User,
    BillingInterval,
    InvoiceStatus,
    PaymentMethod,
    PaymentStatus,
    ProductType,
    QuotationStatus,
    SubscriptionStatus,
    UserRole,
)


def test_complete_business_workflow_e2e(client: TestClient, db_session: Session):
    """
    End-to-End integration test covering the complete business workflow:
    1. Admin & Staff user creation and authentication.
    2. Admin creates catalog product and subscription plan via API.
    3. Staff creates customer record via API.
    4. Staff drafts quotation for customer with custom pricing and taxes.
    5. Customer authenticates, views quotation, and accepts it.
    6. Staff converts accepted quotation to subscription with pricing snapshot.
    7. Generate initial invoice and verify financial balances.
    8. Record partial payment -> verify status PARTIALLY_PAID.
    9. Record remaining payment -> verify status PAID.
    10. Trigger recurring billing cycle for due subscription.
    11. Verify dashboard analytics and revenue chart.
    12. Verify payment refunding restores balance and updates metrics.
    """
    uid = uuid.uuid4().hex[:6]
    admin_password = "AdminSecretPass123!"
    staff_password = "StaffSecretPass123!"
    cust_password = "CustSecretPass123!"

    # 1. Create Admin and Staff users in DB for authentication test
    admin_user = User(
        name="Admin Lead",
        email=f"admin_{uid}@example.com",
        password_hash=get_password_hash(admin_password),
        role=UserRole.ADMIN,
        is_active=True
    )
    staff_user = User(
        name="Staff Rep",
        email=f"staff_{uid}@example.com",
        password_hash=get_password_hash(staff_password),
        role=UserRole.STAFF,
        is_active=True
    )
    db_session.add_all([admin_user, staff_user])
    db_session.commit()

    # Authenticate Admin via POST /api/v1/auth/login
    admin_login_res = client.post("/api/v1/auth/login", json={
        "email": admin_user.email,
        "password": admin_password
    })
    assert admin_login_res.status_code == 200, admin_login_res.text
    admin_token = admin_login_res.json()["data"]["access_token"]
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # Authenticate Staff via POST /api/v1/auth/login
    staff_login_res = client.post("/api/v1/auth/login", json={
        "email": staff_user.email,
        "password": staff_password
    })
    assert staff_login_res.status_code == 200
    staff_token = staff_login_res.json()["data"]["access_token"]
    staff_headers = {"Authorization": f"Bearer {staff_token}"}

    # Verify GET /api/v1/auth/me
    me_res = client.get("/api/v1/auth/me", headers=admin_headers)
    assert me_res.status_code == 200
    assert me_res.json()["data"]["email"] == admin_user.email

    # 2. Admin creates a Product via POST /api/v1/products
    prod_payload = {
        "name": f"Cloud Hosting Pro {uid}",
        "description": "High availability cloud server instance",
        "product_type": "SERVICE",
        "sales_price": "250.00",
        "cost_price": "100.00",
        "is_active": True
    }
    prod_res = client.post("/api/v1/products", json=prod_payload, headers=admin_headers)
    assert prod_res.status_code == 201, prod_res.text
    product_id = prod_res.json()["data"]["id"]

    # Admin creates a Plan via POST /api/v1/plans
    plan_payload = {
        "product_id": product_id,
        "name": f"Pro Monthly {uid}",
        "billing_interval": "MONTHLY",
        "price": "250.00",
        "minimum_quantity": 1,
        "allow_pause": True,
        "allow_early_close": True,
        "allow_renewal": True,
        "is_active": True
    }
    plan_res = client.post("/api/v1/plans", json=plan_payload, headers=admin_headers)
    assert plan_res.status_code == 201, plan_res.text
    plan_id = plan_res.json()["data"]["id"]

    # 3. Customer registers via POST /api/v1/auth/register
    cust_email = f"customer_{uid}@example.com"
    reg_payload = {
        "name": f"Acme Corp {uid}",
        "email": cust_email,
        "password": cust_password
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 201, reg_res.text

    # Customer logs in
    cust_login_res = client.post("/api/v1/auth/login", json={
        "email": cust_email,
        "password": cust_password
    })
    assert cust_login_res.status_code == 200
    cust_token = cust_login_res.json()["data"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {cust_token}"}

    # Fetch customer entity linked to this user
    cust_entity = db_session.scalars(
        __import__("sqlalchemy").select(Customer).where(Customer.email == cust_email)
    ).first()
    assert cust_entity is not None
    customer_id = str(cust_entity.id)

    # 4. Staff drafts quotation for Customer via POST /api/v1/quotations
    # Line item with negotiated price of 200.00 (down from 250.00) and 10% tax
    quote_payload = {
        "customer_id": customer_id,
        "items": [
            {
                "product_id": product_id,
                "plan_id": plan_id,
                "description": "Negotiated Enterprise Package",
                "quantity": 2,
                "unit_price": "200.00",
                "tax_rate": "10.00"
            }
        ],
        "discount_amount": "50.00",
        "terms_and_conditions": "Net 30 payment terms"
    }
    quote_res = client.post("/api/v1/quotations", json=quote_payload, headers=staff_headers)
    assert quote_res.status_code == 201, quote_res.text
    quote_data = quote_res.json()["data"]
    quote_id = quote_data["id"]
    # Subtotal = 2 * 200 = 400.00
    # Discount = 50.00 -> Net = 350.00
    # Tax = 10% on 400.00 = 40.00
    # Total = 400.00 - 50.00 + 40.00 = 390.00
    assert Decimal(str(quote_data["subtotal"])) == Decimal("400.00")
    assert Decimal(str(quote_data["tax_amount"])) == Decimal("40.00")
    assert Decimal(str(quote_data["total"])) == Decimal("390.00")

    # 5. Customer views quotation and accepts it
    cust_view_res = client.get(f"/api/v1/quotations/{quote_id}", headers=cust_headers)
    assert cust_view_res.status_code == 200
    assert cust_view_res.json()["data"]["customer_id"] == customer_id

    # Cross-customer access check: unassociated user forbidden
    other_token_user = User(
        name="Attacker",
        email=f"attacker_{uid}@example.com",
        password_hash=get_password_hash("AttackerPass123!"),
        role=UserRole.CUSTOMER,
        is_active=True
    )
    db_session.add(other_token_user)
    db_session.commit()
    from app.core.security import create_access_token
    other_token = create_access_token(other_token_user.id)
    forbidden_res = client.get(f"/api/v1/quotations/{quote_id}", headers={"Authorization": f"Bearer {other_token}"})
    assert forbidden_res.status_code == 403

    # Customer accepts quotation via /accept
    accept_res = client.post(f"/api/v1/quotations/{quote_id}/accept", headers=cust_headers)
    assert accept_res.status_code == 200
    assert accept_res.json()["data"]["status"] == "ACCEPTED"

    # 6. Staff converts accepted quotation to subscription
    now = datetime.now(timezone.utc)
    conv_payload = {
        "start_date": now.isoformat(),
        "generate_initial_invoice": False
    }
    conv_res = client.post(f"/api/v1/quotations/{quote_id}/convert-to-subscription", json=conv_payload, headers=staff_headers)
    assert conv_res.status_code == 201, conv_res.text
    sub_data = conv_res.json()["data"]
    subscription_id = sub_data["id"]
    assert sub_data["status"] == "ACTIVE"
    # Verify locked price snapshot: 200.00 preserved
    assert len(sub_data["items"]) == 1
    assert Decimal(str(sub_data["items"][0]["unit_price"])) == Decimal("200.00")
    assert sub_data["items"][0]["quantity"] == 2

    # Prevent duplicate conversion
    dup_conv = client.post(f"/api/v1/quotations/{quote_id}/convert-to-subscription", json=conv_payload, headers=staff_headers)
    assert dup_conv.status_code == 409

    # 7. Generate Initial Invoice via POST /api/v1/invoices/generate
    inv_start = now
    inv_end = now + timedelta(days=30)
    inv_payload = {
        "subscription_id": subscription_id,
        "billing_period_start": inv_start.isoformat(),
        "billing_period_end": inv_end.isoformat(),
        "tax_rate": "10.00"
    }
    inv_res = client.post("/api/v1/invoices/generate", json=inv_payload, headers=staff_headers)
    assert inv_res.status_code == 201, inv_res.text
    inv_data = inv_res.json()
    invoice_id = inv_data["id"]

    # Subtotal: 2 * 200.00 = 400.00; Tax 10% = 40.00; Total = 440.00; balance_due = 440.00
    assert Decimal(str(inv_data["subtotal"])) == Decimal("400.00")
    assert Decimal(str(inv_data["tax_amount"])) == Decimal("40.00")
    assert Decimal(str(inv_data["total"])) == Decimal("440.00")
    assert Decimal(str(inv_data["balance_due"])) == Decimal("440.00")
    assert Decimal(str(inv_data["amount_paid"])) == Decimal("0.00")

    # Duplicate invoice prevention for same billing period
    dup_inv_res = client.post("/api/v1/invoices/generate", json=inv_payload, headers=staff_headers)
    assert dup_inv_res.status_code == 409

    # 8. Record partial payment of 200.00
    pay_payload1 = {
        "invoice_id": invoice_id,
        "amount": "200.00",
        "payment_method": "CREDIT_CARD",
        "transaction_reference": f"txn_{uid}_1",
        "status": "SUCCESSFUL"
    }
    pay_res1 = client.post("/api/v1/payments", json=pay_payload1, headers=staff_headers)
    assert pay_res1.status_code == 201, pay_res1.text

    # Verify invoice status is now PARTIALLY_PAID
    inv_chk1 = client.get(f"/api/v1/invoices/{invoice_id}", headers=staff_headers)
    assert inv_chk1.status_code == 200
    inv_chk1_data = inv_chk1.json()
    assert inv_chk1_data["status"] == "PARTIALLY_PAID"
    assert Decimal(str(inv_chk1_data["amount_paid"])) == Decimal("200.00")
    assert Decimal(str(inv_chk1_data["balance_due"])) == Decimal("240.00")

    # 9. Record remaining payment of 240.00
    pay_payload2 = {
        "invoice_id": invoice_id,
        "amount": "240.00",
        "payment_method": "BANK_TRANSFER",
        "transaction_reference": f"txn_{uid}_2",
        "status": "SUCCESSFUL"
    }
    pay_res2 = client.post("/api/v1/payments", json=pay_payload2, headers=staff_headers)
    assert pay_res2.status_code == 201, pay_res2.text
    payment2_id = pay_res2.json()["data"]["id"]

    # Verify invoice status is now PAID
    inv_chk2 = client.get(f"/api/v1/invoices/{invoice_id}", headers=staff_headers)
    assert inv_chk2.status_code == 200
    inv_chk2_data = inv_chk2.json()
    assert inv_chk2_data["status"] == "PAID"
    assert Decimal(str(inv_chk2_data["amount_paid"])) == Decimal("440.00")
    assert Decimal(str(inv_chk2_data["balance_due"])) == Decimal("0.00")

    # 10. Recurring Billing Cycle: make subscription due for next period
    sub_entity = db_session.get(Subscription, uuid.UUID(subscription_id))
    assert sub_entity is not None
    # Set next_billing_date to yesterday so it is due
    sub_entity.next_billing_date = datetime.now(timezone.utc) - timedelta(days=1)
    db_session.commit()

    # Trigger billing run
    bill_run_res = client.post("/api/v1/billing/run", json={"default_tax_rate": "10.00"}, headers=staff_headers)
    assert bill_run_res.status_code == 200, bill_run_res.text
    bill_data = bill_run_res.json()["data"]
    assert bill_data["processed"] >= 1
    assert bill_data["invoices_created"] >= 1

    # Verify next billing date advanced into future
    db_session.refresh(sub_entity)
    assert sub_entity.next_billing_date > datetime.now(timezone.utc)

    # 11. Verify Dashboard statistics
    stats_res = client.get("/api/v1/dashboard/stats", headers=admin_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()["data"]
    assert Decimal(str(stats["total_revenue_received"])) >= Decimal("440.00")
    assert stats["total_active_subscriptions"] >= 1

    # 12. Refund payment2 and verify balance restoration
    ref_res = client.post(f"/api/v1/payments/{payment2_id}/refund", json={"refund_reason": "Customer requested refund"}, headers=admin_headers)
    assert ref_res.status_code == 200
    assert ref_res.json()["data"]["status"] == "REFUNDED"

    # Verify invoice status and balance returned to PARTIALLY_PAID
    inv_ref = client.get(f"/api/v1/invoices/{invoice_id}", headers=staff_headers)
    assert inv_ref.status_code == 200
    inv_ref_data = inv_ref.json()
    assert inv_ref_data["status"] == "PARTIALLY_PAID"
    assert Decimal(str(inv_ref_data["balance_due"])) == Decimal("240.00")
    assert Decimal(str(inv_ref_data["amount_paid"])) == Decimal("200.00")

