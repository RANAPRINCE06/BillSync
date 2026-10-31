import pytest
from fastapi.testclient import TestClient
from app.core.config import settings


def test_root_endpoint(client: TestClient):
    """Verify GET / returns service information and docs URLs."""
    response = client.get("/")
    assert response.status_code == 200
    data = response.json()
    assert data["app"] == settings.PROJECT_NAME
    assert data["version"] == settings.VERSION
    assert data["environment"] == settings.ENVIRONMENT
    assert data["status"] == "online"
    assert data["docs_url"] == "/docs"
    assert data["redoc_url"] == "/redoc"


def test_system_health_endpoint(client: TestClient):
    """Verify GET /api/health returns ok status and valid timestamp."""
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["app"] == settings.PROJECT_NAME
    assert data["version"] == settings.VERSION
    assert data["environment"] == settings.ENVIRONMENT
    assert "timestamp" in data


def test_database_health_endpoint(client: TestClient):
    """Verify GET /api/health/database connects to PostgreSQL and measures latency."""
    response = client.get("/api/health/database")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "connected"
    assert data["database"] == "PostgreSQL"
    assert data["database_name"] == settings.POSTGRES_DB
    assert isinstance(data["latency_ms"], (int, float))
    assert data["latency_ms"] >= 0
    assert "timestamp" in data


def test_swagger_documentation(client: TestClient):
    """Verify OpenAPI and Swagger documentation endpoints are accessible."""
    docs_response = client.get("/docs")
    assert docs_response.status_code == 200

    openapi_response = client.get("/openapi.json")
    assert openapi_response.status_code == 200
    openapi_data = openapi_response.json()
    assert openapi_data["info"]["title"] == settings.PROJECT_NAME
    assert openapi_data["info"]["version"] == settings.VERSION
    assert "/api/health" in openapi_data["paths"]
    assert "/api/health/database" in openapi_data["paths"]


def test_not_found_exception_handling(client: TestClient):
    """Verify 404 responses follow standardized error envelope."""
    response = client.get("/api/non-existent-endpoint")
    assert response.status_code == 404
    data = response.json()
    assert data["success"] is False
    assert "error" in data
    assert data["error"]["code"] == "HTTP_404"
    assert data["error"]["message"] is not None
