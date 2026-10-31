from datetime import datetime
from decimal import Decimal
from typing import List, Optional, TYPE_CHECKING
import uuid
from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import BillingInterval, ProductType

if TYPE_CHECKING:
    from app.models.subscription import Subscription


class Product(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Product or service offering in the catalog."""
    __tablename__ = "products"

    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    product_type: Mapped[ProductType] = mapped_column(
        Enum(ProductType, name="product_type", native_enum=False),
        default=ProductType.SERVICE,
        nullable=False,
        index=True
    )
    sales_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    cost_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), default=Decimal("0.00"), nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    # Relationships
    plans: Mapped[List["Plan"]] = relationship(
        "Plan",
        back_populates="product",
        cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Product id={self.id} name={self.name} price={self.sales_price}>"


class Plan(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Recurring subscription plan linked to a product."""
    __tablename__ = "plans"

    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    billing_interval: Mapped[BillingInterval] = mapped_column(
        Enum(BillingInterval, name="billing_interval", native_enum=False),
        nullable=False,
        index=True
    )
    price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    minimum_quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    available_from: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    available_until: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    allow_pause: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_early_close: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    allow_renewal: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)

    # Relationships
    product: Mapped["Product"] = relationship("Product", back_populates="plans")
    subscriptions: Mapped[List["Subscription"]] = relationship(
        "Subscription",
        back_populates="plan"
    )

    def __repr__(self) -> str:
        return f"<Plan id={self.id} name={self.name} interval={self.billing_interval} price={self.price}>"
