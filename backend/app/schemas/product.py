from datetime import datetime
from decimal import Decimal
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import ProductType


class ProductBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=255, description="Product or service name")
    description: Optional[str] = Field(None, description="Detailed product description")
    product_type: ProductType = Field(default=ProductType.SERVICE, description="Catalog category")
    sales_price: Decimal = Field(default=Decimal("0.00"), ge=0, description="Standard selling price")
    cost_price: Decimal = Field(default=Decimal("0.00"), ge=0, description="Internal cost price")
    notes: Optional[str] = Field(None, description="Internal product notes")
    is_active: bool = Field(default=True, description="Whether product is active for purchase")


class ProductCreate(ProductBase):
    pass


class ProductUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=255)
    description: Optional[str] = None
    product_type: Optional[ProductType] = None
    sales_price: Optional[Decimal] = Field(None, ge=0)
    cost_price: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = None
    is_active: Optional[bool] = None


class ProductResponse(ProductBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class ProductListResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    items: list[ProductResponse]
    total: int
    page: int
    size: int
