from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BillingInterval, SubscriptionStatus


class SubscriptionItemBase(BaseModel):
    product_id: uuid.UUID = Field(..., description="Catalog product UUID")
    quantity: int = Field(default=1, gt=0, description="Item quantity")
    unit_price: Decimal = Field(..., ge=0, description="Locked unit price")


class SubscriptionItemCreate(SubscriptionItemBase):
    pass


class SubscriptionItemResponse(SubscriptionItemBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subscription_id: uuid.UUID
    product_name: Optional[str] = None


class SubscriptionCreate(BaseModel):
    customer_id: uuid.UUID = Field(..., description="Target Customer UUID")
    plan_id: uuid.UUID = Field(..., description="Pricing Plan UUID")
    quotation_id: Optional[uuid.UUID] = Field(None, description="Optional originating Quotation UUID")
    subscription_number: Optional[str] = Field(None, max_length=64, description="Optional custom subscription reference")
    start_date: Optional[datetime] = Field(None, description="Subscription start timestamp (defaults to now)")
    end_date: Optional[datetime] = Field(None, description="Optional end / contract term date")
    payment_terms: str = Field(default="Due upon receipt", description="Payment terms label")
    status: SubscriptionStatus = Field(default=SubscriptionStatus.ACTIVE, description="Initial subscription state")
    items: Optional[List[SubscriptionItemCreate]] = Field(None, description="Optional initial items (defaults to plan product)")


class SubscriptionUpdate(BaseModel):
    plan_id: Optional[uuid.UUID] = None
    end_date: Optional[datetime] = None
    payment_terms: Optional[str] = None
    status: Optional[SubscriptionStatus] = None


class SubscriptionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    subscription_number: str
    customer_id: uuid.UUID
    customer_name: Optional[str] = None
    plan_id: uuid.UUID
    plan_name: Optional[str] = None
    billing_interval: Optional[BillingInterval] = None
    quotation_id: Optional[uuid.UUID] = None
    status: SubscriptionStatus
    start_date: datetime
    end_date: Optional[datetime] = None
    next_billing_date: Optional[datetime] = None
    payment_terms: str
    created_at: datetime
    updated_at: datetime
    items: List[SubscriptionItemResponse] = []


class SubscriptionListResponse(BaseModel):
    items: List[SubscriptionResponse]
    total: int
    page: int
    size: int
