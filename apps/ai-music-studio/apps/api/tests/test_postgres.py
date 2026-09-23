"""Opt-in disposable PostgreSQL migration and readiness integration check."""

import os
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient

from studio_api.config import Settings
from studio_api.main import create_app


@pytest.mark.skipif(not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs disposable PostgreSQL")
def test_migrations_and_readiness(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    database_url = os.environ["STUDIO_TEST_DATABASE_URL"]
    monkeypatch.setenv("STUDIO_DATABASE_URL", database_url)
    monkeypatch.setenv("STUDIO_ASSET_ROOT", str(tmp_path))
    monkeypatch.setenv("STUDIO_ENV", "test")
    config = Config(str(Path(__file__).parents[1] / "alembic.ini"))
    command.upgrade(config, "head")
    command.check(config)
    with TestClient(create_app(Settings())) as client:
        assert client.get("/api/v1/health/ready").status_code == 200
    command.downgrade(config, "base")
    command.upgrade(config, "head")
