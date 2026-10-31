from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.dependencies.database import get_db
from app.services.health_service import HealthService
from app.schemas.health import SystemHealthResponse, DatabaseHealthResponse

router = APIRouter(tags=["Health & Diagnostics"])


@router.get(
    "/health",
    response_model=SystemHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Application Health Check",
    description="Returns the running status, version, and environment of the API service."
)
def get_system_health() -> SystemHealthResponse:
    """Retrieve service health status."""
    return HealthService.get_system_health()


@router.get(
    "/health/database",
    response_model=DatabaseHealthResponse,
    status_code=status.HTTP_200_OK,
    summary="Database Connectivity Check",
    description="Tests the connection to PostgreSQL by executing a ping query and measuring latency."
)
def get_database_health(db: Session = Depends(get_db)) -> DatabaseHealthResponse:
    """Check PostgreSQL database connection and responsiveness."""
    return HealthService.check_database_health(db)
