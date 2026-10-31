from typing import List, Optional
import uuid
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.core.security import decode_access_token
from app.dependencies.database import get_db
from app.models.enums import UserRole
from app.models.user import User

bearer_scheme = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme),
    db: Session = Depends(get_db)
) -> User:
    """
    Validate the Bearer JWT token and return the authenticated User instance.
    """
    if not credentials:
        raise UnauthorizedException("Authentication token required.")

    payload = decode_access_token(credentials.credentials)
    if not payload or "sub" not in payload:
        raise UnauthorizedException("Invalid or expired authentication token.")

    try:
        user_id = uuid.UUID(payload["sub"])
    except (ValueError, TypeError):
        raise UnauthorizedException("Malformed authentication token subject.")

    user = db.get(User, user_id)
    if not user:
        raise UnauthorizedException("User associated with this token was not found.")
    if not user.is_active:
        raise UnauthorizedException("User account is inactive.")

    return user


def require_roles(*allowed_roles: UserRole):
    """
    Dependency factory that restricts endpoint access to specified UserRoles.
    """
    def role_checker(current_user: User = Depends(get_current_user)) -> User:
        if current_user.role not in allowed_roles:
            raise ForbiddenException(
                f"Access denied. Requires one of roles: {[r.value for r in allowed_roles]}"
            )
        return current_user

    return role_checker


# Convenient role dependencies
require_admin_or_staff = require_roles(UserRole.ADMIN, UserRole.STAFF)
require_admin = require_roles(UserRole.ADMIN)
