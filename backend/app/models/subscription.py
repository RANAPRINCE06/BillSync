from datetime import datetime
from decimal import Decimal
from typing import List, Optional, TYPE_CHECKING
import uuid
from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models.base import TimestampMixin, UUIDPrimaryKeyMixin
from app.models.enums import SubscriptionStatus

if TYPE_CHECKING:
    from app.models.customer import Customer
    from app.models.product import Plan, Product
    from app.models.quotation import Quotation
    from app.models.invoice import Invoice


class Subscription(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """Recurring subscription agreement linked to customer and pricing plan."""
    __tablename__ = "subscriptions"

    subscription_number: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    customer_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customers.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plans.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    quotation_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("quotations.id", ondelete="SET NULL"),
        nullable=True,
        index=True
    )
    status: Mapped[SubscriptionStatus] = mapped_column(
        Enum(SubscriptionStatus, name="subscription_status", native_enum=False),
        default=SubscriptionStatus.DRAFT,
        nullable=False,
        index=True
    )
    start_date: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    end_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    next_billing_date: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_terms: Mapped[str] = mapped_column(String(100), default="Due upon receipt", nullable=False)

    # Relationships
    customer: Mapped["Customer"] = relationship("Customer", back_populates="subscriptions")
    plan: Mapped["Plan"] = relationship("Plan", back_populates="subscriptions")
    quotation: Mapped[Optional["Quotation"]] = relationship("Quotation", back_populates="subscriptions")
    items: Mapped[List["SubscriptionItem"]] = relationship(
        "SubscriptionItem",
        back_populates="subscription",
        cascade="all, delete-orphan"
    )
    invoices: Mapped[List["Invoice"]] = relationship(
        "Invoice",
        back_populates="subscription"
    )

    def __repr__(self) -> str:
        return f"<Subscription {self.subscription_number} status={self.status}>"


class SubscriptionItem(Base, UUIDPrimaryKeyMixin):
    """Individual line item included in an active subscription."""
    __tablename__ = "subscription_items"

    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("subscriptions.id", ondelete="CASCADE"),
        nullable=False,
        index=True
    )
    product_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("products.id", ondelete="RESTRICT"),
        nullable=False,
        index=True
    )
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)

    # Relationships
    subscription: Mapped["Subscription"] = relationship("Subscription", back_populates="items")
    product: Mapped["Product"] = relationship("Product")

    def __repr__(self) -> str:
        return f"<SubscriptionItem id={self.id} qty={self.quantity} unit_price={self.unit_price}>"
