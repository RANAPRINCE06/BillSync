import time
from datetime import datetime, timezone
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import DatabaseConnectionException
from app.schemas.health import SystemHealthResponse, DatabaseHealthResponse, RootResponse


class HealthService:
    """Service layer managing application and database health checks."""

    @staticmethod
    def get_root_info() -> RootResponse:
        """Returns application metadata and status for root / endpoint."""
        return RootResponse(
            app=settings.PROJECT_NAME,
            version=settings.VERSION,
            environment=settings.ENVIRONMENT,
            status="online",
            docs_url="/docs",
            redoc_url="/redoc"
        )

    @staticmethod
    def get_system_health() -> SystemHealthResponse:
        """Returns current system health status."""
        return SystemHealthResponse(
            status="ok",
            app=settings.PROJECT_NAME,
            version=settings.VERSION,
            environment=settings.ENVIRONMENT,
            timestamp=datetime.now(timezone.utc)
        )

    @staticmethod
    def check_database_health(db: Session) -> DatabaseHealthResponse:
        """
        Executes a ping query (SELECT 1) against the PostgreSQL database
        and calculates latency.
        """
        start_time = time.perf_counter()
        try:
            result = db.execute(text("SELECT 1")).scalar()
            latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
            if result != 1:
                raise DatabaseConnectionException(
                    message="Database returned unexpected response during health ping"
                )
            return DatabaseHealthResponse(
                status="connected",
                database="PostgreSQL",
                database_name=settings.POSTGRES_DB,
                latency_ms=latency_ms,
                timestamp=datetime.now(timezone.utc)
            )
        except Exception as exc:
            if isinstance(exc, DatabaseConnectionException):
                raise exc
            raise DatabaseConnectionException(
                message="Failed to connect to the PostgreSQL database",
                details=str(exc)
            ) from exc
