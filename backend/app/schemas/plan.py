from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import BillingInterval


class PlanBase(BaseModel):
    product_id: uuid.UUID = Field(..., description="Parent product UUID")
    name: str = Field(..., min_length=1, max_length=255, description="Subscription plan name")
    billing_interval: BillingInterval = Field(default=BillingInterval.MONTHLY, description="Billing frequency")
    price: Decimal = Field(..., ge=0, description="Recurring price per cycle")
    minimum_quantity: int = Field(default=1, ge=1, description="Minimum item quantity required")
    available_from: Optional[datetime] = Field(None, description="Start date of plan availability")
    available_until: Optional[datetime] = Field(None, description="End date of plan availability")
    allow_pause: bool = Field(default=True, description="Whether subscribers can pause this plan")
    allow_early_close: bool = Field(default=True, description="Whether subscribers can cancel early")
    allow_renewal: bool = Field(default=True, description="Whether subscribers can renew this plan")
    is_active: bool = Field(default=True, description="Whether plan is active for purchase")


class PlanCreate(PlanBase):
    pass


class PlanUpdate(BaseModel):
    product_id: Optional[uuid.UUID] = None
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    billing_interval: Optional[BillingInterval] = None
    price: Optional[Decimal] = Field(None, ge=0)
    minimum_quantity: Optional[int] = Field(None, ge=1)
    available_from: Optional[datetime] = None
    available_until: Optional[datetime] = None
    allow_pause: Optional[bool] = None
    allow_early_close: Optional[bool] = None
    allow_renewal: Optional[bool] = None
    is_active: Optional[bool] = None


class PlanResponse(PlanBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class PlanListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: List[PlanResponse]
    total: int
    page: int
    size: int
