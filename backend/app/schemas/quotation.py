from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import QuotationStatus


class QuotationItemBase(BaseModel):
    product_id: uuid.UUID = Field(..., description="Referenced catalog product UUID")
    plan_id: Optional[uuid.UUID] = Field(None, description="Optional plan UUID if item represents a recurring plan")
    quantity: int = Field(default=1, gt=0, description="Item quantity (must be greater than 0)")
    unit_price: Decimal = Field(..., ge=0, description="Unit price per item")
    tax_rate: Decimal = Field(default=Decimal("0.00"), ge=0, le=100, description="Tax rate percentage")


class QuotationItemCreate(QuotationItemBase):
    pass


class QuotationItemResponse(QuotationItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quotation_id: uuid.UUID
    product_name: Optional[str] = None
    line_total: Decimal


class QuotationCreate(BaseModel):
    customer_id: uuid.UUID = Field(..., description="Target Customer UUID")
    quotation_number: Optional[str] = Field(None, max_length=64, description="Optional custom quotation reference")
    valid_until: Optional[datetime] = Field(None, description="Expiration timestamp for the quotation")
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0, description="Manual discount amount")
    status: QuotationStatus = Field(default=QuotationStatus.DRAFT, description="Initial quotation status")
    items: List[QuotationItemCreate] = Field(..., min_length=1, description="List of quotation line items")


class QuotationUpdate(BaseModel):
    customer_id: Optional[uuid.UUID] = None
    valid_until: Optional[datetime] = None
    discount_amount: Optional[Decimal] = Field(None, ge=0)
    status: Optional[QuotationStatus] = None
    items: Optional[List[QuotationItemCreate]] = None


class QuotationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    quotation_number: str
    customer_id: uuid.UUID
    customer_name: Optional[str] = None
    status: QuotationStatus
    valid_until: Optional[datetime] = None
    subtotal: Decimal
    tax_amount: Decimal
    discount_amount: Decimal
    total: Decimal
    created_at: datetime
    updated_at: datetime
    items: List[QuotationItemResponse] = []


class QuotationListResponse(BaseModel):
    items: List[QuotationResponse]
    total: int
    page: int
    size: int


class QuotationConvertToSubscriptionRequest(BaseModel):
    plan_id: Optional[uuid.UUID] = Field(None, description="Target plan UUID (if omitted, resolved from quotation items)")
    start_date: Optional[datetime] = Field(None, description="Subscription start date (defaults to UTC now)")
    end_date: Optional[datetime] = Field(None, description="Optional subscription expiry date")
    payment_terms: str = Field(default="Due upon receipt", description="Payment terms label")
    generate_initial_invoice: bool = Field(default=False, description="Whether to trigger an initial invoice generation immediately")
