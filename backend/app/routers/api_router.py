from fastapi import APIRouter
from app.routers import health

api_router = APIRouter()

# Register sub-routers
api_router.include_router(health.router)
