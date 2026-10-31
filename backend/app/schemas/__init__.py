from app.schemas.response import APIResponse, APIErrorResponse, ErrorDetail
from app.schemas.health import RootResponse, SystemHealthResponse, DatabaseHealthResponse
from app.schemas.user import UserRegisterRequest, UserAdminCreateRequest, UserResponse
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.customer import CustomerCreate, CustomerUpdate, CustomerResponse
from app.schemas.product import ProductCreate, ProductUpdate, ProductResponse
from app.schemas.invoice import (
    InvoiceGenerateRequest,
    InvoiceItemCreate,
    InvoiceItemResponse,
    InvoiceResponse,
    InvoiceDetailResponse,
    InvoiceListResponse,
)
from app.schemas.discount import (
    DiscountCreate,
    DiscountUpdate,
    DiscountResponse,
    DiscountListResponse,
    DiscountValidateRequest,
    DiscountValidateResponse,
)

__all__ = [
    "APIResponse",
    "APIErrorResponse",
    "ErrorDetail",
    "RootResponse",
    "SystemHealthResponse",
    "DatabaseHealthResponse",
    "UserRegisterRequest",
    "UserAdminCreateRequest",
    "UserResponse",
    "LoginRequest",
    "TokenResponse",
    "CustomerCreate",
    "CustomerUpdate",
    "CustomerResponse",
    "ProductCreate",
    "ProductUpdate",
    "ProductResponse",
    "InvoiceGenerateRequest",
    "InvoiceItemCreate",
    "InvoiceItemResponse",
    "InvoiceResponse",
    "InvoiceDetailResponse",
    "InvoiceListResponse",
    "DiscountCreate",
    "DiscountUpdate",
    "DiscountResponse",
    "DiscountListResponse",
    "DiscountValidateRequest",
    "DiscountValidateResponse",
]
