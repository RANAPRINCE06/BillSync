from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, NotFoundException
from app.dependencies.auth import get_current_user, require_admin
from app.dependencies.database import get_db
from app.models.enums import ProductType
from app.models.product import Product
from app.models.user import User
from app.schemas.product import (
    ProductCreate,
    ProductListResponse,
    ProductResponse,
    ProductUpdate,
)
from app.schemas.response import APIResponse

router = APIRouter(prefix="/products", tags=["Product Catalog"])


@router.get(
    "",
    response_model=APIResponse[ProductListResponse],
    status_code=status.HTTP_200_OK,
    summary="List Products",
    description="Returns paginated catalog products. Accessible to all authenticated users."
)
def list_products(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    product_type: Optional[ProductType] = Query(None, description="Filter by product type"),
    is_active: Optional[bool] = Query(None, description="Filter active/inactive products"),
    search: Optional[str] = Query(None, description="Search by product name or description"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[ProductListResponse]:
    query = select(Product)
    if product_type is not None:
        query = query.where(Product.product_type == product_type)
    if is_active is not None:
        query = query.where(Product.is_active == is_active)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.where(
            or_(
                Product.name.ilike(pattern),
                Product.description.ilike(pattern)
            )
        )

    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query) or 0

    offset = (page - 1) * size
    stmt = query.order_by(Product.name.asc()).offset(offset).limit(size)
    items = list(db.scalars(stmt).all())

    return APIResponse(
        success=True,
        message="Products retrieved successfully",
        data=ProductListResponse(
            items=[ProductResponse.model_validate(p) for p in items],
            total=total,
            page=page,
            size=size
        )
    )


@router.post(
    "",
    response_model=APIResponse[ProductResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create Product",
    description="Adds a new product to the catalog. Admin only."
)
def create_product(
    payload: ProductCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[ProductResponse]:
    product = Product(
        name=payload.name,
        description=payload.description,
        product_type=payload.product_type,
        sales_price=payload.sales_price,
        cost_price=payload.cost_price,
        notes=payload.notes,
        is_active=payload.is_active
    )
    db.add(product)
    db.commit()
    db.refresh(product)

    return APIResponse(
        success=True,
        message="Product created successfully",
        data=ProductResponse.model_validate(product)
    )


@router.get(
    "/{product_id}",
    response_model=APIResponse[ProductResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Product by ID",
    description="Retrieves single catalog product details."
)
def get_product_by_id(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[ProductResponse]:
    product = db.get(Product, product_id)
    if not product:
        raise NotFoundException(f"Product with ID '{product_id}' was not found.")

    return APIResponse(
        success=True,
        message="Product retrieved successfully",
        data=ProductResponse.model_validate(product)
    )


@router.put(
    "/{product_id}",
    response_model=APIResponse[ProductResponse],
    status_code=status.HTTP_200_OK,
    summary="Update Product",
    description="Updates catalog product details. Admin only."
)
def update_product(
    product_id: uuid.UUID,
    payload: ProductUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[ProductResponse]:
    product = db.get(Product, product_id)
    if not product:
        raise NotFoundException(f"Product with ID '{product_id}' was not found.")

    if payload.name is not None:
        product.name = payload.name
    if payload.description is not None:
        product.description = payload.description
    if payload.product_type is not None:
        product.product_type = payload.product_type
    if payload.sales_price is not None:
        product.sales_price = payload.sales_price
    if payload.cost_price is not None:
        product.cost_price = payload.cost_price
    if payload.notes is not None:
        product.notes = payload.notes
    if payload.is_active is not None:
        product.is_active = payload.is_active

    db.commit()
    db.refresh(product)

    return APIResponse(
        success=True,
        message="Product updated successfully",
        data=ProductResponse.model_validate(product)
    )


@router.delete(
    "/{product_id}",
    response_model=APIResponse[Dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="Delete Product",
    description="Deletes product from catalog. Admin only."
)
def delete_product(
    product_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[Dict[str, str]]:
    product = db.get(Product, product_id)
    if not product:
        raise NotFoundException(f"Product with ID '{product_id}' was not found.")

    db.delete(product)
    db.commit()

    return APIResponse(
        success=True,
        message="Product deleted successfully",
        data={"id": str(product_id)}
    )
