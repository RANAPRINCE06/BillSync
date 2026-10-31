from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.schemas.user import UserResponse


class LoginRequest(BaseModel):
    """User credentials for token issuance."""
    email: EmailStr = Field(..., description="Registered account email")
    password: str = Field(..., min_length=1, description="Account password")


class TokenResponse(BaseModel):
    """Issued JWT authentication token and user profile."""
    model_config = ConfigDict(from_attributes=True)

    access_token: str = Field(..., description="Bearer JWT access token")
    token_type: str = Field("bearer", description="Token type")
    user: UserResponse = Field(..., description="Authenticated user details")
