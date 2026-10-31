from typing import Any, Optional
from app.schemas.response import APIResponse, APIErrorResponse, ErrorDetail


def create_success_response(data: Any = None, message: Optional[str] = None) -> APIResponse[Any]:
    """Helper to return standardized success API response."""
    return APIResponse(
        success=True,
        message=message,
        data=data
    )


def create_error_response(code: str, message: str, details: Optional[Any] = None) -> APIErrorResponse:
    """Helper to return standardized error API response."""
    return APIErrorResponse(
        success=False,
        error=ErrorDetail(
            code=code,
            message=message,
            details=details
        )
    )
