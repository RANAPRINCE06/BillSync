from datetime import datetime
from typing import Optional
from pydantic import BaseModel, ConfigDict, Field


class RootResponse(BaseModel):
    """Schema for root GET / endpoint."""
    model_config = ConfigDict(from_attributes=True)

    app: str = Field(..., description="Application name")
    version: str = Field(..., description="API Version")
    environment: str = Field(..., description="Deployment environment")
    status: str = Field("online", description="Service status")
    docs_url: str = Field("/docs", description="Interactive Swagger documentation URL")
    redoc_url: str = Field("/redoc", description="ReDoc documentation URL")


class SystemHealthResponse(BaseModel):
    """Schema for GET /api/health endpoint."""
    model_config = ConfigDict(from_attributes=True)

    status: str = Field("ok", description="Application health status")
    app: str = Field(..., description="Application name")
    version: str = Field(..., description="Current application version")
    environment: str = Field(..., description="Current running environment")
    timestamp: datetime = Field(..., description="UTC timestamp of the check")


class DatabaseHealthResponse(BaseModel):
    """Schema for GET /api/health/database endpoint."""
    model_config = ConfigDict(from_attributes=True)

    status: str = Field("connected", description="Database health status")
    database: str = Field("PostgreSQL", description="Database dialect")
    database_name: str = Field(..., description="Connected database name")
    latency_ms: float = Field(..., description="Query latency in milliseconds")
    timestamp: datetime = Field(..., description="UTC timestamp of the check")
    details: Optional[str] = Field(None, description="Diagnostic details or error if any")
