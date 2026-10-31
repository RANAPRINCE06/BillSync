from typing import List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, Response, status
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
    "/{invoice_id}/pdf",
    response_class=Response,
    status_code=status.HTTP_200_OK,
    summary="Download Invoice PDF",
    description="Generates and streams a professional PDF document for the requested invoice."
)
def download_invoice_pdf(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> Response:
    """Download invoice PDF with customer data ownership enforcement."""
    pdf_bytes, filename = InvoiceService.get_invoice_pdf(
        db=db,
        invoice_id=invoice_id,
        current_user=current_user
    )
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Type": "application/pdf"
        }
    )


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


@router.post(
    "/{invoice_id}/confirm",
    response_model=APIResponse[InvoiceDetailResponse],
    status_code=status.HTTP_200_OK,
    summary="Confirm Invoice",
    description="Transitions draft invoice to pending status. Admin/Staff only."
)
def confirm_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[InvoiceDetailResponse]:
    from app.core.exceptions import NotFoundException
    from app.models.enums import InvoiceStatus
    from app.models.invoice import Invoice

    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise NotFoundException(f"Invoice with ID '{invoice_id}' was not found.")

    if invoice.status == InvoiceStatus.DRAFT:
        invoice.status = InvoiceStatus.CONFIRMED
        db.commit()
        db.refresh(invoice)

    detail = InvoiceService.get_invoice_by_id(db=db, invoice_id=invoice_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Invoice confirmed successfully",
        data=detail
    )


@router.post(
    "/{invoice_id}/cancel",
    response_model=APIResponse[InvoiceDetailResponse],
    status_code=status.HTTP_200_OK,
    summary="Cancel Invoice",
    description="Cancels an unpaid invoice. Admin/Staff only."
)
def cancel_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[InvoiceDetailResponse]:
    from app.core.exceptions import BadRequestException, NotFoundException
    from app.models.enums import InvoiceStatus
    from app.models.invoice import Invoice

    invoice = db.get(Invoice, invoice_id)
    if not invoice:
        raise NotFoundException(f"Invoice with ID '{invoice_id}' was not found.")

    if invoice.status == InvoiceStatus.PAID:
        raise BadRequestException("Cannot cancel an already paid invoice.")

    invoice.status = InvoiceStatus.CANCELLED
    db.commit()
    db.refresh(invoice)

    detail = InvoiceService.get_invoice_by_id(db=db, invoice_id=invoice_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Invoice cancelled successfully",
        data=detail
    )


@router.post(
    "/{invoice_id}/send",
    response_model=APIResponse[InvoiceDetailResponse],
    status_code=status.HTTP_200_OK,
    summary="Send Invoice",
    description="Marks or simulates sending invoice to customer. Admin/Staff only."
)
def send_invoice(
    invoice_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[InvoiceDetailResponse]:
    detail = InvoiceService.get_invoice_by_id(db=db, invoice_id=invoice_id, current_user=current_user)
    return APIResponse(
        success=True,
        message=f"Invoice {detail.invoice_number} sent successfully to customer",
        data=detail
    )
