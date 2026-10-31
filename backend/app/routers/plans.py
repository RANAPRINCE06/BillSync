from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundException
from app.dependencies.auth import get_current_user, require_admin
from app.dependencies.database import get_db
from app.models.product import Plan, Product
from app.models.user import User
from app.schemas.plan import (
    PlanCreate,
    PlanListResponse,
    PlanResponse,
    PlanUpdate,
)
from app.schemas.response import APIResponse

router = APIRouter(prefix="/plans", tags=["Subscription Plans"])


@router.get(
    "",
    response_model=APIResponse[PlanListResponse],
    status_code=status.HTTP_200_OK,
    summary="List Plans",
    description="Returns subscription plans. Accessible to all authenticated users."
)
def list_plans(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    product_id: Optional[uuid.UUID] = Query(None, description="Filter by product UUID"),
    is_active: Optional[bool] = Query(None, description="Filter active/inactive plans"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[PlanListResponse]:
    query = select(Plan)
    if product_id is not None:
        query = query.where(Plan.product_id == product_id)
    if is_active is not None:
        query = query.where(Plan.is_active == is_active)

    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query) or 0

    offset = (page - 1) * size
    stmt = query.order_by(Plan.name.asc()).offset(offset).limit(size)
    items = list(db.scalars(stmt).all())

    return APIResponse(
        success=True,
        message="Plans retrieved successfully",
        data=PlanListResponse(
            items=[PlanResponse.model_validate(p) for p in items],
            total=total,
            page=page,
            size=size
        )
    )


@router.post(
    "",
    response_model=APIResponse[PlanResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create Plan",
    description="Creates a new subscription plan under a product. Admin only."
)
def create_plan(
    payload: PlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[PlanResponse]:
    product = db.get(Product, payload.product_id)
    if not product:
        raise NotFoundException(f"Product with ID '{payload.product_id}' was not found.")

    plan = Plan(
        product_id=payload.product_id,
        name=payload.name,
        billing_interval=payload.billing_interval,
        price=payload.price,
        minimum_quantity=payload.minimum_quantity,
        available_from=payload.available_from,
        available_until=payload.available_until,
        allow_pause=payload.allow_pause,
        allow_early_close=payload.allow_early_close,
        allow_renewal=payload.allow_renewal,
        is_active=payload.is_active
    )
    db.add(plan)
    db.commit()
    db.refresh(plan)

    return APIResponse(
        success=True,
        message="Plan created successfully",
        data=PlanResponse.model_validate(plan)
    )


@router.get(
    "/{plan_id}",
    response_model=APIResponse[PlanResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Plan by ID",
    description="Retrieves single plan details."
)
def get_plan_by_id(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[PlanResponse]:
    plan = db.get(Plan, plan_id)
    if not plan:
        raise NotFoundException(f"Plan with ID '{plan_id}' was not found.")

    return APIResponse(
        success=True,
        message="Plan retrieved successfully",
        data=PlanResponse.model_validate(plan)
    )


@router.put(
    "/{plan_id}",
    response_model=APIResponse[PlanResponse],
    status_code=status.HTTP_200_OK,
    summary="Update Plan",
    description="Updates subscription plan configuration. Admin only."
)
def update_plan(
    plan_id: uuid.UUID,
    payload: PlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[PlanResponse]:
    plan = db.get(Plan, plan_id)
    if not plan:
        raise NotFoundException(f"Plan with ID '{plan_id}' was not found.")

    if payload.product_id is not None:
        product = db.get(Product, payload.product_id)
        if not product:
            raise NotFoundException(f"Product with ID '{payload.product_id}' was not found.")
        plan.product_id = payload.product_id
    if payload.name is not None:
        plan.name = payload.name
    if payload.billing_interval is not None:
        plan.billing_interval = payload.billing_interval
    if payload.price is not None:
        plan.price = payload.price
    if payload.minimum_quantity is not None:
        plan.minimum_quantity = payload.minimum_quantity
    if payload.available_from is not None:
        plan.available_from = payload.available_from
    if payload.available_until is not None:
        plan.available_until = payload.available_until
    if payload.allow_pause is not None:
        plan.allow_pause = payload.allow_pause
    if payload.allow_early_close is not None:
        plan.allow_early_close = payload.allow_early_close
    if payload.allow_renewal is not None:
        plan.allow_renewal = payload.allow_renewal
    if payload.is_active is not None:
        plan.is_active = payload.is_active

    db.commit()
    db.refresh(plan)

    return APIResponse(
        success=True,
        message="Plan updated successfully",
        data=PlanResponse.model_validate(plan)
    )


@router.delete(
    "/{plan_id}",
    response_model=APIResponse[Dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="Delete Plan",
    description="Deletes subscription plan. Admin only."
)
def delete_plan(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[Dict[str, str]]:
    plan = db.get(Plan, plan_id)
    if not plan:
        raise NotFoundException(f"Plan with ID '{plan_id}' was not found.")

    db.delete(plan)
    db.commit()

    return APIResponse(
        success=True,
        message="Plan deleted successfully",
        data={"id": str(plan_id)}
    )
