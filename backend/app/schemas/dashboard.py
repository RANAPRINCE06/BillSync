from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class ChartGrouping(str, Enum):
    DAY = "day"
    WEEK = "week"
    MONTH = "month"


class DashboardStatsResponse(BaseModel):
    """Aggregate financial and operational metrics for dashboard."""
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    # Core required backend metrics
    total_customers: int = Field(default=0, description="Total registered customers")
    total_active_subscriptions: int = Field(default=0, description="Total active subscriptions")
    total_invoices: int = Field(default=0, description="Total invoices generated")
    total_revenue_received: Decimal = Field(
        default=Decimal("0.00"),
        description="Total revenue from successful payments (excluding refunded payments)"
    )
    total_outstanding_balance: Decimal = Field(
        default=Decimal("0.00"),
        description="Total balance due on unpaid and partially paid invoices"
    )
    total_overdue_balance: Decimal = Field(
        default=Decimal("0.00"),
        description="Total balance due on overdue invoices"
    )
    total_overdue_invoices: int = Field(default=0, description="Count of overdue invoices")
    total_partially_paid_invoices: int = Field(default=0, description="Count of partially paid invoices")
    total_unpaid_invoices: int = Field(default=0, description="Count of unpaid invoices with zero payments")

    # Frontend convenience aliases matching Rudra's DashboardPage.jsx
    active_subscriptions: int = Field(default=0, description="Alias for total_active_subscriptions")
    total_customers_count: int = Field(default=0, description="Alias for total_customers")
    revenue_received: Decimal = Field(default=Decimal("0.00"), description="Alias for total_revenue_received")
    outstanding_payments: Decimal = Field(default=Decimal("0.00"), description="Alias for total_outstanding_balance")
    overdue_invoices: int = Field(default=0, description="Alias for total_overdue_invoices")


class RevenueChartPoint(BaseModel):
    """Single chronological data point on the revenue chart."""
    model_config = ConfigDict(from_attributes=True)

    period: str = Field(..., description="Unique period identifier, e.g. '2026-10' or '2026-10-31'")
    month: str = Field(..., description="Display label for XAxis (e.g. 'Oct 2026' or '2026-10')")
    date: str = Field(..., description="ISO formatted start date for the bucket")
    revenue: Decimal = Field(default=Decimal("0.00"), description="Total successful revenue collected in this period")
    payment_count: int = Field(default=0, description="Number of successful transactions in this period")


class RevenueChartResponse(BaseModel):
    """Complete revenue trend chart response."""
    group_by: ChartGrouping
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    items: List[RevenueChartPoint] = []
    total_revenue: Decimal = Decimal("0.00")


class ActivityType(str, Enum):
    INVOICE_GENERATED = "INVOICE_GENERATED"
    PAYMENT_RECEIVED = "PAYMENT_RECEIVED"
    PAYMENT_REFUNDED = "PAYMENT_REFUNDED"
    SUBSCRIPTION_ACTIVATED = "SUBSCRIPTION_ACTIVATED"


class RecentActivityItem(BaseModel):
    """Single financial or subscription activity log item."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    activity_type: ActivityType
    reference: str = Field(..., description="Entity reference code (INV-..., PAY-..., SUB-...)")
    title: str
    description: str
    amount: Optional[Decimal] = None
    status: Optional[str] = None
    customer_name: Optional[str] = None
    timestamp: datetime


class RecentActivityResponse(BaseModel):
    """List of recent financial activities."""
    items: List[RecentActivityItem] = []
    total: int = 0
