from fastapi import APIRouter
from app.routers import health, invoices

api_router = APIRouter()

# Register sub-routers
api_router.include_router(health.router)
api_router.include_router(invoices.router)
