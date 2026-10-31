from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import InvoiceStatus


class InvoiceItemBase(BaseModel):
    description: str = Field(..., min_length=1, max_length=255, description="Item description or service rendered")
    quantity: int = Field(default=1, gt=0, description="Quantity of units")
    unit_price: Decimal = Field(..., ge=0, description="Unit price per item")
    tax_rate: Decimal = Field(default=Decimal("0.00"), ge=0, le=100, description="Tax rate percentage (e.g. 10.00)")
    product_id: Optional[uuid.UUID] = Field(None, description="Linked catalog product ID")


class InvoiceItemCreate(InvoiceItemBase):
    pass


class InvoiceItemResponse(InvoiceItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID
    line_total: Decimal


class InvoiceGenerateRequest(BaseModel):
    """Payload to trigger automated invoice generation from an active subscription."""
    subscription_id: uuid.UUID = Field(..., description="Target Subscription UUID")
    issue_date: Optional[datetime] = Field(None, description="Invoice issue date (defaults to UTC now)")
    due_date: Optional[datetime] = Field(None, description="Invoice payment due date")
    billing_period_start: Optional[datetime] = Field(None, description="Billing cycle start")
    billing_period_end: Optional[datetime] = Field(None, description="Billing cycle end")
    tax_rate: Optional[Decimal] = Field(None, ge=0, le=100, description="Tax rate override percentage")
    discount_amount: Optional[Decimal] = Field(default=None, ge=0, description="Optional manual discount amount override")
    discount_id: Optional[uuid.UUID] = Field(None, description="Optional Discount entity UUID to apply")
    discount_code: Optional[str] = Field(None, description="Optional promo code or discount policy name")


class InvoiceResponse(BaseModel):
    """Core invoice summary response."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_number: str
    customer_id: uuid.UUID
    subscription_id: Optional[uuid.UUID]
    discount_id: Optional[uuid.UUID] = None
    billing_period_start: datetime
    billing_period_end: datetime
    status: InvoiceStatus
    issue_date: datetime
    due_date: datetime
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    created_at: datetime
    updated_at: datetime


class CustomerBrief(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    name: str
    email: str
    phone: Optional[str] = None
    billing_address: Optional[str] = None


class InvoiceDetailResponse(InvoiceResponse):
    """Detailed invoice response with line items, customer, and discount info."""
    customer: Optional[CustomerBrief] = None
    items: List[InvoiceItemResponse] = []


class InvoiceListResponse(BaseModel):
    """Paginated collection of invoices."""
    items: List[InvoiceResponse]
    total: int
    page: int
    size: int
