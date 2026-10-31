from decimal import Decimal
from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user, require_admin_or_staff
from app.dependencies.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.discount import (
    DiscountCreate,
    DiscountListResponse,
    DiscountResponse,
    DiscountUpdate,
    DiscountValidateRequest,
    DiscountValidateResponse,
)
from app.services.discount_service import DiscountService

router = APIRouter(prefix="/discounts", tags=["Discounts & Promotions"])


@router.post(
    "",
    response_model=DiscountResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Create Discount Policy",
    description="Create a fixed or percentage discount policy. Requires Staff or Admin role."
)
def create_discount(
    payload: DiscountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> DiscountResponse:
    """Create a new discount (Admin / Staff only)."""
    discount = DiscountService.create_discount(
        db=db,
        name=payload.name,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        minimum_quantity=payload.minimum_quantity,
        start_date=payload.start_date,
        end_date=payload.end_date,
        usage_limit=payload.usage_limit,
        is_active=payload.is_active
    )
    return discount


@router.get(
    "",
    response_model=DiscountListResponse,
    status_code=status.HTTP_200_OK,
    summary="List Discounts",
    description="Retrieve paginated discounts. Customers only see active discounts; Staff/Admin can view all."
)
def list_discounts(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    active_only: Optional[bool] = Query(None, description="Filter for active discounts only"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> DiscountListResponse:
    """List discounts with role-based filtering."""
    # Customers must only see active discounts
    is_active_filter = True if current_user.role == UserRole.CUSTOMER else (active_only or False)
    discounts, total = DiscountService.list_discounts(
        db=db,
        is_active_only=is_active_filter,
        page=page,
        size=size
    )
    return DiscountListResponse(
        items=discounts,
        total=total,
        page=page,
        size=size
    )


@router.get(
    "/{discount_id}",
    response_model=DiscountResponse,
    status_code=status.HTTP_200_OK,
    summary="Get Discount by ID",
    description="Retrieve full discount policy details."
)
def get_discount_by_id(
    discount_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> DiscountResponse:
    """Fetch discount by UUID."""
    return DiscountService.get_discount_by_id(db, discount_id)


@router.patch(
    "/{discount_id}",
    response_model=DiscountResponse,
    status_code=status.HTTP_200_OK,
    summary="Update Discount Policy",
    description="Modify discount parameters, usage limits, or status. Requires Staff or Admin role."
)
def update_discount(
    discount_id: uuid.UUID,
    payload: DiscountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> DiscountResponse:
    """Update discount policy (Admin / Staff only)."""
    return DiscountService.update_discount(
        db=db,
        discount_id=discount_id,
        name=payload.name,
        discount_type=payload.discount_type,
        discount_value=payload.discount_value,
        minimum_quantity=payload.minimum_quantity,
        start_date=payload.start_date,
        end_date=payload.end_date,
        usage_limit=payload.usage_limit,
        is_active=payload.is_active
    )


@router.post(
    "/{discount_id}/validate",
    response_model=DiscountValidateResponse,
    status_code=status.HTTP_200_OK,
    summary="Validate Discount Eligibility",
    description="Simulate discount application against an order subtotal and quantity without consuming usage count."
)
def validate_discount(
    discount_id: uuid.UUID,
    payload: DiscountValidateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> DiscountValidateResponse:
    """Test discount validity and calculate simulated reduction."""
    discount = DiscountService.get_discount_by_id(db, discount_id)
    calculated_amount = DiscountService.validate_discount_entity(
        discount=discount,
        subtotal=payload.subtotal,
        total_quantity=payload.total_quantity
    )
    final_subtotal = max(Decimal("0.00"), payload.subtotal - calculated_amount)

    return DiscountValidateResponse(
        is_valid=True,
        discount_name=discount.name,
        discount_type=discount.discount_type,
        discount_value=discount.discount_value,
        calculated_discount=calculated_amount,
        final_subtotal=final_subtotal,
        message=f"Discount '{discount.name}' is valid and provides a reduction of {calculated_amount}."
    )
