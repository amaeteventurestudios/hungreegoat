import os
from datetime import timedelta
from pathlib import Path
from uuid import uuid4

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from studio_api.auth import password_hasher, token_hash
from studio_api.bootstrap import bootstrap_owner
from studio_api.config import Settings
from studio_api.database import create_database_engine
from studio_api.main import create_app
from studio_api.models import (
    AuthSession,
    User,
    Workspace,
    WorkspaceSettings,
    utcnow,
)
from studio_api.schemas import SettingsDocument

pytestmark = pytest.mark.skipif(
    not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs test PostgreSQL"
)
PASSWORD = "test-password-very-private"
ORIGIN = "http://localhost:3210"


@pytest.fixture()
def configured(monkeypatch: pytest.MonkeyPatch, tmp_path: Path):
    monkeypatch.setenv("STUDIO_DATABASE_URL", os.environ["STUDIO_TEST_DATABASE_URL"])
    monkeypatch.setenv("STUDIO_ASSET_ROOT", str(tmp_path))
    monkeypatch.setenv("STUDIO_ENV", "test")
    command.upgrade(Config(str(Path(__file__).parents[1] / "alembic.ini")), "head")
    config = Settings()
    engine = create_database_engine(config)
    with Session(engine) as db:
        from studio_api.database import Base

        for table in reversed(Base.metadata.sorted_tables):
            if table.name != "alembic_version":
                db.execute(delete(table))
        db.commit()
        bootstrap_owner(db, "owner@example.test", PASSWORD, "Owner", "Studio one")
    yield config, engine
    engine.dispose()


def login(client: TestClient):
    response = client.post(
        "/api/v1/auth/login",
        json={"email": "owner@example.test", "password": PASSWORD},
        headers={"Origin": ORIGIN},
    )
    assert response.status_code == 200, response.text
    return response


def test_session_settings_persistence_and_logout(configured):
    config, engine = configured
    with TestClient(create_app(config, engine)) as client:
        assert client.get("/api/v1/auth/session").json()["authenticated"] is False
        assert client.get("/api/v1/settings").status_code == 401
        response = login(client)
        body = response.json()
        assert body["workspaces"][0]["name"] == "Studio one"
        assert "HttpOnly" in response.headers["set-cookie"]
        assert response.headers["cache-control"] == "no-store"
        raw_cookie = client.cookies.get("studio_session")
        with Session(engine) as db:
            stored = db.get(AuthSession, token_hash(raw_cookie))
            assert stored is not None and stored.token_hash != raw_cookie
            assert db.scalar(select(User)).password_hash != PASSWORD
        headers = {"Origin": ORIGIN, "X-CSRF-Token": body["csrf_token"]}
        response = client.patch(
            "/api/v1/settings",
            json={"audio": {"bpm": 142}, "workspace": {"name": "New name"}},
            headers=headers,
        )
        assert response.status_code == 200
        assert response.json()["audio"] == {"bpm": 142, "sample_rate": 44100}
        assert client.get("/api/v1/settings/system").json()["storage"]["available"]
    with TestClient(create_app(config, engine)) as restarted:
        restarted.cookies.set("studio_session", raw_cookie)
        assert restarted.get("/api/v1/auth/session").json()["authenticated"]
        assert restarted.get("/api/v1/settings").json()["audio"]["bpm"] == 142
        assert restarted.post("/api/v1/auth/logout", headers=headers).status_code == 204
        restarted.cookies.set("studio_session", raw_cookie)
        assert restarted.get("/api/v1/settings").status_code == 401


def test_origin_csrf_validation_and_redaction(configured):
    config, engine = configured
    with TestClient(create_app(config, engine)) as client:
        response = client.post(
            "/api/v1/auth/login", json={"email": "owner@example.test", "password": PASSWORD}
        )
        assert response.status_code == 403
        assert (
            client.post(
                "/api/v1/auth/login",
                json={"email": "x", "password": PASSWORD},
                headers={"Origin": ORIGIN},
            ).status_code
            == 422
        )
        body = login(client).json()
        assert (
            client.patch(
                "/api/v1/settings", json={"audio": {"bpm": 141}}, headers={"Origin": ORIGIN}
            ).status_code
            == 403
        )
        headers = {"Origin": ORIGIN, "X-CSRF-Token": body["csrf_token"]}
        for patch in [
            {"audio": {"bpm": 301}},
            {"audio": {"password": PASSWORD}},
            {"workspace": None},
            {"workspace": {"name": "   "}},
        ]:
            response = client.patch("/api/v1/settings", json=patch, headers=headers)
            assert response.status_code == 422
            assert PASSWORD not in response.text
        response = client.post(
            "/api/v1/auth/password",
            json={"current_password": PASSWORD, "new_password": "short"},
            headers=headers,
        )
        assert response.status_code == 422
        assert PASSWORD not in response.text and "short" not in response.text
        assert (
            client.patch(
                "/api/v1/settings", json={}, headers={**headers, "Origin": "https://evil.test"}
            ).status_code
            == 403
        )


def test_expiry_membership_isolation_and_password_revoke(configured):
    config, engine = configured
    with TestClient(create_app(config, engine)) as client:
        body = login(client).json()
        token = token_hash(client.cookies.get("studio_session"))
        with Session(engine) as db:
            workspace = Workspace(id=uuid4(), name="Other workspace")
            db.add(workspace)
            db.flush()
            db.add(
                WorkspaceSettings(
                    workspace_id=workspace.id, document=SettingsDocument().model_dump()
                )
            )
            session = db.get(AuthSession, token)
            old_workspace = session.workspace_id
            session.workspace_id = workspace.id
            db.commit()
        assert client.get("/api/v1/settings").status_code == 401
        with Session(engine) as db:
            session = db.get(AuthSession, token)
            session.workspace_id = old_workspace
            session.expires_at = utcnow() - timedelta(seconds=1)
            db.commit()
        assert client.get("/api/v1/settings").status_code == 401
        body = login(client).json()
        headers = {"Origin": ORIGIN, "X-CSRF-Token": body["csrf_token"]}
        response = client.post(
            "/api/v1/auth/password",
            json={"current_password": PASSWORD, "new_password": PASSWORD + "-new"},
            headers=headers,
        )
        assert response.status_code == 204
        assert client.get("/api/v1/auth/session").json()["authenticated"] is False
        with Session(engine) as db:
            assert not db.scalars(select(AuthSession)).all()
            password_hasher.verify(db.scalar(select(User)).password_hash, PASSWORD + "-new")


def test_bootstrap_refuses_existing_owner_and_throttle_persists(configured):
    config, engine = configured
    with Session(engine) as db:
        with pytest.raises(ValueError, match="already exists"):
            bootstrap_owner(db, "attacker@example.test", PASSWORD, "Attacker", "Other")
    for attempt in range(6):
        with TestClient(create_app(config, engine)) as client:
            response = client.post(
                "/api/v1/auth/login",
                json={"email": "owner@example.test", "password": "incorrect"},
                headers={"Origin": ORIGIN},
            )
            assert response.status_code == (401 if attempt < 5 else 429)


def test_production_cookie_flags(configured):
    config, engine = configured
    production = config.model_copy(
        update={"env": "production", "public_url": "https://studio.example.test"}
    )
    with TestClient(
        create_app(production, engine), base_url="https://studio.example.test"
    ) as client:
        response = client.post(
            "/api/v1/auth/login",
            json={"email": "owner@example.test", "password": PASSWORD},
            headers={"Origin": "https://studio.example.test"},
        )
        cookie = response.headers["set-cookie"]
        assert "__Host-studio_session=" in cookie and "Secure" in cookie and "HttpOnly" in cookie
        assert "SameSite=lax" in cookie and "Path=/" in cookie and "Domain=" not in cookie


def test_bootstrap_cli_protected_file_and_no_password_output(configured, tmp_path):
    import subprocess
    import sys

    password_file = tmp_path / "owner-password"
    password_file.write_text(PASSWORD)
    password_file.chmod(0o644)
    argv = [
        sys.executable,
        "-m",
        "studio_api.bootstrap",
        "--email",
        "owner@example.test",
        "--password-file",
        str(password_file),
    ]
    rejected = subprocess.run(argv, capture_output=True, text=True)
    assert rejected.returncode != 0 and "0600" in rejected.stderr
    assert PASSWORD not in rejected.stdout + rejected.stderr
    password_file.chmod(0o600)
    existing = subprocess.run(argv, capture_output=True, text=True)
    assert existing.returncode != 0 and "already exists" in existing.stderr
    assert PASSWORD not in existing.stdout + existing.stderr


def test_source_throttle_blocks_email_spray_but_successes_do_not_count(configured):
    config, engine = configured
    with TestClient(create_app(config, engine)) as client:
        for _ in range(22):
            login(client)
        for attempt in range(21):
            response = client.post(
                "/api/v1/auth/login",
                json={"email": f"unknown{attempt}@example.test", "password": "invalid"},
                headers={"Origin": ORIGIN, "X-Forwarded-For": str(attempt)},
            )
            assert response.status_code == (401 if attempt < 20 else 429)


def test_request_size_bound(configured):
    config, engine = configured
    with TestClient(create_app(config, engine)) as client:
        response = client.post(
            "/api/v1/auth/login",
            content=b"x" * (1024 * 1024 + 1),
            headers={"Origin": ORIGIN, "Content-Type": "application/json"},
        )
        assert response.status_code == 413
        assert response.json()["error"]["code"] == "request_too_large"
