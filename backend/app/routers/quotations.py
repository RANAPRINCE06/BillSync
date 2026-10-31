from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user, require_admin_or_staff
from app.dependencies.database import get_db
from app.models.enums import QuotationStatus
from app.models.user import User
from app.schemas.quotation import (
    QuotationConvertToSubscriptionRequest,
    QuotationCreate,
    QuotationListResponse,
    QuotationResponse,
    QuotationUpdate,
)
from app.schemas.response import APIResponse
from app.schemas.subscription import SubscriptionResponse
from app.services.quotation_service import QuotationService
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/quotations", tags=["Quotations & Sales Estimates"])


@router.post(
    "",
    response_model=APIResponse[QuotationResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create Quotation",
    description="Drafts a new quotation with item calculations and pricing. Staff/Admin only."
)
def create_quotation(
    payload: QuotationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[QuotationResponse]:
    """Create quotation with locked pricing snapshots."""
    quotation = QuotationService.create_quotation(db=db, payload=payload, current_user=current_user)
    return APIResponse(
        success=True,
        message="Quotation created successfully",
        data=QuotationService.to_response(quotation)
    )


@router.get(
    "/templates",
    response_model=APIResponse[List[Dict[str, Any]]],
    status_code=status.HTTP_200_OK,
    summary="Get Quotation Templates",
    description="Returns preconfigured quotation templates for rapid drafting."
)
def get_quotation_templates(
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[Dict[str, Any]]]:
    """Provides reusable quotation templates."""
    templates = [
        {"id": "tmpl-enterprise", "name": "Enterprise Annual SaaS Package", "discount_amount": 100.00},
        {"id": "tmpl-starter", "name": "Starter Monthly Tier", "discount_amount": 0.00},
    ]
    return APIResponse(success=True, message="Templates retrieved", data=templates)


@router.get(
    "",
    response_model=APIResponse[QuotationListResponse],
    status_code=status.HTTP_200_OK,
    summary="List Quotations",
    description="Lists quotations. Customers view only their own records; Staff/Admin view organization-wide records."
)
def list_quotations(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    customer_id: Optional[uuid.UUID] = Query(None, description="Filter by customer ID"),
    status: Optional[QuotationStatus] = Query(None, description="Filter by status"),
    search: Optional[str] = Query(None, description="Search quotation number or customer name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[QuotationListResponse]:
    """List quotations with ownership isolation."""
    items, total = QuotationService.list_quotations(
        db=db,
        current_user=current_user,
        customer_id=customer_id,
        status=status,
        search=search,
        page=page,
        size=size
    )
    return APIResponse(
        success=True,
        message="Quotations retrieved successfully",
        data=QuotationListResponse(
            items=[QuotationService.to_response(q) for q in items],
            total=total,
            page=page,
            size=size
        )
    )


@router.get(
    "/{quotation_id}",
    response_model=APIResponse[QuotationResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Quotation by ID",
    description="Retrieves quotation details and line items. Customers can only view their own quotations."
)
def get_quotation_by_id(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[QuotationResponse]:
    """Fetch single quotation details."""
    quotation = QuotationService.get_quotation_by_id(db=db, quotation_id=quotation_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Quotation retrieved successfully",
        data=QuotationService.to_response(quotation)
    )


@router.put(
    "/{quotation_id}",
    response_model=APIResponse[QuotationResponse],
    status_code=status.HTTP_200_OK,
    summary="Update Quotation",
    description="Updates quotation items, discount, or status."
)
def update_quotation(
    quotation_id: uuid.UUID,
    payload: QuotationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[QuotationResponse]:
    """Update quotation."""
    quotation = QuotationService.update_quotation(
        db=db,
        quotation_id=quotation_id,
        payload=payload,
        current_user=current_user
    )
    return APIResponse(
        success=True,
        message="Quotation updated successfully",
        data=QuotationService.to_response(quotation)
    )


@router.delete(
    "/{quotation_id}",
    response_model=APIResponse[Dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="Delete Quotation",
    description="Deletes a draft quotation. Admin/Staff only."
)
def delete_quotation(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[Dict[str, str]]:
    """Delete draft quotation."""
    QuotationService.delete_quotation(db=db, quotation_id=quotation_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Quotation deleted successfully",
        data={"id": str(quotation_id)}
    )


# Acceptance endpoints (supporting both /accept and /confirm for frontend compatibility)
@router.post(
    "/{quotation_id}/accept",
    response_model=APIResponse[QuotationResponse],
    status_code=status.HTTP_200_OK,
    summary="Accept Quotation",
    description="Customer or Staff accepts quotation terms."
)
@router.post(
    "/{quotation_id}/confirm",
    response_model=APIResponse[QuotationResponse],
    status_code=status.HTTP_200_OK,
    summary="Confirm / Accept Quotation (Alias)",
    description="Alias for accepting quotation terms."
)
def accept_quotation(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[QuotationResponse]:
    """Accept quotation."""
    quotation = QuotationService.accept_quotation(db=db, quotation_id=quotation_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Quotation accepted successfully",
        data=QuotationService.to_response(quotation)
    )


# Rejection endpoints (supporting both /reject and /cancel for frontend compatibility)
@router.post(
    "/{quotation_id}/reject",
    response_model=APIResponse[QuotationResponse],
    status_code=status.HTTP_200_OK,
    summary="Reject Quotation",
    description="Marks quotation as rejected or cancelled."
)
@router.post(
    "/{quotation_id}/cancel",
    response_model=APIResponse[QuotationResponse],
    status_code=status.HTTP_200_OK,
    summary="Cancel / Reject Quotation (Alias)",
    description="Alias for rejecting quotation terms."
)
def reject_quotation(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[QuotationResponse]:
    """Reject quotation."""
    quotation = QuotationService.reject_quotation(db=db, quotation_id=quotation_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Quotation rejected successfully",
        data=QuotationService.to_response(quotation)
    )


# Conversion endpoints (supporting both /convert and /convert-to-subscription)
@router.post(
    "/{quotation_id}/convert",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Convert Quotation to Subscription",
    description="Converts accepted quotation into an active subscription and locks pricing snapshots."
)
@router.post(
    "/{quotation_id}/convert-to-subscription",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Convert Quotation to Subscription (Alias)",
    description="Alias for converting accepted quotation into an active subscription."
)
def convert_quotation_to_subscription(
    quotation_id: uuid.UUID,
    payload: Optional[QuotationConvertToSubscriptionRequest] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[SubscriptionResponse]:
    """Convert accepted quotation into subscription."""
    sub = QuotationService.convert_to_subscription(
        db=db,
        quotation_id=quotation_id,
        payload=payload,
        current_user=current_user
    )
    return APIResponse(
        success=True,
        message="Quotation converted into active recurring subscription successfully",
        data=SubscriptionService.to_response(sub)
    )


@router.post(
    "/{quotation_id}/duplicate",
    response_model=APIResponse[QuotationResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Duplicate Quotation",
    description="Creates a new draft copy of an existing quotation. Admin/Staff only."
)
def duplicate_quotation(
    quotation_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[QuotationResponse]:
    """Duplicate quotation as a new draft."""
    cloned = QuotationService.duplicate_quotation(
        db=db,
        quotation_id=quotation_id,
        current_user=current_user
    )
    return APIResponse(
        success=True,
        message=f"Quotation duplicated successfully as {cloned.quotation_number}",
        data=QuotationService.to_response(cloned)
    )
