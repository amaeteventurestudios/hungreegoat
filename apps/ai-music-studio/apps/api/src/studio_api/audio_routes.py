"""Workspace-scoped audio analysis requests and stored measurements."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from studio_api.audio import ANALYZER_VERSION, CreateAnalysisInput, CreateTempoInput, TempoJobInput
from studio_api.auth import fail
from studio_api.domain_models import AudioAnalysis, AudioAsset, TempoVersion
from studio_api.domain_routes import DB, Auth, Limit, Offset, public, scoped
from studio_api.job_service import create_audio_analysis, create_tempo_variant

router = APIRouter(prefix="/api/v1")
FIELDS = (
    "id",
    "asset_id",
    "analyzer_version",
    "detected_bpm",
    "musical_key",
    "measurements",
    "created_at",
)


@router.get("/assets/{asset_id}/analysis")
def list_analysis(
    asset_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0
) -> dict:
    scoped(db, AudioAsset, asset_id, auth.workspace_id)
    rows = db.scalars(
        select(AudioAnalysis)
        .where(AudioAnalysis.asset_id == asset_id, AudioAnalysis.workspace_id == auth.workspace_id)
        .order_by(AudioAnalysis.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return {"items": [public(row, FIELDS) for row in rows]}


@router.post("/assets/{asset_id}/analysis", status_code=202)
def request_analysis(asset_id: UUID, data: CreateAnalysisInput, auth: Auth, db: DB) -> dict:
    asset = scoped(db, AudioAsset, asset_id, auth.workspace_id)
    if asset.duration_seconds > 600:
        raise fail(422, "source_too_long", "Analysis is limited to ten-minute audio assets")
    try:
        job = create_audio_analysis(db, asset, data.idempotency_key)
    except ValueError:
        raise fail(409, "idempotency_conflict", "This request key belongs to another job") from None
    return {"job_id": job.id, "state": job.state, "analyzer_version": ANALYZER_VERSION}


@router.get("/assets/{asset_id}/tempo-versions")
def list_tempo_versions(
    asset_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0
) -> dict:
    scoped(db, AudioAsset, asset_id, auth.workspace_id)
    rows = db.scalars(
        select(TempoVersion)
        .where(
            TempoVersion.source_asset_id == asset_id, TempoVersion.workspace_id == auth.workspace_id
        )
        .order_by(TempoVersion.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    fields = (
        "id",
        "source_asset_id",
        "asset_id",
        "ratio",
        "pitch_semitones",
        "preserve_pitch",
        "created_at",
    )
    return {"items": [public(row, fields) for row in rows]}


@router.post("/assets/{asset_id}/tempo-versions", status_code=202)
def request_tempo_version(asset_id: UUID, data: CreateTempoInput, auth: Auth, db: DB) -> dict:
    asset = scoped(db, AudioAsset, asset_id, auth.workspace_id)
    if asset.duration_seconds > 600:
        raise fail(422, "source_too_long", "Tempo processing is limited to ten-minute audio assets")
    ratio = data.target_bpm / data.source_bpm
    if not 0.5 <= ratio <= 2 or asset.duration_seconds / ratio > 600:
        raise fail(422, "tempo_range", "Tempo change exceeds the supported range")
    if data.mode == "double_time" and abs(ratio - 2) > 0.001:
        raise fail(422, "tempo_mode_mismatch", "Double-time requires twice the source BPM")
    if data.mode == "half_time" and abs(ratio - 0.5) > 0.001:
        raise fail(422, "tempo_mode_mismatch", "Half-time requires half the source BPM")
    if abs(ratio - 1) < 0.001 and abs(data.pitch_semitones) < 0.001:
        raise fail(422, "no_transform", "Choose a tempo or pitch change")
    inputs = TempoJobInput(
        source_asset_id=asset.id,
        mode=data.mode,
        source_bpm=data.source_bpm,
        target_bpm=data.target_bpm,
        ratio=ratio,
        preserve_pitch=data.preserve_pitch,
        pitch_semitones=data.pitch_semitones,
        preserve_formants=data.preserve_formants,
        transients=data.transients,
    )
    try:
        job = create_tempo_variant(db, asset, data.idempotency_key, inputs)
    except ValueError:
        raise fail(409, "idempotency_conflict", "This request key belongs to another job") from None
    return {"job_id": job.id, "state": job.state}
