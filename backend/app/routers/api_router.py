from fastapi import APIRouter
from app.routers import health, invoices, discounts, billing, payments, dashboard, quotations, subscriptions

api_router = APIRouter()

# Register sub-routers
api_router.include_router(health.router)
api_router.include_router(invoices.router)
api_router.include_router(discounts.router)
api_router.include_router(billing.router)
api_router.include_router(payments.router)
api_router.include_router(dashboard.router)
api_router.include_router(quotations.router)
api_router.include_router(subscriptions.router)
