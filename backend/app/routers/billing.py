from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies.auth import require_admin_or_staff
from app.dependencies.database import get_db
from app.models.user import User
from app.schemas.billing import (
    BillingRunRequest,
    BillingRunSummary,
    BillingStatusResponse,
)
from app.schemas.response import APIResponse
from app.services.billing_service import BillingService

router = APIRouter(prefix="/billing", tags=["Recurring Billing Automation"])


@router.post(
    "/run",
    response_model=APIResponse[BillingRunSummary],
    status_code=status.HTTP_200_OK,
    summary="Trigger Recurring Billing Cycle",
    description="Finds due active subscriptions, generates invoices, and advances billing dates. Admin/Staff only."
)
def run_billing_cycle(
    request: BillingRunRequest = BillingRunRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[BillingRunSummary]:
    """Execute automated recurring billing cycle."""
    summary = BillingService.run_billing_cycle(db=db, request=request)
    return APIResponse(
        success=True,
        message="Billing run completed",
        data=summary
    )


@router.get(
    "/status",
    response_model=APIResponse[BillingStatusResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Recurring Billing Pipeline Status",
    description="Returns count of active, currently due, and upcoming subscriptions. Admin/Staff only."
)
def get_billing_status(
    as_of: Optional[datetime] = Query(None, description="Optional timestamp cutoff"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[BillingStatusResponse]:
    """Retrieve recurring billing status metrics."""
    pipeline_status = BillingService.get_billing_status(db=db, as_of=as_of)
    return APIResponse(
        success=True,
        message="Billing status retrieved successfully",
        data=pipeline_status
    )
