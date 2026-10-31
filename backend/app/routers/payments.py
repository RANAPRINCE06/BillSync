from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user, require_admin_or_staff
from app.dependencies.database import get_db
from app.models.enums import PaymentMethod, PaymentStatus
from app.models.user import User
from app.schemas.payment import (
    PaymentCreate,
    PaymentListResponse,
    PaymentRefundRequest,
    PaymentResponse,
)
from app.schemas.response import APIResponse
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/payments", tags=["Payment Recording & Balance Management"])


@router.post(
    "",
    response_model=APIResponse[PaymentResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Record Payment",
    description="Records a new payment against an invoice and updates outstanding balances. Admin/Staff only."
)
def record_payment(
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[PaymentResponse]:
    """Record payment transaction with balance recalculation and concurrency locking."""
    payment = PaymentService.record_payment(
        db=db,
        payload=payload,
        current_user=current_user
    )
    return APIResponse(
        success=True,
        message="Payment recorded and invoice balance updated successfully",
        data=PaymentService.to_response(payment)
    )


@router.get(
    "",
    response_model=APIResponse[PaymentListResponse],
    status_code=status.HTTP_200_OK,
    summary="List Payments",
    description="Retrieve paginated payments. Customers see only their own payments; Staff/Admin can view all."
)
def list_payments(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    invoice_id: Optional[uuid.UUID] = Query(None, description="Filter by Invoice UUID"),
    customer_id: Optional[uuid.UUID] = Query(None, description="Filter by Customer UUID (Staff/Admin only)"),
    status: Optional[PaymentStatus] = Query(None, description="Filter by Payment Status"),
    method: Optional[PaymentMethod] = Query(None, description="Filter by Payment Method"),
    search: Optional[str] = Query(None, description="Search by payment reference or invoice number"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[PaymentListResponse]:
    """List payments with customer isolation enforcement."""
    items, total = PaymentService.list_payments(
        db=db,
        current_user=current_user,
        invoice_id=invoice_id,
        customer_id=customer_id,
        status=status,
        method=method,
        search=search,
        page=page,
        size=size
    )
    return APIResponse(
        success=True,
        message="Payments retrieved successfully",
        data=PaymentListResponse(
            items=[PaymentService.to_response(p) for p in items],
            total=total,
            page=page,
            size=size
        )
    )


@router.get(
    "/{payment_id}",
    response_model=APIResponse[PaymentResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Payment by ID",
    description="Retrieve detailed payment information. Customers can view only their own payments."
)
def get_payment_by_id(
    payment_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[PaymentResponse]:
    """Fetch single payment details."""
    payment = PaymentService.get_payment_by_id(
        db=db,
        payment_id=payment_id,
        current_user=current_user
    )
    return APIResponse(
        success=True,
        message="Payment retrieved successfully",
        data=PaymentService.to_response(payment)
    )


@router.post(
    "/{payment_id}/refund",
    response_model=APIResponse[PaymentResponse],
    status_code=status.HTTP_200_OK,
    summary="Refund Payment",
    description="Refunds a successful payment, restores invoice balance, and logs audit notes. Admin/Staff only."
)
def refund_payment(
    payment_id: uuid.UUID,
    payload: Optional[PaymentRefundRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[PaymentResponse]:
    """Execute refund workflow on successful payment."""
    payment = PaymentService.refund_payment(
        db=db,
        payment_id=payment_id,
        payload=payload,
        current_user=current_user
    )
    return APIResponse(
        success=True,
        message="Payment refunded and invoice balance recalculated successfully",
        data=PaymentService.to_response(payment)
    )
