from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import DiscountType


class DiscountBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Discount policy name or promo code")
    discount_type: DiscountType = Field(..., description="Discount type: FIXED or PERCENTAGE")
    discount_value: Decimal = Field(..., ge=0, description="Discount amount or percentage value")
    minimum_quantity: int = Field(default=1, ge=1, description="Minimum order quantity required")
    start_date: Optional[datetime] = Field(None, description="Valid from timestamp")
    end_date: Optional[datetime] = Field(None, description="Valid until timestamp")
    usage_limit: Optional[int] = Field(None, ge=1, description="Maximum total redemptions permitted")
    is_active: bool = Field(default=True, description="Whether policy is actively redeemable")


class DiscountCreate(DiscountBase):
    pass


class DiscountUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    discount_type: Optional[DiscountType] = None
    discount_value: Optional[Decimal] = Field(None, ge=0)
    minimum_quantity: Optional[int] = Field(None, ge=1)
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    usage_limit: Optional[int] = Field(None, ge=0)
    is_active: Optional[bool] = None


class DiscountResponse(DiscountBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    usage_count: int
    created_at: datetime
    updated_at: datetime


class DiscountListResponse(BaseModel):
    items: List[DiscountResponse]
    total: int
    page: int
    size: int


class DiscountValidateRequest(BaseModel):
    subtotal: Decimal = Field(..., ge=0, description="Order subtotal amount to evaluate")
    total_quantity: int = Field(default=1, ge=1, description="Total quantity of ordered items")


class DiscountValidateResponse(BaseModel):
    is_valid: bool
    discount_name: str
    discount_type: DiscountType
    discount_value: Decimal
    calculated_discount: Decimal
    final_subtotal: Decimal
    message: str
