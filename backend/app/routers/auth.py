from typing import Any, Dict, Optional
from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, UnauthorizedException
from app.core.security import create_access_token, get_password_hash, verify_password
from app.dependencies.auth import get_current_user
from app.dependencies.database import get_db
from app.models.customer import Customer
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.auth import LoginRequest, TokenResponse
from app.schemas.response import APIResponse
from app.schemas.user import UserRegisterRequest, UserResponse

router = APIRouter(prefix="/auth", tags=["Authentication & Identity"])


class ForgotPasswordRequest(BaseModel):
    email: EmailStr = Field(..., description="Registered email address")


@router.post(
    "/login",
    response_model=APIResponse[TokenResponse],
    status_code=status.HTTP_200_OK,
    summary="User Login",
    description="Authenticates user credentials and issues a signed JWT access token."
)
def login(
    payload: LoginRequest,
    db: Session = Depends(get_db)
) -> APIResponse[TokenResponse]:
    """Authenticate credentials and issue JWT."""
    stmt = select(User).where(User.email == payload.email)
    user = db.scalars(stmt).first()

    if not user or not verify_password(payload.password, user.password_hash):
        raise UnauthorizedException("Invalid email or password.")

    if not user.is_active:
        raise UnauthorizedException("User account is inactive. Please contact support.")

    token = create_access_token(
        subject=user.id,
        extra_claims={"role": user.role.value, "email": user.email}
    )

    token_data = TokenResponse(
        access_token=token,
        token_type="bearer",
        user=UserResponse.model_validate(user)
    )

    return APIResponse(
        success=True,
        message="Authentication successful",
        data=token_data
    )


@router.post(
    "/register",
    response_model=APIResponse[UserResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Customer Registration",
    description="Registers a new customer account and creates an initial customer profile."
)
def register(
    payload: UserRegisterRequest,
    db: Session = Depends(get_db)
) -> APIResponse[UserResponse]:
    """Register customer user account."""
    stmt = select(User).where(User.email == payload.email)
    existing_user = db.scalars(stmt).first()
    if existing_user:
        raise ConflictException(f"User with email '{payload.email}' already exists.")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=UserRole.CUSTOMER,
        is_active=True
    )
    db.add(user)
    db.flush()

    # Automatically create Customer profile if not exists
    cust_stmt = select(Customer).where(Customer.email == payload.email)
    existing_cust = db.scalars(cust_stmt).first()
    if not existing_cust:
        customer = Customer(
            user_id=user.id,
            name=user.name,
            email=user.email
        )
        db.add(customer)

    db.commit()
    db.refresh(user)

    return APIResponse(
        success=True,
        message="Account registered successfully",
        data=UserResponse.model_validate(user)
    )


@router.get(
    "/me",
    response_model=APIResponse[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Current User Profile",
    description="Returns profile details of the currently authenticated user."
)
def get_me(
    current_user: User = Depends(get_current_user)
) -> APIResponse[UserResponse]:
    """Get current user details."""
    return APIResponse(
        success=True,
        message="Profile retrieved successfully",
        data=UserResponse.model_validate(current_user)
    )


@router.post(
    "/forgot-password",
    response_model=APIResponse[Dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="Request Password Reset",
    description="Accepts user email and simulates password reset instructions dispatch."
)
def forgot_password(
    payload: ForgotPasswordRequest
) -> APIResponse[Dict[str, str]]:
    """Simulate password reset."""
    return APIResponse(
        success=True,
        message="Reset email sent successfully",
        data={"email": payload.email}
    )


@router.post(
    "/logout",
    response_model=APIResponse[Dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="User Logout",
    description="Invalidates current session on the client side."
)
def logout(
    current_user: User = Depends(get_current_user)
) -> APIResponse[Dict[str, str]]:
    """Acknowledge logout."""
    return APIResponse(
        success=True,
        message="Successfully logged out",
        data={"email": current_user.email}
    )
