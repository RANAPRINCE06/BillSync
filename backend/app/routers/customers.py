from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.core.exceptions import ConflictException, ForbiddenException, NotFoundException
from app.dependencies.auth import get_current_user, require_admin, require_admin_or_staff
from app.dependencies.database import get_db
from app.models.customer import Customer
from app.models.enums import UserRole
from app.models.invoice import Invoice
from app.models.payment import Payment
from app.models.quotation import Quotation
from app.models.subscription import Subscription
from app.models.user import User
from app.schemas.customer import (
    CustomerCreate,
    CustomerListResponse,
    CustomerResponse,
    CustomerUpdate,
)
from app.schemas.invoice import InvoiceResponse
from app.schemas.payment import PaymentResponse
from app.schemas.quotation import QuotationResponse
from app.schemas.response import APIResponse
from app.schemas.subscription import SubscriptionResponse
from app.services.invoice_service import InvoiceService
from app.services.payment_service import PaymentService
from app.services.quotation_service import QuotationService
from app.services.subscription_service import SubscriptionService

router = APIRouter(prefix="/customers", tags=["Customer Management"])


def _check_customer_ownership(customer: Customer, current_user: User) -> None:
    """Enforce that customer users can only access their own customer profile."""
    if current_user.role == UserRole.CUSTOMER:
        if customer.user_id != current_user.id:
            raise ForbiddenException("Access denied. You can only access your own customer profile.")


@router.get(
    "",
    response_model=APIResponse[CustomerListResponse],
    status_code=status.HTTP_200_OK,
    summary="List Customers",
    description="Returns paginated list of customers. Customers see only their own profile; Staff/Admin see all."
)
def list_customers(
    page: int = Query(1, ge=1, description="Page number"),
    size: int = Query(20, ge=1, le=100, description="Items per page"),
    search: Optional[str] = Query(None, description="Search by name, email, or phone"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[CustomerListResponse]:
    """List customers with role filtering."""
    query = select(Customer)

    if current_user.role == UserRole.CUSTOMER:
        query = query.where(Customer.user_id == current_user.id)
    else:
        if search:
            pattern = f"%{search.strip()}%"
            query = query.where(
                or_(
                    Customer.name.ilike(pattern),
                    Customer.email.ilike(pattern),
                    Customer.phone.ilike(pattern)
                )
            )

    count_query = select(func.count()).select_from(query.subquery())
    total = db.scalar(count_query) or 0

    offset = (page - 1) * size
    stmt = query.order_by(Customer.created_at.desc()).offset(offset).limit(size)
    items = list(db.scalars(stmt).all())

    return APIResponse(
        success=True,
        message="Customers retrieved successfully",
        data=CustomerListResponse(
            items=[CustomerResponse.model_validate(c) for c in items],
            total=total,
            page=page,
            size=size
        )
    )


@router.post(
    "",
    response_model=APIResponse[CustomerResponse],
    status_code=status.HTTP_201_CREATED,
    summary="Create Customer",
    description="Creates a new customer entity. Staff/Admin only."
)
def create_customer(
    payload: CustomerCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin_or_staff)
) -> APIResponse[CustomerResponse]:
    """Create a new customer."""
    existing = db.scalars(select(Customer).where(Customer.email == payload.email)).first()
    if existing:
        raise ConflictException(f"Customer with email '{payload.email}' already exists.")

    customer = Customer(
        name=payload.name,
        email=payload.email,
        phone=payload.phone,
        billing_address=payload.billing_address,
        user_id=payload.user_id
    )
    db.add(customer)
    db.commit()
    db.refresh(customer)

    return APIResponse(
        success=True,
        message="Customer created successfully",
        data=CustomerResponse.model_validate(customer)
    )


@router.get(
    "/{customer_id}",
    response_model=APIResponse[CustomerResponse],
    status_code=status.HTTP_200_OK,
    summary="Get Customer by ID",
    description="Retrieves a customer by UUID with ownership verification."
)
def get_customer_by_id(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[CustomerResponse]:
    """Fetch single customer."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise NotFoundException(f"Customer with ID '{customer_id}' was not found.")

    _check_customer_ownership(customer, current_user)

    return APIResponse(
        success=True,
        message="Customer retrieved successfully",
        data=CustomerResponse.model_validate(customer)
    )


@router.put(
    "/{customer_id}",
    response_model=APIResponse[CustomerResponse],
    status_code=status.HTTP_200_OK,
    summary="Update Customer",
    description="Updates customer details. Staff/Admin or owner customer."
)
def update_customer(
    customer_id: uuid.UUID,
    payload: CustomerUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[CustomerResponse]:
    """Update customer details."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise NotFoundException(f"Customer with ID '{customer_id}' was not found.")

    _check_customer_ownership(customer, current_user)

    if payload.name is not None:
        customer.name = payload.name
    if payload.email is not None:
        conflict = db.scalars(
            select(Customer).where(Customer.email == payload.email, Customer.id != customer_id)
        ).first()
        if conflict:
            raise ConflictException(f"Customer with email '{payload.email}' already exists.")
        customer.email = payload.email
    if payload.phone is not None:
        customer.phone = payload.phone
    if payload.billing_address is not None:
        customer.billing_address = payload.billing_address

    db.commit()
    db.refresh(customer)

    return APIResponse(
        success=True,
        message="Customer updated successfully",
        data=CustomerResponse.model_validate(customer)
    )


@router.delete(
    "/{customer_id}",
    response_model=APIResponse[Dict[str, str]],
    status_code=status.HTTP_200_OK,
    summary="Delete Customer",
    description="Deletes a customer profile. Admin only."
)
def delete_customer(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_admin)
) -> APIResponse[Dict[str, str]]:
    """Delete customer record."""
    customer = db.get(Customer, customer_id)
    if not customer:
        raise NotFoundException(f"Customer with ID '{customer_id}' was not found.")

    db.delete(customer)
    db.commit()

    return APIResponse(
        success=True,
        message="Customer deleted successfully",
        data={"id": str(customer_id)}
    )


# -----------------------------------------------------------------------------
# Customer Sub-resource Endpoints
# -----------------------------------------------------------------------------

@router.get(
    "/{customer_id}/subscriptions",
    response_model=APIResponse[List[SubscriptionResponse]],
    status_code=status.HTTP_200_OK,
    summary="Get Customer Subscriptions",
    description="Returns all subscriptions belonging to this customer."
)
def get_customer_subscriptions(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[SubscriptionResponse]]:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise NotFoundException(f"Customer with ID '{customer_id}' was not found.")
    _check_customer_ownership(customer, current_user)

    subs = list(db.scalars(
        select(Subscription).where(Subscription.customer_id == customer_id).order_by(Subscription.created_at.desc())
    ).all())

    return APIResponse(
        success=True,
        message="Customer subscriptions retrieved successfully",
        data=[SubscriptionService.to_response(s) for s in subs]
    )


@router.get(
    "/{customer_id}/quotations",
    response_model=APIResponse[List[QuotationResponse]],
    status_code=status.HTTP_200_OK,
    summary="Get Customer Quotations",
    description="Returns all quotations drafted for this customer."
)
def get_customer_quotations(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[QuotationResponse]]:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise NotFoundException(f"Customer with ID '{customer_id}' was not found.")
    _check_customer_ownership(customer, current_user)

    quotes = list(db.scalars(
        select(Quotation).where(Quotation.customer_id == customer_id).order_by(Quotation.created_at.desc())
    ).all())

    return APIResponse(
        success=True,
        message="Customer quotations retrieved successfully",
        data=[QuotationService.to_response(q) for q in quotes]
    )


@router.get(
    "/{customer_id}/invoices",
    response_model=APIResponse[List[InvoiceResponse]],
    status_code=status.HTTP_200_OK,
    summary="Get Customer Invoices",
    description="Returns all invoices issued to this customer."
)
def get_customer_invoices(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[InvoiceResponse]]:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise NotFoundException(f"Customer with ID '{customer_id}' was not found.")
    _check_customer_ownership(customer, current_user)

    invoices = list(db.scalars(
        select(Invoice).where(Invoice.customer_id == customer_id).order_by(Invoice.created_at.desc())
    ).all())

    return APIResponse(
        success=True,
        message="Customer invoices retrieved successfully",
        data=[InvoiceService._serialize_invoice(inv) for inv in invoices]
    )


@router.get(
    "/{customer_id}/payments",
    response_model=APIResponse[List[PaymentResponse]],
    status_code=status.HTTP_200_OK,
    summary="Get Customer Payments",
    description="Returns all payments recorded for this customer."
)
def get_customer_payments(
    customer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
) -> APIResponse[List[PaymentResponse]]:
    customer = db.get(Customer, customer_id)
    if not customer:
        raise NotFoundException(f"Customer with ID '{customer_id}' was not found.")
    _check_customer_ownership(customer, current_user)

    payments = list(db.scalars(
        select(Payment)
        .join(Invoice, Payment.invoice_id == Invoice.id)
        .where(Invoice.customer_id == customer_id)
        .order_by(Payment.payment_date.desc())
    ).all())

    return APIResponse(
        success=True,
        message="Customer payments retrieved successfully",
        data=[PaymentService.to_response(p) for p in payments]
    )
