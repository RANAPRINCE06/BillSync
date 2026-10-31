from datetime import datetime, timezone, timedelta
from decimal import Decimal
import io
import uuid
import pytest
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import create_access_token, get_password_hash
from app.models import (
    Customer,
    Discount,
    Invoice,
    InvoiceItem,
    Payment,
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
    PaymentMethod,
    PaymentStatus,
    ProductType,
    QuotationStatus,
    SubscriptionStatus,
    UserRole,
)
from app.services.billing_service import BillingService, BillingRunRequest


def test_complete_user_journey_and_edge_cases(client: TestClient, db_session: Session):
    """
    Executes the entire 24-step end-to-end user journey and edge-case validation
    against the actual PostgreSQL database, validating all business rules,
    financial reconciliation, role-based access, PDF generation, and demo readiness.
    """
    uid = uuid.uuid4().hex[:6]

    # =========================================================================
    # STEP 1: Verify health and database connectivity
    # =========================================================================
    health_res = client.get("/api/v1/health")
    assert health_res.status_code == 200
    assert health_res.json()["status"] == "ok"

    db_health_res = client.get("/api/v1/health/database")
    assert db_health_res.status_code == 200
    assert db_health_res.json()["status"] == "connected"

    # =========================================================================
    # STEP 2 & 3: User Registration & Authentication (Admin, Staff, Customer)
    # =========================================================================
    # Customer registration
    cust_email = f"customer_{uid}@example.com"
    cust_pass = "StrongPass123!"
    reg_payload = {
        "name": f"Alice Customer {uid}",
        "email": cust_email,
        "password": cust_pass
    }
    reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert reg_res.status_code == 201
    assert reg_res.json()["data"]["email"] == cust_email

    # Edge Case: Duplicate email registration rejection
    dup_reg_res = client.post("/api/v1/auth/register", json=reg_payload)
    assert dup_reg_res.status_code == 409

    # Customer login
    login_res = client.post("/api/v1/auth/login", json={"email": cust_email, "password": cust_pass})
    assert login_res.status_code == 200
    cust_token = login_res.json()["data"]["access_token"]
    cust_headers = {"Authorization": f"Bearer {cust_token}"}

    # Verify /auth/me for customer
    me_res = client.get("/api/v1/auth/me", headers=cust_headers)
    assert me_res.status_code == 200
    assert me_res.json()["data"]["role"] == "CUSTOMER"

    # Edge Case: Invalid login credentials
    bad_login_res = client.post("/api/v1/auth/login", json={"email": cust_email, "password": "WrongPassword!"})
    assert bad_login_res.status_code == 401

    # Create Staff User
    staff_user = User(
        name=f"Staff Member {uid}",
        email=f"staff_{uid}@billsync.local",
        password_hash=get_password_hash("StaffPass123!"),
        role=UserRole.STAFF,
        is_active=True
    )
    # Create Admin User
    admin_user = User(
        name=f"Admin User {uid}",
        email=f"admin_{uid}@billsync.local",
        password_hash=get_password_hash("AdminPass123!"),
        role=UserRole.ADMIN,
        is_active=True
    )
    db_session.add_all([staff_user, admin_user])
    db_session.commit()

    staff_token = create_access_token(str(staff_user.id))
    admin_token = create_access_token(str(admin_user.id))
    staff_headers = {"Authorization": f"Bearer {staff_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # =========================================================================
    # STEP 4 & 5: Role-Based Access Restrictions
    # =========================================================================
    # Customer attempts to create product -> 403 Forbidden
    cust_prod_res = client.post("/api/v1/products", json={"name": "Hacked", "sales_price": "10.00"}, headers=cust_headers)
    assert cust_prod_res.status_code == 403

    # =========================================================================
    # STEP 6: Product & Subscription Plan Creation (Admin)
    # =========================================================================
    prod_payload = {
        "name": f"Cloud Cluster Enterprise {uid}",
        "description": "High-availability compute cluster with SLA",
        "product_type": "SUBSCRIPTION",
        "sales_price": "250.00",
        "cost_price": "40.00",
        "is_active": True
    }
    prod_res = client.post("/api/v1/products", json=prod_payload, headers=admin_headers)
    assert prod_res.status_code == 201
    product_id = prod_res.json()["data"]["id"]

    plan_payload = {
        "product_id": product_id,
        "name": f"Enterprise Cluster Monthly {uid}",
        "price": "250.00",
        "billing_interval": "MONTHLY",
        "is_active": True
    }
    plan_res = client.post("/api/v1/plans", json=plan_payload, headers=admin_headers)
    assert plan_res.status_code == 201
    plan_id = plan_res.json()["data"]["id"]

    # =========================================================================
    # STEP 7: Customer Profile Setup & Staff Customer Creation
    # =========================================================================
    # User registration in Step 2 automatically provisions a customer record.
    # Staff looks up customer by email and updates their billing details.
    cust_search_res = client.get(f"/api/v1/customers?search={cust_email}", headers=staff_headers)
    assert cust_search_res.status_code == 200
    search_data = cust_search_res.json()["data"]
    assert search_data["total"] >= 1
    customer_id = search_data["items"][0]["id"]

    # Staff updates address and phone for the customer
    cust_update_payload = {
        "phone": "+1-800-555-0199",
        "billing_address": "500 Market Street\nSuite 1200\nSan Francisco, CA 94105"
    }
    cust_up_res = client.put(f"/api/v1/customers/{customer_id}", json=cust_update_payload, headers=staff_headers)
    assert cust_up_res.status_code == 200
    assert cust_up_res.json()["data"]["phone"] == "+1-800-555-0199"

    # Staff also creates an independent customer profile without an initial user
    indep_cust_payload = {
        "name": f"Independent Corp {uid}",
        "email": f"independent_{uid}@example.com",
        "phone": "+1-800-555-9988",
        "billing_address": "100 Enterprise Way, Austin, TX"
    }
    indep_res = client.post("/api/v1/customers", json=indep_cust_payload, headers=staff_headers)
    assert indep_res.status_code == 201

    # Edge Case: Attempting to create duplicate customer with same email returns 409
    dup_cust_res = client.post("/api/v1/customers", json=indep_cust_payload, headers=staff_headers)
    assert dup_cust_res.status_code == 409

    # =========================================================================
    # STEP 8: Create Quotation with Negotiated Pricing, Tax & Discount (Staff)
    # =========================================================================
    # Catalog is 250.00, negotiated is 200.00 per unit, qty 2.
    # Tax rate 10% on 400.00 = 40.00. Quotation discount = 50.00.
    # Total = 400.00 + 40.00 - 50.00 = 390.00.
    now = datetime.now(timezone.utc)
    quote_payload = {
        "customer_id": customer_id,
        "valid_until": (now + timedelta(days=14)).isoformat(),
        "items": [
            {
                "product_id": product_id,
                "quantity": 2,
                "unit_price": "200.00",
                "tax_rate": "10.00"
            }
        ],
        "discount_amount": "50.00",
        "terms_and_conditions": "Net 15 payment terms"
    }
    quote_res = client.post("/api/v1/quotations", json=quote_payload, headers=staff_headers)
    assert quote_res.status_code == 201
    quote_data = quote_res.json()["data"]
    quote_id = quote_data["id"]

    assert Decimal(str(quote_data["subtotal"])) == Decimal("400.00")
    assert Decimal(str(quote_data["tax_amount"])) == Decimal("40.00")
    assert Decimal(str(quote_data["discount_amount"])) == Decimal("50.00")
    assert Decimal(str(quote_data["total"])) == Decimal("390.00")

    # =========================================================================
    # STEP 9: Customer Views & Accepts Quotation; Cross-Customer Forbidden
    # =========================================================================
    # Attacker customer cannot access quotation
    attacker_user = User(
        name=f"Attacker Customer {uid}",
        email=f"attacker_{uid}@example.com",
        password_hash=get_password_hash("AttackerPass123!"),
        role=UserRole.CUSTOMER,
        is_active=True
    )
    db_session.add(attacker_user)
    db_session.commit()
    attacker_token = create_access_token(str(attacker_user.id))

    attacker_res = client.get(f"/api/v1/quotations/{quote_id}", headers={"Authorization": f"Bearer {attacker_token}"})
    assert attacker_res.status_code == 403

    # Associated customer views quotation
    view_quote_res = client.get(f"/api/v1/quotations/{quote_id}", headers=cust_headers)
    assert view_quote_res.status_code == 200
    assert view_quote_res.json()["data"]["customer_id"] == customer_id

    # Customer accepts quotation
    acc_res = client.post(f"/api/v1/quotations/{quote_id}/accept", headers=cust_headers)
    assert acc_res.status_code == 200
    assert acc_res.json()["data"]["status"] == "ACCEPTED"

    # Quotation duplication check
    dup_quote_res = client.post(f"/api/v1/quotations/{quote_id}/duplicate", headers=staff_headers)
    assert dup_quote_res.status_code == 201
    cloned_quote = dup_quote_res.json()["data"]
    assert cloned_quote["status"] == "DRAFT"
    assert cloned_quote["quotation_number"] != quote_data["quotation_number"]
    assert Decimal(str(cloned_quote["total"])) == Decimal("390.00")

    # =========================================================================
    # STEP 10: Convert Accepted Quotation into Subscription
    # =========================================================================
    conv_payload = {
        "plan_id": plan_id,
        "start_date": now.isoformat(),
        "generate_initial_invoice": False
    }
    conv_res = client.post(f"/api/v1/quotations/{quote_id}/convert-to-subscription", json=conv_payload, headers=staff_headers)
    assert conv_res.status_code == 201
    sub_data = conv_res.json()["data"]
    sub_id = sub_data["id"]
    assert sub_data["status"] == "ACTIVE"
    # Verify locked pricing snapshot (200.00)
    assert Decimal(str(sub_data["items"][0]["unit_price"])) == Decimal("200.00")

    # Edge Case: Duplicate conversion prevention
    dup_conv_res = client.post(f"/api/v1/quotations/{quote_id}/convert-to-subscription", json=conv_payload, headers=staff_headers)
    assert dup_conv_res.status_code == 409

    # =========================================================================
    # STEP 11 & 12: Initial Invoice Generation & Quotation Discount Carryover
    # =========================================================================
    inv_start = now
    inv_end = now + timedelta(days=30)
    inv_payload = {
        "subscription_id": sub_id,
        "billing_period_start": inv_start.isoformat(),
        "billing_period_end": inv_end.isoformat(),
        "tax_rate": "10.00"
    }
    inv_res = client.post("/api/v1/invoices/generate", json=inv_payload, headers=staff_headers)
    assert inv_res.status_code == 201
    inv_data = inv_res.json()
    invoice_id = inv_data["id"]

    # Verify financial accuracy: 400 + 40 - 50 = 390.00
    assert Decimal(str(inv_data["subtotal"])) == Decimal("400.00")
    assert Decimal(str(inv_data["tax_amount"])) == Decimal("40.00")
    assert Decimal(str(inv_data["discount_amount"])) == Decimal("50.00")
    assert Decimal(str(inv_data["total"])) == Decimal("390.00")
    assert Decimal(str(inv_data["balance_due"])) == Decimal("390.00")
    assert Decimal(str(inv_data["amount_paid"])) == Decimal("0.00")

    # Edge Case: Duplicate invoice generation blocked for same billing cycle
    dup_inv_res = client.post("/api/v1/invoices/generate", json=inv_payload, headers=staff_headers)
    assert dup_inv_res.status_code == 409

    # =========================================================================
    # STEP 13 & 14: Confirm Invoice & Download PDF
    # =========================================================================
    # Confirm invoice
    conf_res = client.post(f"/api/v1/invoices/{invoice_id}/confirm", headers=staff_headers)
    assert conf_res.status_code == 200

    # Download PDF
    pdf_res = client.get(f"/api/v1/invoices/{invoice_id}/pdf", headers=staff_headers)
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert f'filename="Invoice-{inv_data["invoice_number"]}.pdf"' in pdf_res.headers["content-disposition"]

    # Verify PDF content with pypdf
    pdf_reader = PdfReader(io.BytesIO(pdf_res.content))
    assert len(pdf_reader.pages) >= 1
    pdf_text = "".join(p.extract_text() for p in pdf_reader.pages)

    assert "BILLSYNC" in pdf_text
    assert inv_data["invoice_number"] in pdf_text
    assert "$400.00" in pdf_text
    assert "$40.00" in pdf_text
    assert "-$50.00" in pdf_text
    assert "$390.00" in pdf_text

    # Verify Customer can download own PDF but not other customers'
    cust_pdf_res = client.get(f"/api/v1/invoices/{invoice_id}/pdf", headers=cust_headers)
    assert cust_pdf_res.status_code == 200
    attacker_pdf_res = client.get(f"/api/v1/invoices/{invoice_id}/pdf", headers={"Authorization": f"Bearer {attacker_token}"})
    assert attacker_pdf_res.status_code == 403

    # =========================================================================
    # STEP 15 & 16: Partial Payment Recording & Balance Reconciliation
    # =========================================================================
    pay_payload1 = {
        "invoice_id": invoice_id,
        "amount": "200.00",
        "payment_method": "CREDIT_CARD",
        "transaction_reference": f"txn_{uid}_1",
        "status": "SUCCESSFUL"
    }
    pay_res1 = client.post("/api/v1/payments", json=pay_payload1, headers=staff_headers)
    assert pay_res1.status_code == 201

    chk_inv1 = client.get(f"/api/v1/invoices/{invoice_id}", headers=staff_headers).json()
    assert chk_inv1["status"] == "PARTIALLY_PAID"
    assert Decimal(str(chk_inv1["amount_paid"])) == Decimal("200.00")
    assert Decimal(str(chk_inv1["balance_due"])) == Decimal("190.00")

    # Edge Case: Overpayment rejection (paying 250.00 when balance is 190.00)
    over_payload = {
        "invoice_id": invoice_id,
        "amount": "250.00",
        "payment_method": "CREDIT_CARD",
        "transaction_reference": f"txn_{uid}_over",
        "status": "SUCCESSFUL"
    }
    over_res = client.post("/api/v1/payments", json=over_payload, headers=staff_headers)
    assert over_res.status_code == 400

    # =========================================================================
    # STEP 17 & 18: Remaining Payment & PAID Status
    # =========================================================================
    pay_payload2 = {
        "invoice_id": invoice_id,
        "amount": "190.00",
        "payment_method": "BANK_TRANSFER",
        "transaction_reference": f"txn_{uid}_2",
        "status": "SUCCESSFUL"
    }
    pay_res2 = client.post("/api/v1/payments", json=pay_payload2, headers=staff_headers)
    assert pay_res2.status_code == 201
    payment2_id = pay_res2.json()["data"]["id"]

    chk_inv2 = client.get(f"/api/v1/invoices/{invoice_id}", headers=staff_headers).json()
    assert chk_inv2["status"] == "PAID"
    assert Decimal(str(chk_inv2["amount_paid"])) == Decimal("390.00")
    assert Decimal(str(chk_inv2["balance_due"])) == Decimal("0.00")

    # Edge Case: Cannot cancel a fully paid invoice
    cancel_res = client.post(f"/api/v1/invoices/{invoice_id}/cancel", headers=staff_headers)
    assert cancel_res.status_code == 400

    # =========================================================================
    # STEP 19, 20 & 21: Recurring Billing Cycle (Month 2) & Discount Separation
    # =========================================================================
    sub_entity = db_session.get(Subscription, uuid.UUID(sub_id))
    assert sub_entity is not None
    # Make due
    sub_entity.next_billing_date = now - timedelta(days=1)
    db_session.commit()

    # Trigger billing run
    bill_run = client.post("/api/v1/billing/run", json={"default_tax_rate": "10.00"}, headers=staff_headers)
    assert bill_run.status_code == 200
    bill_summary = bill_run.json()["data"]
    assert bill_summary["invoices_created"] >= 1

    # Fetch month 2 invoice: must NOT reuse the 50.00 one-time quotation discount
    invoices_for_sub = list(db_session.scalars(
        select(Invoice).where(Invoice.subscription_id == uuid.UUID(sub_id)).order_by(Invoice.created_at.desc())
    ).all())
    assert len(invoices_for_sub) == 2
    month2_inv = invoices_for_sub[0]

    assert month2_inv.subtotal == Decimal("400.00")
    assert month2_inv.tax_amount == Decimal("40.00")
    assert month2_inv.discount_amount == Decimal("0.00")  # Discount NOT reused
    assert month2_inv.total == Decimal("440.00")
    assert month2_inv.balance_due == Decimal("440.00")

    # =========================================================================
    # STEP 22: Dashboard Analytics & Charts
    # =========================================================================
    stats_res = client.get("/api/v1/dashboard/stats", headers=admin_headers)
    assert stats_res.status_code == 200
    stats = stats_res.json()["data"]
    assert Decimal(str(stats["total_revenue_received"])) >= Decimal("390.00")
    assert stats["total_active_subscriptions"] >= 1

    rev_chart = client.get("/api/v1/dashboard/revenue-chart", headers=admin_headers)
    assert rev_chart.status_code == 200
    assert len(rev_chart.json()["data"]) >= 1

    sub_chart = client.get("/api/v1/dashboard/subscription-chart", headers=admin_headers)
    assert sub_chart.status_code == 200
    assert len(sub_chart.json()["data"]) >= 1

    # Customer dashboard scope: customer sees only own data
    cust_stats_res = client.get("/api/v1/dashboard/stats", headers=cust_headers)
    assert cust_stats_res.status_code == 200
    cust_stats = cust_stats_res.json()["data"]
    assert Decimal(str(cust_stats["total_revenue_received"])) == Decimal("390.00")

    # =========================================================================
    # STEP 23: Payment Refund & Balance Restoration
    # =========================================================================
    ref_res = client.post(f"/api/v1/payments/{payment2_id}/refund", json={"refund_reason": "Customer cancellation"}, headers=admin_headers)
    assert ref_res.status_code == 200
    assert ref_res.json()["data"]["status"] == "REFUNDED"

    # Invoice balance returns to 190.00, status returns to PARTIALLY_PAID
    inv_post_refund = client.get(f"/api/v1/invoices/{invoice_id}", headers=staff_headers).json()
    assert inv_post_refund["status"] == "PARTIALLY_PAID"
    assert Decimal(str(inv_post_refund["amount_paid"])) == Decimal("200.00")
    assert Decimal(str(inv_post_refund["balance_due"])) == Decimal("190.00")

    # =========================================================================
    # STEP 24: Customer Portal Data Isolation
    # =========================================================================
    # Associated customer lists invoices -> sees invoice
    cust_invoices = client.get("/api/v1/invoices", headers=cust_headers).json()
    assert cust_invoices["total"] >= 1
    assert any(i["id"] == invoice_id for i in cust_invoices["items"])

    # Unassociated customer lists invoices -> sees 0 invoices
    attacker_invoices = client.get("/api/v1/invoices", headers={"Authorization": f"Bearer {attacker_token}"}).json()
    assert attacker_invoices["total"] == 0
