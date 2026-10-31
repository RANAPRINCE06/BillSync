from typing import Generic, Optional, TypeVar, Any
from pydantic import BaseModel, ConfigDict

T = TypeVar("T")


class ErrorDetail(BaseModel):
    code: str
    message: str
    details: Optional[Any] = None


class APIResponse(BaseModel, Generic[T]):
    """Standard unified API response wrapper."""
    model_config = ConfigDict(from_attributes=True)

    success: bool = True
    message: Optional[str] = None
    data: Optional[T] = None


class APIErrorResponse(BaseModel):
    """Standard error response format."""
    success: bool = False
    error: ErrorDetail
