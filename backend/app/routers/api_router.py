from fastapi import APIRouter
from app.routers import health, invoices, discounts, billing, payments, dashboard

api_router = APIRouter()

# Register sub-routers
api_router.include_router(health.router)
api_router.include_router(invoices.router)
api_router.include_router(discounts.router)
api_router.include_router(billing.router)
api_router.include_router(payments.router)
api_router.include_router(dashboard.router)
