from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user
from app.dependencies.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.invoice import (
    InvoiceDetailResponse,
    InvoiceGenerateRequest,
    InvoiceListResponse,
    InvoiceResponse,
)
from app.schemas.payment import PaymentResponse
from app.schemas.response import APIResponse
from app.services.invoice_service import InvoiceService
from app.services.payment_service import PaymentService

router = APIRouter(prefix="/invoices", tags=["Invoices & Billing"])


@router.post(
    "/generate",
    response_model=InvoiceDetailResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Generate Subscription Invoice",
    description="Calculates charges, creates historical line items, and generates an invoice for a subscription period."
)
def generate_invoice(
    payload: InvoiceGenerateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> InvoiceDetailResponse:
    """Generate invoice from subscription with duplicate prevention."""
    invoice = InvoiceService.generate_invoice_for_subscription(
        db=db,
        payload=payload,
        current_user=current_user
    )
    return invoice


@router.get(
    "",
    response_model=InvoiceListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Invoices",
    description="Retrieve paginated list of invoices. Customers see only their own invoices; Staff/Admin can view all."
)
def list_invoices(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    customer_id: Optional[uuid.UUID] = Query(None, description="Filter by customer UUID (Staff/Admin only)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> InvoiceListResponse:
    """List invoices with customer data ownership enforcement."""
    invoices, total = InvoiceService.list_invoices(
        db=db,
        current_user=current_user,
        customer_id=customer_id,
        page=page,
        size=size
    )
    return InvoiceListResponse(
        items=invoices,
        total=total,
        page=page,
        size=size
    )


@router.get(
    "/{invoice_id}",
    response_model=InvoiceDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Invoice by ID",
    description="Retrieve detailed invoice with historical line items, totals, and customer details."
)
def get_invoice_by_id(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> InvoiceDetailResponse:
    """Fetch invoice details with access control validation."""
    invoice = InvoiceService.get_invoice_by_id(
        db=db,
        invoice_id=invoice_id,
        current_user=current_user
    )
    return invoice


@router.get(
    "/{invoice_id}/payments",
    response_model=APIResponse[List[PaymentResponse]],
    status_code=status.HTTP_200_OK,
    summary="Get Invoice Payments",
    description="Retrieve all payment records recorded against a specific invoice. Customers can only view their own invoice payments."
)
def get_invoice_payments(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[PaymentResponse]]:
    """Retrieve all payment records for an invoice."""
    payments = PaymentService.list_invoice_payments(
        db=db,
        invoice_id=invoice_id,
        current_user=current_user
    )
    return APIResponse(
        success=True,
        message="Invoice payments retrieved successfully",
        data=[PaymentService.to_response(p) for p in payments]
    )
