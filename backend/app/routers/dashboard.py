from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.dependencies.auth import get_current_user
from app.dependencies.database import get_db
from app.models.user import User
from app.schemas.dashboard import (
    ChartGrouping,
    DashboardStatsResponse,
    RecentActivityItem,
    RevenueChartPoint,
    RevenueChartResponse,
)
from app.schemas.response import APIResponse
from app.services.dashboard_service import DashboardService

router = APIRouter(prefix="/dashboard", tags=["Dashboard Analytics & Reports"])


@router.get(
    "/stats",
    response_model=APIResponse[DashboardStatsResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Dashboard Statistics",
    description="Returns aggregate operational and financial metrics. Admin/Staff view org-wide data; Customers see only their own data."
)
def get_dashboard_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[DashboardStatsResponse]:
    """Retrieve accurate database-backed financial and customer statistics."""
    stats = DashboardService.get_dashboard_stats(db=db, current_user=current_user)
    return APIResponse(
        success=True,
        message="Dashboard stats retrieved successfully",
        data=stats
    )


@router.get(
    "/revenue-chart",
    response_model=APIResponse[List[RevenueChartPoint]],
    status_code=status.HTTP_200_OK,
    summary="Get Revenue Trend Chart",
    description="Returns chronological revenue series grouped by day, week, or month with zero-revenue periods filled."
)
def get_revenue_chart(
    group_by: ChartGrouping = Query(ChartGrouping.MONTH, description="Time interval: day, week, or month"),
    start_date: Optional[datetime] = Query(None, description="Start date (ISO format)"),
    end_date: Optional[datetime] = Query(None, description="End date (ISO format)"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[RevenueChartPoint]]:
    """Retrieve chronological revenue series for dynamic chart rendering."""
    chart = DashboardService.get_revenue_chart(
        db=db,
        current_user=current_user,
        group_by=group_by,
        start_date=start_date,
        end_date=end_date
    )
    return APIResponse(
        success=True,
        message="Revenue chart data retrieved successfully",
        data=chart.items
    )


@router.get(
    "/recent-activity",
    response_model=APIResponse[List[RecentActivityItem]],
    status_code=status.HTTP_200_OK,
    summary="Get Recent Financial Activity",
    description="Returns unified feed of recent invoices, payments, refunds, and subscription activations."
)
def get_recent_activity(
    limit: int = Query(10, ge=1, le=50, description="Max activities to return"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[RecentActivityItem]]:
    """Retrieve chronological recent financial activity feed."""
    feed = DashboardService.get_recent_activity(
        db=db,
        current_user=current_user,
        limit=limit
    )
    return APIResponse(
        success=True,
        message="Recent activity feed retrieved successfully",
        data=feed.items
    )


@router.get(
    "/recent-subscriptions",
    response_model=APIResponse[List[Dict[str, Any]]],
    status_code=status.HTTP_200_OK,
    summary="Get Recent Subscriptions for Dashboard",
    description="Returns recent active subscriptions for dashboard preview table."
)
def get_recent_subscriptions(
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[Dict[str, Any]]]:
    """Retrieve recent subscription entries."""
    subs = DashboardService.get_recent_subscriptions(db=db, current_user=current_user, limit=limit)
    return APIResponse(
        success=True,
        message="Recent subscriptions retrieved successfully",
        data=subs
    )


@router.get(
    "/recent-invoices",
    response_model=APIResponse[List[Dict[str, Any]]],
    status_code=status.HTTP_200_OK,
    summary="Get Recent Invoices for Dashboard",
    description="Returns recent invoices for dashboard preview table."
)
def get_recent_invoices(
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[Dict[str, Any]]]:
    """Retrieve recent invoice entries."""
    invoices = DashboardService.get_recent_invoices(db=db, current_user=current_user, limit=limit)
    return APIResponse(
        success=True,
        message="Recent invoices retrieved successfully",
        data=invoices
    )
