import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from sqlalchemy import text

from app.core.config import settings
from app.core.exceptions import (
    AppException,
    app_exception_handler,
    validation_exception_handler,
    http_exception_handler,
    unhandled_exception_handler,
)
from app.db.session import engine
from app.routers import api_router
from app.schemas.health import RootResponse
from app.services.health_service import HealthService

# Configure logger
logging.basicConfig(
    level=logging.INFO if not settings.DEBUG else logging.DEBUG,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger("billsync.app")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    """
    Application lifespan manager.
    Handles startup checks and resource teardown.
    """
    logger.info("Initializing %s v%s in %s mode...", settings.PROJECT_NAME, settings.VERSION, settings.ENVIRONMENT)
    # Perform database connectivity pre-flight check
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        logger.info("PostgreSQL database connection verified successfully.")
    except Exception as exc:
        logger.warning("Database connection check on startup encountered an issue: %s", exc)

    yield

    logger.info("Shutting down %s...", settings.PROJECT_NAME)
    engine.dispose()
    logger.info("Database connection pool disposed.")


def create_application() -> FastAPI:
    """
    FastAPI application factory.
    Configures documentation, middleware, exception handlers, and routing.
    """
    application = FastAPI(
        title=settings.PROJECT_NAME,
        version=settings.VERSION,
        description=(
            "**BillSync** is an enterprise-grade Subscription Management System developed for hackathons. "
            "It handles recurring billing, automated invoice generation, payment recording, and financial reporting."
        ),
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    application.state.debug = settings.DEBUG

    # Configure CORS middleware
    application.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS if isinstance(settings.CORS_ORIGINS, list) else [settings.CORS_ORIGINS],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Register Exception Handlers
    application.add_exception_handler(AppException, app_exception_handler)
    application.add_exception_handler(RequestValidationError, validation_exception_handler)
    application.add_exception_handler(StarletteHTTPException, http_exception_handler)
    application.add_exception_handler(Exception, unhandled_exception_handler)

    # Register API Routers
    application.include_router(api_router, prefix=settings.API_V1_PREFIX)
    if settings.API_V1_PREFIX != "/api/v1":
        application.include_router(api_router, prefix="/api/v1")

    # Root Endpoint
    @application.get(
        "/",
        response_model=RootResponse,
        tags=["System"],
        summary="Service Root / Welcome Endpoint",
        description="Returns basic service metadata, documentation links, and operational status."
    )
    def root() -> RootResponse:
        return HealthService.get_root_info()

    return application


app = create_application()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=settings.DEBUG
    )
