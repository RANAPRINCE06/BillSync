from fastapi import APIRouter
from app.routers import (
    auth,
    billing,
    customers,
    dashboard,
    discounts,
    health,
    invoices,
    payments,
    plans,
    products,
    quotations,
    subscriptions,
    users,
)

api_router = APIRouter()

# Register sub-routers
api_router.include_router(health.router)
api_router.include_router(auth.router)
api_router.include_router(users.router)
api_router.include_router(customers.router)
api_router.include_router(products.router)
api_router.include_router(plans.router)
api_router.include_router(quotations.router)
api_router.include_router(subscriptions.router)
api_router.include_router(invoices.router)
api_router.include_router(payments.router)
api_router.include_router(discounts.router)
api_router.include_router(billing.router)
api_router.include_router(dashboard.router)
