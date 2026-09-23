import importlib.util
import shutil

from fastapi import APIRouter, Depends, Request
from pydantic import ValidationError
from sqlalchemy.orm import Session

from studio_api.auth import fail, require_session
from studio_api.database import get_session
from studio_api.models import AuthSession, Workspace, WorkspaceSettings
from studio_api.schemas import SettingsDocument

router = APIRouter(prefix="/api/v1/settings")


@router.get("")
def read_settings(
    session: AuthSession = Depends(require_session), db: Session = Depends(get_session)
) -> SettingsDocument:
    row = db.get(WorkspaceSettings, session.workspace_id)
    return SettingsDocument.model_validate(row.document)


@router.patch("")
def update_settings(
    patch: dict, session: AuthSession = Depends(require_session), db: Session = Depends(get_session)
) -> SettingsDocument:
    row = db.get(WorkspaceSettings, session.workspace_id, with_for_update=True)
    merged = dict(row.document)
    for key, value in patch.items():
        if key not in merged or not isinstance(value, dict):
            raise fail(422, "validation_error", "Invalid settings section")
        merged[key] = {**merged[key], **value}
    try:
        document = SettingsDocument.model_validate(merged)
    except ValidationError:
        raise fail(422, "validation_error", "Invalid settings values") from None
    from studio_api.provider_routes import config_row

    for provider in document.providers.model_dump().values():
        if provider is not None:
            configured = config_row(db, session.workspace_id, provider)
            if configured is None or not configured.enabled or not configured.secret_reference:
                raise fail(
                    422,
                    "provider_not_configured",
                    "Default provider must be configured and enabled",
                )
    row.document = document.model_dump()
    db.get(Workspace, session.workspace_id).name = document.workspace.name
    db.commit()
    return document


@router.get("/system")
def system_status(request: Request, session: AuthSession = Depends(require_session)) -> dict:
    root = request.app.state.settings.asset_root
    try:
        usage = shutil.disk_usage(root)
        storage = {"available": True, "total_bytes": usage.total, "free_bytes": usage.free}
    except OSError:
        storage = {"available": False, "total_bytes": None, "free_bytes": None}
    detected = [
        ("rubberband", "Rubber Band", shutil.which("rubberband") is not None),
        ("demucs", "Demucs", importlib.util.find_spec("demucs") is not None),
        ("matchering", "Matchering", importlib.util.find_spec("matchering") is not None),
    ]
    return {
        "storage": storage,
        "engines": [
            {
                "id": id,
                "name": name,
                "available": available,
                "status": "available" if available else "not_installed",
            }
            for id, name, available in detected
        ],
    }
