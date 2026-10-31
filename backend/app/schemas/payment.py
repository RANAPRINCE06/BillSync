from datetime import datetime
from decimal import Decimal
from typing import List, Optional
import uuid
from pydantic import BaseModel, ConfigDict, Field

from app.models.enums import PaymentMethod, PaymentStatus


class PaymentCreate(BaseModel):
    """Payload to record a payment against an invoice."""
    invoice_id: uuid.UUID = Field(..., description="Target Invoice UUID")
    amount: Decimal = Field(..., gt=0, description="Payment amount (must be greater than 0)")
    payment_method: PaymentMethod = Field(
        default=PaymentMethod.CREDIT_CARD,
        description="Payment method used (CREDIT_CARD, BANK_TRANSFER, UPI, CASH, OTHER)"
    )
    payment_date: Optional[datetime] = Field(
        None,
        description="Payment timestamp (defaults to current time if omitted)"
    )
    payment_reference: Optional[str] = Field(
        None,
        max_length=128,
        description="Optional unique payment reference (auto-generated if omitted)"
    )
    status: PaymentStatus = Field(
        default=PaymentStatus.SUCCESSFUL,
        description="Initial payment status (SUCCESSFUL, PENDING, FAILED)"
    )
    notes: Optional[str] = Field(None, description="Optional payment notes or transaction memo")


class PaymentUpdate(BaseModel):
    """Payload to update an existing payment metadata."""
    notes: Optional[str] = None
    status: Optional[PaymentStatus] = None


class PaymentRefundRequest(BaseModel):
    """Payload to refund a successful payment."""
    reason: Optional[str] = Field(None, description="Optional reason for refunding the payment")


class PaymentResponse(BaseModel):
    """Summary response for a payment transaction."""
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    invoice_id: uuid.UUID
    invoice_number: Optional[str] = None
    customer_name: Optional[str] = None
    customer_id: Optional[uuid.UUID] = None
    payment_reference: str
    payment_method: PaymentMethod
    amount: Decimal
    payment_date: datetime
    status: PaymentStatus
    notes: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class PaymentDetailResponse(PaymentResponse):
    """Detailed response for a payment transaction."""
    pass


class PaymentListResponse(BaseModel):
    """Paginated list of payments."""
    items: List[PaymentResponse]
    total: int
    page: int
    size: int
