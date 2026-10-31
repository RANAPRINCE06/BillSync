from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, ForbiddenException, NotFoundException
from app.core.security import get_password_hash
from app.dependencies.auth import get_current_user, require_admin
from app.dependencies.database import get_db
from app.models.enums import UserRole
from app.models.user import User
from app.schemas.response import APIResponse
from app.schemas.user import (
    UserAdminCreateRequest,
    UserListResponse,
    UserResponse,
    UserUpdate,
)

router = APIRouter(prefix="/users", tags=["User & Role Management"])


@router.get(
    "",
    response_model=APIResponse[UserListResponse],
    status_code=status.HTTP_200_OK,
    summary="List Users",
    description="Returns all registered users with role and status information. Admin only."
)
def list_users(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    role: Optional[UserRole] = Query(None, description="Filter by user role"),
    search: Optional[str] = Query(None, description="Search by name or email"),
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[UserListResponse]:
    query = select(User)
    if role is not None:
        query = query.where(User.role == role)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                User.name.ilike(pattern),
                User.email.ilike(pattern)
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query) or 0

    offset = (page - 1) * size
    stmt = query.order_by(User.created_at.desc()).offset(offset).limit(size)
    items = list(db.scalars(stmt).all())

    return APIResponse(
        success=True,
        message="Users retrieved successfully",
        data=UserListResponse(
            items=[UserResponse.model_validate(u) for u in items],
            total=total,
            page=page,
            size=size
        )
    )


@router.post(
    "",
    response_model=APIResponse[UserResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create User",
    description="Creates a new system user with specified role. Admin only."
)
def create_user(
    payload: UserAdminCreateRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[UserResponse]:
    existing = db.scalars(select(User).where(User.email == payload.email)).first()
    if existing:
        raise ConflictException(f"User with email '{payload.email}' already exists.")

    user = User(
        name=payload.name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
        role=payload.role,
        is_active=True
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    return APIResponse(
        success=True,
        message="User created successfully",
        data=UserResponse.model_validate(user)
    )


@router.get(
    "/{user_id}",
    response_model=APIResponse[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="Get User by ID",
    description="Retrieves single user profile. Admin only, or requesting own user profile."
)
def get_user_by_id(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[UserResponse]:
    if current_user.role != UserRole.ADMIN and current_user.id != user_id:
        raise ForbiddenException("Access denied. You can only view your own user profile.")

    user = db.get(User, user_id)
    if not user:
        raise NotFoundException(f"User with ID '{user_id}' was not found.")

    return APIResponse(
        success=True,
        message="User retrieved successfully",
        data=UserResponse.model_validate(user)
    )


@router.put(
    "/{user_id}",
    response_model=APIResponse[UserResponse],
    status_code=status.HTTP_200_OK,
    summary="Update User",
    description="Updates user role, name, status, or password. Admin only."
)
def update_user(
    user_id: uuid.UUID,
    payload: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[UserResponse]:
    user = db.get(User, user_id)
    if not user:
        raise NotFoundException(f"User with ID '{user_id}' was not found.")

    if payload.name is not None:
        user.name = payload.name
    if payload.email is not None:
        conflict = db.scalars(
            select(User).where(User.email == payload.email, User.id != user_id)
        ).first()
        if conflict:
            raise ConflictException(f"User with email '{payload.email}' already exists.")
        user.email = payload.email
    if payload.role is not None:
        user.role = payload.role
    if payload.is_active is not None:
        user.is_active = payload.is_active
    if payload.password is not None:
        user.password_hash = get_password_hash(payload.password)

    db.commit()
    db.refresh(user)

    return APIResponse(
        success=True,
        message="User updated successfully",
        data=UserResponse.model_validate(user)
    )


@router.delete(
    "/{user_id}",
    response_model=APIResponse[Dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="Delete User",
    description="Deletes a user account. Admin only."
)
def delete_user(
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[Dict[str, str]]:
    if current_user.id == user_id:
        raise ConflictException("Cannot delete your own user account.")

    user = db.get(User, user_id)
    if not user:
        raise NotFoundException(f"User with ID '{user_id}' was not found.")

    db.delete(user)
    db.commit()

    return APIResponse(
        success=True,
        message="User deleted successfully",
        data={"id": str(user_id)}
    )
