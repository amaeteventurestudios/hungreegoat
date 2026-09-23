import logging
import re
from typing import Literal
from uuid import UUID

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import Field, SecretStr, field_validator
from sqlalchemy import select, text
from sqlalchemy.orm import Session

from studio_api.auth import fail, require_session
from studio_api.database import get_session
from studio_api.models import AuthSession, ProviderConfig, WorkspaceSettings, utcnow
from studio_api.provider_http import (
    CAPABILITIES,
    CATALOGS,
    PROVIDERS,
    ProviderFailure,
    check_health,
    get_provider_client,
    list_models,
)
from studio_api.schemas import StrictModel
from studio_api.secret_store import EncryptedFileSecretStore, SecretStore, SecretStoreError

router = APIRouter(prefix="/api/v1/settings/providers")
logger = logging.getLogger("studio.providers")
Provider = Literal["openai", "openrouter", "anthropic", "elevenlabs"]


class CredentialInput(StrictModel):
    api_key: SecretStr = Field(min_length=8, max_length=4096)

    @field_validator("api_key")
    @classmethod
    def valid_key(cls, value: SecretStr) -> SecretStr:
        raw = value.get_secret_value()
        if not raw.isascii() or any(
            character.isspace() or ord(character) < 33 for character in raw
        ):
            raise ValueError("Credential contains invalid characters")
        return value


class ProviderPatch(StrictModel):
    enabled: bool | None = None
    default_model: str | None = Field(default=None, max_length=160)

    @field_validator("default_model")
    @classmethod
    def valid_model(cls, value: str | None) -> str | None:
        if value is not None and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}", value):
            raise ValueError("Invalid model identifier")
        return value


def get_secret_store(request: Request) -> SecretStore:
    config = request.app.state.settings
    if config.secret_root is None or config.secret_key_file is None:
        raise fail(503, "secret_store_unavailable", "Credential storage is not configured")
    try:
        return EncryptedFileSecretStore(config.secret_root, config.secret_key_file)
    except SecretStoreError:
        raise fail(503, "secret_store_unavailable", "Credential storage is unavailable") from None


def config_row(
    db: Session, workspace_id: UUID, provider: str, lock: bool = False
) -> ProviderConfig | None:
    if lock:
        db.execute(
            text("SELECT pg_advisory_xact_lock(hashtext(:key))"),
            {"key": f"provider:{workspace_id}:{provider}"},
        )
    row = db.scalar(
        select(ProviderConfig).where(
            ProviderConfig.workspace_id == workspace_id, ProviderConfig.provider == provider
        )
    )
    if not row and lock:
        row = ProviderConfig(
            workspace_id=workspace_id, provider=provider, capabilities=CAPABILITIES[provider]
        )
        db.add(row)
        db.flush()
    return row


def public_config(provider: str, row: ProviderConfig | None) -> dict:
    present = row is not None and row.secret_reference is not None
    health = row.health_status if row else "unknown"
    connection = (
        "not_configured"
        if not present
        else (
            "connected" if health == "healthy" else "unverified" if health == "unknown" else "error"
        )
    )
    return {
        "provider": provider,
        "category": "music" if provider == "elevenlabs" else "producer",
        "enabled": row.enabled if row else False,
        "credential_present": present,
        "masked_secret": row.masked_secret if row else None,
        "connection_status": connection,
        "default_model": row.default_model if row else None,
        "capabilities": CAPABILITIES[provider],
        "health_status": health,
        "last_health_check_at": row.last_health_check_at if row else None,
        "last_successful_health_check_at": row.last_successful_health_check_at if row else None,
        "updated_at": row.updated_at if row else None,
        "usage": row.usage if row else {"available": False},
    }


def reset_health(row: ProviderConfig) -> None:
    row.health_status = "unknown"
    row.last_health_check_at = None
    row.last_successful_health_check_at = None
    row.usage = {"available": False}
    row.updated_at = utcnow()


def clear_default(db: Session, workspace_id: UUID, provider: str) -> None:
    settings = db.get(WorkspaceSettings, workspace_id, with_for_update=True)
    document = dict(settings.document)
    defaults = dict(document["providers"])
    for field, value in defaults.items():
        if value == provider:
            defaults[field] = None
    document["providers"] = defaults
    settings.document = document


@router.get("")
def providers(
    session: AuthSession = Depends(require_session), db: Session = Depends(get_session)
) -> dict:
    return {
        "items": [
            public_config(provider, config_row(db, session.workspace_id, provider))
            for provider in PROVIDERS
        ]
    }


@router.patch("/{provider}")
def update_provider(
    provider: Provider,
    patch: ProviderPatch,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_session),
) -> dict:
    row = config_row(db, session.workspace_id, provider, lock=True)
    if "enabled" in patch.model_fields_set:
        if patch.enabled is None:
            raise fail(422, "validation_error", "Enabled must be true or false")
        if patch.enabled and not row.secret_reference:
            raise fail(409, "provider_not_configured", "Add a credential before enabling")
        row.enabled = patch.enabled
        if not row.enabled:
            clear_default(db, session.workspace_id, provider)
    if "default_model" in patch.model_fields_set:
        row.default_model = patch.default_model
    row.updated_at = utcnow()
    db.commit()
    return public_config(provider, row)


@router.put("/{provider}/credential")
def replace_credential(
    provider: Provider,
    data: CredentialInput,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_session),
    store: SecretStore = Depends(get_secret_store),
) -> dict:
    row = config_row(db, session.workspace_id, provider, lock=True)
    old = row.secret_reference
    try:
        new = store.set_secret(data.api_key.get_secret_value())
    except SecretStoreError:
        raise fail(503, "secret_store_unavailable", "Unable to save credential") from None
    try:
        row.secret_reference = new
        row.masked_secret = "••••" + data.api_key.get_secret_value()[-4:]
        reset_health(row)
        db.commit()
    except Exception:
        db.rollback()
        store.delete_secret(new)
        raise
    if old:
        try:
            store.delete_secret(old)
        except SecretStoreError:
            logger.error("Retired credential cleanup failed")
            raise fail(
                503,
                "secret_cleanup_failed",
                "Credential saved; retired credential cleanup needs repair",
            ) from None
    return public_config(provider, row)


@router.delete("/{provider}/credential")
def delete_credential(
    provider: Provider,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_session),
    store: SecretStore = Depends(get_secret_store),
) -> dict:
    row = config_row(db, session.workspace_id, provider, lock=True)
    old = row.secret_reference
    row.secret_reference = None
    row.masked_secret = None
    row.enabled = False
    reset_health(row)
    clear_default(db, session.workspace_id, provider)
    db.commit()
    if old:
        try:
            store.delete_secret(old)
        except SecretStoreError:
            logger.error("Deleted credential cleanup failed")
            raise fail(
                503, "secret_cleanup_failed", "Provider disabled; credential cleanup needs repair"
            ) from None
    return public_config(provider, row)


def read_key(store: SecretStore, reference: str) -> str:
    try:
        return store.get_secret_for_server_use(reference)
    except SecretStoreError:
        raise fail(503, "secret_store_unavailable", "Stored credential is unavailable") from None


@router.post("/{provider}/health-check")
def health_check(
    provider: Provider,
    request: Request,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_session),
    client: httpx.Client = Depends(get_provider_client),
) -> dict:
    row = config_row(db, session.workspace_id, provider, lock=True)
    if not row.secret_reference:
        raise fail(409, "provider_not_configured", "Add a credential before testing")
    key = read_key(get_secret_store(request), row.secret_reference)
    now = utcnow()
    error_code = None
    message = "Credential accepted; generation access may require additional permissions"
    try:
        row.usage = check_health(client, provider, key)
        row.health_status = "healthy"
        row.last_successful_health_check_at = now
    except ProviderFailure as error:
        error_code, message = error.code, error.message
        row.health_status = error.status
        row.usage = {"available": False}
    row.last_health_check_at = now
    row.updated_at = now
    db.commit()
    return {
        "ok": error_code is None,
        "provider": provider,
        "health_status": row.health_status,
        "checked_at": now,
        "error_code": error_code,
        "message": message,
    }


@router.get("/{provider}/models")
def models(
    provider: Provider,
    request: Request,
    session: AuthSession = Depends(require_session),
    db: Session = Depends(get_session),
    client: httpx.Client = Depends(get_provider_client),
) -> dict:
    row = config_row(db, session.workspace_id, provider)
    key = (
        read_key(get_secret_store(request), row.secret_reference)
        if row and row.secret_reference
        else None
    )
    try:
        return list_models(client, provider, key)
    except ProviderFailure as error:
        return {"items": CATALOGS[provider], "source": "catalog", "error_code": error.code}
