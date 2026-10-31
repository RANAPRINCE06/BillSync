from datetime import datetime
import re
from typing import Optional
import uuid
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator

from app.models.enums import UserRole


def validate_password_strength(v: str) -> str:
    """Enforce password longer than 8 characters with uppercase, lowercase, and special characters."""
    if len(v) <= 8:
        raise ValueError("Password must be longer than 8 characters.")
    if not re.search(r"[A-Z]", v):
        raise ValueError("Password must contain at least one uppercase letter.")
    if not re.search(r"[a-z]", v):
        raise ValueError("Password must contain at least one lowercase letter.")
    if not re.search(r"[0-9]", v):
        raise ValueError("Password must contain at least one numeric digit.")
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>]", v):
        raise ValueError("Password must contain at least one special character.")
    return v


class UserBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=255, description="Full name")
    email: EmailStr = Field(..., description="Unique email address")


class UserRegisterRequest(UserBase):
    password: str = Field(..., description="Password meeting complexity requirements")

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return validate_password_strength(v)


class UserAdminCreateRequest(UserRegisterRequest):
    """Admin-only user creation schema that allows specifying roles (e.g. STAFF)."""
    role: UserRole = Field(default=UserRole.CUSTOMER, description="Assigned role")


class UserResponse(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    role: UserRole
    is_active: bool
    created_at: datetime
    updated_at: datetime
