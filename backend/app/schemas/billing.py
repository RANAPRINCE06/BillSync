from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field


class BillingRunRequest(BaseModel):
    """Payload to trigger recurring billing cycle execution."""
    as_of_date: Optional[datetime] = Field(None, description="Billing cutoff timestamp (defaults to current UTC)")
    subscription_ids: Optional[List[uuid.UUID]] = Field(None, description="Optional explicit subscription IDs to process")
    auto_advance_dates: bool = Field(default=True, description="Automatically advance next_billing_date upon successful billing")
    default_tax_rate: Optional[Decimal] = Field(None, ge=0, le=100, description="Optional default tax rate to apply")


class BillingSubscriptionResult(BaseModel):
    """Result of billing execution for a single subscription."""
    model_config = ConfigDict(from_attributes=True)

    subscription_id: uuid.UUID
    subscription_number: str
    status: str = Field(..., description="Outcome: SUCCESS, SKIPPED, or FAILED")
    invoice_id: Optional[uuid.UUID] = None
    invoice_number: Optional[str] = None
    billing_period_start: Optional[datetime] = None
    billing_period_end: Optional[datetime] = None
    total_amount: Optional[Decimal] = None
    previous_next_billing_date: Optional[datetime] = None
    new_next_billing_date: Optional[datetime] = None
    reason: Optional[str] = None


class BillingRunSummary(BaseModel):
    """Aggregate statistics and results of the billing run."""
    model_config = ConfigDict(from_attributes=True)

    processed: int = Field(..., description="Total subscriptions evaluated")
    invoices_created: int = Field(..., description="Count of successfully generated invoices")
    skipped: int = Field(..., description="Count of skipped subscriptions")
    failed: int = Field(..., description="Count of subscriptions that encountered errors")
    results: List[BillingSubscriptionResult] = Field(default=[], description="Granular per-subscription results")


class BillingStatusResponse(BaseModel):
    """Diagnostic overview of recurring billing pipeline."""
    model_config = ConfigDict(from_attributes=True)

    as_of: datetime
    total_active_subscriptions: int
    due_subscriptions_count: int
    upcoming_7_days_count: int
    upcoming_30_days_count: int
