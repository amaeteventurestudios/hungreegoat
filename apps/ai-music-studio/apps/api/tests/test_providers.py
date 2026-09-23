import os
import stat
from pathlib import Path

import httpx
import pytest
from cryptography.fernet import Fernet
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session
from test_auth_settings import ORIGIN, configured, login  # noqa: F401

from studio_api.main import create_app
from studio_api.models import AuthSession, Membership, ProviderConfig, Workspace
from studio_api.provider_http import get_provider_client
from studio_api.secret_store import EncryptedFileSecretStore, SecretStoreError

KEY = "test-only-not-real-provider-KEY1234"


@pytest.fixture()
def store(tmp_path: Path):
    root = tmp_path / "values"
    key_file = tmp_path / "key"
    key_file.write_bytes(Fernet.generate_key())
    key_file.chmod(0o600)
    return EncryptedFileSecretStore(root, key_file), key_file


def test_encryption_permissions_and_reference_validation(store):
    vault, key_file = store
    ref = vault.set_secret(KEY)
    assert vault.get_secret_for_server_use(ref) == KEY
    assert KEY.encode() not in (vault.root / ref).read_bytes()
    assert stat.S_IMODE(vault.root.stat().st_mode) == 0o700
    assert stat.S_IMODE((vault.root / ref).stat().st_mode) == 0o600
    for invalid in ["../key", str(key_file), "", "not-uuid"]:
        with pytest.raises(SecretStoreError):
            vault.get_secret_for_server_use(invalid)
    vault.delete_secret(ref)
    assert not vault.has_secret(ref)
    key_file.chmod(0o644)
    with pytest.raises(SecretStoreError):
        EncryptedFileSecretStore(vault.root, key_file)


def test_symlink_and_wrong_key_rejected(store, tmp_path):
    vault, key_file = store
    ref = vault.set_secret(KEY)
    (vault.root / ref).unlink()
    (vault.root / ref).symlink_to(key_file)
    with pytest.raises(SecretStoreError):
        vault.get_secret_for_server_use(ref)
    (vault.root / ref).unlink()
    ref = vault.set_secret(KEY)
    key_file.write_bytes(Fernet.generate_key())
    changed = EncryptedFileSecretStore(vault.root, key_file)
    with pytest.raises(SecretStoreError):
        changed.get_secret_for_server_use(ref)


@pytest.fixture()
def provider_app(configured, store):  # noqa: F811
    config, engine = configured
    vault, key_file = store
    config = config.model_copy(update={"secret_root": vault.root, "secret_key_file": key_file})
    app = create_app(config, engine)
    requests = []
    response = {"status": 200, "body": {"data": [{"id": "gpt-6-luna"}]}}

    def handle(request):
        requests.append(request)
        if response.get("timeout"):
            raise httpx.ReadTimeout("secret header " + KEY)
        return httpx.Response(response["status"], json=response["body"])

    client = httpx.Client(transport=httpx.MockTransport(handle))
    app.dependency_overrides[get_provider_client] = lambda: client
    with TestClient(app) as browser:
        body = login(browser).json()
        browser.headers.update({"Origin": ORIGIN, "X-CSRF-Token": body["csrf_token"]})
        yield browser, engine, vault, requests, response, body
    client.close()


@pytest.mark.skipif(not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL")
def test_provider_rotation_defaults_deletion(provider_app):
    browser, engine, vault, requests, upstream, body = provider_app
    rows = browser.get("/api/v1/settings/providers").json()["items"]
    assert len(rows) == 4 and not any(row["credential_present"] for row in rows)
    assert browser.post("/api/v1/settings/providers/openai/health-check").status_code == 409
    assert browser.get("/api/v1/settings/providers/openai/models").json()["source"] == "catalog"
    assert not requests
    assert (
        browser.patch(
            "/api/v1/settings", json={"providers": {"default_producer": "openai"}}
        ).status_code
        == 422
    )
    saved = browser.put("/api/v1/settings/providers/openai/credential", json={"api_key": KEY})
    assert (
        saved.status_code == 200 and KEY not in saved.text and "secret_reference" not in saved.text
    )
    assert saved.json()["masked_secret"] == "••••1234"
    assert saved.json()["connection_status"] == "unverified"
    with Session(engine) as db:
        first = db.scalar(select(ProviderConfig)).secret_reference
        assert KEY not in str(db.scalar(select(ProviderConfig)).__dict__)
    assert (
        browser.patch(
            "/api/v1/settings/providers/openai",
            json={"enabled": True, "default_model": "gpt-6-luna"},
        ).status_code
        == 200
    )
    assert (
        browser.patch(
            "/api/v1/settings", json={"providers": {"default_producer": "openai"}}
        ).status_code
        == 200
    )
    healthy = browser.post("/api/v1/settings/providers/openai/health-check")
    assert healthy.json()["ok"] and KEY not in healthy.text
    assert requests[-1].headers["Authorization"] == "Bearer " + KEY
    assert browser.get("/api/v1/settings/providers/openai/models").json()["source"] == "live"
    replacement = browser.put(
        "/api/v1/settings/providers/openai/credential", json={"api_key": KEY + "5678"}
    )
    assert replacement.json()["last_successful_health_check_at"] is None
    assert not vault.has_secret(first)
    assert len(list(vault.root.iterdir())) == 1
    assert browser.delete("/api/v1/settings/providers/openai/credential").json()["enabled"] is False
    assert not list(vault.root.iterdir())
    assert browser.get("/api/v1/settings").json()["providers"]["default_producer"] is None


@pytest.mark.skipif(not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL")
def test_health_redaction_models_and_scoping(provider_app):
    browser, engine, vault, requests, upstream, body = provider_app
    browser.put("/api/v1/settings/providers/openai/credential", json={"api_key": KEY})
    for status, code in [
        (401, "provider_auth_failed"),
        (429, "provider_rate_limited"),
        (500, "provider_unavailable"),
    ]:
        upstream.update(status=status, body={"error": KEY})
        response = browser.post("/api/v1/settings/providers/openai/health-check")
        assert response.json()["error_code"] == code and KEY not in response.text
        models = browser.get("/api/v1/settings/providers/openai/models")
        assert models.json()["source"] == "catalog" and KEY not in models.text
    upstream["timeout"] = True
    assert (
        browser.post("/api/v1/settings/providers/openai/health-check").json()["error_code"]
        == "provider_timeout"
    )
    upstream.update(
        timeout=False, status=200, body={"data": [{"id": KEY}, {"id": "gpt-6-luna", "name": KEY}]}
    )
    models = browser.get("/api/v1/settings/providers/openai/models")
    assert KEY not in models.text
    with Session(engine) as db:
        session = db.scalar(select(AuthSession))
        other = Workspace(name="Other")
        db.add(other)
        db.flush()
        db.add(Membership(user_id=session.user_id, workspace_id=other.id))
        session.workspace_id = other.id
        db.commit()
    assert not any(
        row["credential_present"]
        for row in browser.get("/api/v1/settings/providers").json()["items"]
    )
    assert browser.post("/api/v1/settings/providers/openai/health-check").status_code == 409


@pytest.mark.skipif(not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL")
def test_all_provider_headers_quota_and_validation(provider_app):
    browser, engine, vault, requests, upstream, body = provider_app
    for provider in ["anthropic", "openrouter", "elevenlabs"]:
        assert (
            browser.put(
                f"/api/v1/settings/providers/{provider}/credential", json={"api_key": KEY}
            ).status_code
            == 200
        )
        payload = {
            "anthropic": {"data": []},
            "openrouter": {"data": {"limit_remaining": 12.5}},
            "elevenlabs": {"tier": "starter", "character_limit": 100, "character_count": 20},
        }[provider]
        upstream.update(status=200, body=payload)
        assert browser.post(f"/api/v1/settings/providers/{provider}/health-check").json()["ok"]
    assert requests[0].headers["anthropic-version"] == "2023-06-01"
    assert requests[-1].headers["xi-api-key"] == KEY
    rows = {
        row["provider"]: row for row in browser.get("/api/v1/settings/providers").json()["items"]
    }
    assert rows["openrouter"]["usage"]["remaining"] == 12.5
    assert rows["elevenlabs"]["usage"]["remaining"] == 80
    assert rows["anthropic"]["usage"] == {"available": False}
    for invalid in [
        {"api_key": "short"},
        {"api_key": KEY, "url": "https://evil.test"},
        {"api_key": KEY + "\r\n"},
    ]:
        response = browser.put("/api/v1/settings/providers/openai/credential", json=invalid)
        assert response.status_code == 422 and KEY not in response.text


@pytest.mark.skipif(not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL")
def test_failed_rotation_cleans_new_file_and_preserves_previous(provider_app, monkeypatch):
    browser, engine, vault, requests, upstream, body = provider_app
    assert (
        browser.put(
            "/api/v1/settings/providers/openai/credential", json={"api_key": KEY}
        ).status_code
        == 200
    )
    before = set(vault.root.iterdir())
    original = Session.commit

    def broken_commit(self):
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(Session, "commit", broken_commit)
    response = browser.put(
        "/api/v1/settings/providers/openai/credential", json={"api_key": KEY + "rotated"}
    )
    assert response.status_code == 500 and KEY not in response.text
    monkeypatch.setattr(Session, "commit", original)
    assert set(vault.root.iterdir()) == before
    with Session(engine) as db:
        row = db.scalar(select(ProviderConfig))
        assert vault.get_secret_for_server_use(row.secret_reference) == KEY


@pytest.mark.skipif(not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL")
def test_health_success_timestamp_survives_failure_and_disable_clears_default(provider_app):
    browser, engine, vault, requests, upstream, body = provider_app
    browser.put("/api/v1/settings/providers/openai/credential", json={"api_key": KEY})
    browser.patch("/api/v1/settings/providers/openai", json={"enabled": True})
    browser.patch("/api/v1/settings", json={"providers": {"default_producer": "openai"}})
    browser.post("/api/v1/settings/providers/openai/health-check")
    first = browser.get("/api/v1/settings/providers").json()["items"][0]
    upstream["status"] = 500
    browser.post("/api/v1/settings/providers/openai/health-check")
    failed = browser.get("/api/v1/settings/providers").json()["items"][0]
    assert failed["last_successful_health_check_at"] == first["last_successful_health_check_at"]
    assert failed["connection_status"] == "error"
    assert (
        browser.patch("/api/v1/settings/providers/openai", json={"enabled": False}).status_code
        == 200
    )
    assert browser.get("/api/v1/settings").json()["providers"]["default_producer"] is None


def test_secret_parent_symlink_rejected(store, tmp_path):
    vault, key_file = store
    alias = tmp_path / "alias"
    alias.symlink_to(vault.root, target_is_directory=True)
    with pytest.raises(SecretStoreError):
        EncryptedFileSecretStore(alias / "nested", key_file)


@pytest.mark.skipif(not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL")
def test_environment_bootstrap_preserves_dashboard_key(provider_app):
    import subprocess
    import sys

    browser, engine, vault, requests, upstream, body = provider_app
    browser.put("/api/v1/settings/providers/openai/credential", json={"api_key": KEY})
    environment = {
        **os.environ,
        "STUDIO_SECRET_ROOT": str(vault.root),
        "STUDIO_SECRET_KEY_FILE": str(vault.root.parent / "key"),
        "OPENAI_API_KEY": "env-only-should-not-replace",
        "ANTHROPIC_API_KEY": "env-only-imported-key",
    }
    result = subprocess.run(
        [
            sys.executable,
            "-m",
            "studio_api.provider_bootstrap",
            "--workspace-id",
            body["active_workspace_id"],
        ],
        env=environment,
        text=True,
        capture_output=True,
    )
    assert result.returncode == 0, result.stderr
    assert "env-only" not in result.stdout + result.stderr
    with Session(engine) as db:
        rows = {row.provider: row for row in db.scalars(select(ProviderConfig))}
        assert vault.get_secret_for_server_use(rows["openai"].secret_reference) == KEY
        assert (
            vault.get_secret_for_server_use(rows["anthropic"].secret_reference)
            == "env-only-imported-key"
        )
        assert rows["anthropic"].enabled is False
