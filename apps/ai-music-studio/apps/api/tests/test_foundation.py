import json
import logging
from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient
from pydantic import ValidationError
from sqlalchemy.exc import OperationalError

from studio_api.config import Settings
from studio_api.logging import JsonFormatter
from studio_api.main import create_app


def settings(**overrides: object) -> Settings:
    return Settings(
        **{
            "env": "test",
            "database_url": "postgresql://studio:secret@localhost/studio_test",
            "asset_root": Path("/tmp/studio-api-tests"),
            **overrides,
        }
    )


def test_config_requires_database_and_absolute_storage(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("STUDIO_DATABASE_URL", raising=False)
    monkeypatch.delenv("STUDIO_ASSET_ROOT", raising=False)
    with pytest.raises(ValidationError):
        Settings()
    with pytest.raises(ValidationError):
        settings(asset_root="relative")
    with pytest.raises(ValidationError) as error:
        settings(database_url="sqlite:///secret.db")
    assert "secret.db" not in str(error.value)
    assert "secret" not in repr(settings())


def test_live_and_ready_contract() -> None:
    engine = MagicMock()
    with TestClient(create_app(settings(), engine)) as client:
        live = client.get("/api/v1/health/live")
        assert live.status_code == 200
        assert live.json()["service"] == "studio-api"
        assert live.headers["x-request-id"]
        ready = client.get("/api/v1/health/ready")
        assert ready.status_code == 200
        assert ready.json() == {"status": "ok", "service": "studio-api", "database": "ok"}
        assert engine.connect.return_value.__enter__.return_value.execute.call_count == 2


def test_database_failure_is_explicit_without_credentials() -> None:
    engine = MagicMock()
    engine.connect.side_effect = OperationalError("secret DSN", {}, Exception("secret password"))
    with TestClient(create_app(settings(), engine)) as client:
        response = client.get("/api/v1/health/ready")
        assert response.status_code == 503
        assert response.json()["database"] == "unavailable"
        assert "secret" not in response.text
        assert client.get("/api/v1/health/live").status_code == 200


def test_production_does_not_publish_api_docs() -> None:
    with TestClient(
        create_app(
            settings(env="production", public_url="https://studio.example.test"), MagicMock()
        )
    ) as client:
        assert client.get("/api/docs").status_code == 404
        assert client.get("/api/openapi.json").status_code == 404


def test_structured_logs() -> None:
    record = logging.LogRecord("studio.api", logging.INFO, "", 0, "Request completed", (), None)
    record.request_id = "example"
    payload = json.loads(JsonFormatter().format(record))
    assert payload["level"] == "INFO"
    assert payload["request_id"] == "example"
    assert payload["timestamp"]


def test_readiness_rejects_unmigrated_database() -> None:
    engine = MagicMock()
    engine.connect.return_value.__enter__.return_value.execute.return_value.scalar.return_value = (
        None
    )
    with TestClient(create_app(settings(), engine)) as client:
        assert client.get("/api/v1/health/ready").status_code == 503


def test_framework_errors_have_normalized_envelope() -> None:
    with TestClient(create_app(settings(), MagicMock())) as client:
        missing = client.get("/api/v1/unknown")
        assert missing.status_code == 404
        assert missing.json()["error"]["code"] == "request_failed"
        wrong_method = client.post(
            "/api/v1/health/live", headers={"Origin": "http://localhost:3210"}
        )
        assert wrong_method.status_code == 405
        assert wrong_method.json()["error"]["message"] == "Method Not Allowed"
