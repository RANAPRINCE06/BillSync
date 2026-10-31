from typing import Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user, require_admin_or_staff
from app.dependencies.database import get_db
from app.models.enums import SubscriptionStatus
from app.models.user import User
from app.schemas.response import APIResponse
from app.schemas.subscription import (
    SubscriptionCreate,
    SubscriptionListResponse,
    SubscriptionResponse,
)
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/subscriptions", tags=["Subscriptions Management & Lifecycles"])


@router.post(
    "",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create Subscription",
    description="Provisions a new recurring subscription with plan association. Staff/Admin only."
)
def create_subscription(
    payload: SubscriptionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[SubscriptionResponse]:
    """Create subscription."""
    sub = SubscriptionService.create_subscription(db=db, payload=payload, current_user=current_user)
    return APIResponse(
        success=True,
        message="Subscription provisioned successfully",
        data=SubscriptionService.to_response(sub)
    )


@router.get(
    "",
    response_model=APIResponse[SubscriptionListResponse],
    status_code=status.HTTP_200_OK,
    summary="List Subscriptions",
    description="Lists subscriptions. Customers view only their own subscriptions; Staff/Admin view all."
)
def list_subscriptions(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    customer_id: Optional[uuid.UUID] = Query(None, description="Filter by customer ID"),
    status: Optional[SubscriptionStatus] = Query(None, description="Filter by status"),
    plan_id: Optional[uuid.UUID] = Query(None, description="Filter by plan ID"),
    search: Optional[str] = Query(None, description="Search by subscription number or customer name"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[SubscriptionListResponse]:
    """List subscriptions with customer isolation."""
    items, total = SubscriptionService.list_subscriptions(
        db=db,
        current_user=current_user,
        customer_id=customer_id,
        status=status,
        plan_id=plan_id,
        search=search,
        page=page,
        size=size
    )
    return APIResponse(
        success=True,
        message="Subscriptions retrieved successfully",
        data=SubscriptionListResponse(
            items=[SubscriptionService.to_response(s) for s in items],
            total=total,
            page=page,
            size=size
        )
    )


@router.get(
    "/{subscription_id}",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Subscription by ID",
    description="Retrieves detailed subscription information. Customers view only their own subscriptions."
)
def get_subscription_by_id(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[SubscriptionResponse]:
    """Fetch single subscription."""
    sub = SubscriptionService.get_subscription_by_id(db=db, subscription_id=subscription_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Subscription retrieved successfully",
        data=SubscriptionService.to_response(sub)
    )


# -----------------------------------------------------------------------------
# Lifecycle Action Endpoints
# -----------------------------------------------------------------------------

@router.post(
    "/{subscription_id}/confirm",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_200_OK,
    summary="Confirm Subscription",
    description="Transitions draft or quotation subscription to confirmed state."
)
def confirm_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[SubscriptionResponse]:
    """Confirm subscription."""
    sub = SubscriptionService.confirm_subscription(db=db, subscription_id=subscription_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Subscription confirmed successfully",
        data=SubscriptionService.to_response(sub)
    )


@router.post(
    "/{subscription_id}/activate",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_200_OK,
    summary="Activate Subscription",
    description="Activates subscription and initializes next billing cycle date."
)
def activate_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[SubscriptionResponse]:
    """Activate subscription."""
    sub = SubscriptionService.activate_subscription(db=db, subscription_id=subscription_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Subscription activated successfully",
        data=SubscriptionService.to_response(sub)
    )


@router.post(
    "/{subscription_id}/pause",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_200_OK,
    summary="Pause Subscription",
    description="Pauses active subscription if plan policy permits."
)
def pause_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[SubscriptionResponse]:
    """Pause subscription."""
    sub = SubscriptionService.pause_subscription(db=db, subscription_id=subscription_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Subscription paused successfully",
        data=SubscriptionService.to_response(sub)
    )


@router.post(
    "/{subscription_id}/resume",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_200_OK,
    summary="Resume Subscription",
    description="Resumes a paused subscription and aligns upcoming billing cycle."
)
def resume_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[SubscriptionResponse]:
    """Resume subscription."""
    sub = SubscriptionService.resume_subscription(db=db, subscription_id=subscription_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Subscription resumed successfully",
        data=SubscriptionService.to_response(sub)
    )


@router.post(
    "/{subscription_id}/renew",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_200_OK,
    summary="Renew Subscription",
    description="Extends subscription term according to plan interval renewal policy."
)
def renew_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[SubscriptionResponse]:
    """Renew subscription."""
    sub = SubscriptionService.renew_subscription(db=db, subscription_id=subscription_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Subscription renewed successfully",
        data=SubscriptionService.to_response(sub)
    )


@router.post(
    "/{subscription_id}/close",
    response_model=APIResponse[SubscriptionResponse],
    status_code=status.HTTP_200_OK,
    summary="Close Subscription",
    description="Permanently closes / terminates subscription agreement."
)
def close_subscription(
    subscription_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[SubscriptionResponse]:
    """Close subscription."""
    sub = SubscriptionService.close_subscription(db=db, subscription_id=subscription_id, current_user=current_user)
    return APIResponse(
        success=True,
        message="Subscription closed successfully",
        data=SubscriptionService.to_response(sub)
    )
