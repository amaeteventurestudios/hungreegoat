"""Workspace-scoped, non-destructive mastering and audio exports."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from studio_api.auth import fail
from studio_api.domain_models import AudioAsset, Export, Master
from studio_api.domain_routes import DB, Auth, Limit, Offset, public, scoped
from studio_api.job_service import create_export, create_master
from studio_api.mastering import CreateExport, CreateMaster, ExportInput, MasterInput

router = APIRouter(prefix="/api/v1")


@router.get("/assets/{asset_id}/masters")
def list_masters(asset_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0) -> dict:
    scoped(db, AudioAsset, asset_id, auth.workspace_id)
    rows = db.scalars(
        select(Master)
        .where(Master.source_asset_id == asset_id, Master.workspace_id == auth.workspace_id)
        .order_by(Master.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return {
        "items": [
            public(
                row,
                (
                    "id",
                    "source_asset_id",
                    "reference_asset_id",
                    "asset_id",
                    "engine",
                    "settings",
                    "created_at",
                ),
            )
            for row in rows
        ]
    }


@router.post("/assets/{asset_id}/masters", status_code=202)
def request_master(asset_id: UUID, data: CreateMaster, auth: Auth, db: DB) -> dict:
    source = scoped(db, AudioAsset, asset_id, auth.workspace_id)
    if source.duration_seconds > 600 or source.channels > 2:
        raise fail(
            422,
            "unsupported_source",
            "Mastering requires audio no longer than ten minutes and at most two channels",
        )
    reference = (
        scoped(db, AudioAsset, data.reference_asset_id, auth.workspace_id)
        if data.reference_asset_id
        else None
    )
    if reference and (
        reference.project_id != source.project_id
        or reference.id == source.id
        or reference.duration_seconds > 600
        or reference.channels > 2
    ):
        raise fail(
            422,
            "invalid_reference",
            "Reference must be another supported asset in the same project",
        )
    inputs = MasterInput(
        source_asset_id=source.id,
        reference_asset_id=reference.id if reference else None,
        target_lufs=data.target_lufs,
        true_peak_dbtp=data.true_peak_dbtp,
        engine="matchering" if reference else "ffmpeg-loudnorm",
    )
    try:
        job = create_master(db, source, data.idempotency_key, inputs)
    except ValueError:
        raise fail(409, "idempotency_conflict", "This request key belongs to another job") from None
    return {"job_id": job.id, "state": job.state}


@router.get("/assets/{asset_id}/exports")
def list_exports(asset_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0) -> dict:
    scoped(db, AudioAsset, asset_id, auth.workspace_id)
    rows = db.scalars(
        select(Export)
        .where(Export.source_asset_id == asset_id, Export.workspace_id == auth.workspace_id)
        .order_by(Export.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return {
        "items": [
            public(row, ("id", "source_asset_id", "asset_id", "format", "settings", "created_at"))
            for row in rows
        ]
    }


@router.post("/assets/{asset_id}/exports", status_code=202)
def request_export(asset_id: UUID, data: CreateExport, auth: Auth, db: DB) -> dict:
    source = scoped(db, AudioAsset, asset_id, auth.workspace_id)
    if source.duration_seconds > 600 or source.channels > 2:
        raise fail(
            422,
            "unsupported_source",
            "Export requires audio no longer than ten minutes and at most two channels",
        )
    inputs = ExportInput(
        source_asset_id=source.id,
        format=data.format,
        bit_depth=data.bit_depth,
        mp3_bitrate_kbps=data.mp3_bitrate_kbps,
    )
    try:
        job = create_export(db, source, data.idempotency_key, inputs)
    except ValueError:
        raise fail(409, "idempotency_conflict", "This request key belongs to another job") from None
    return {"job_id": job.id, "state": job.state}
