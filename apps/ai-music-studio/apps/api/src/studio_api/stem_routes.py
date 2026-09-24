"""Workspace-scoped stem sets and non-destructive mix versions."""

import math
from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from studio_api.auth import fail
from studio_api.domain_models import AudioAsset, MixVersion, Stem, StemSet
from studio_api.domain_routes import Auth, DB, Limit, Offset, public, scoped
from studio_api.job_service import create_mix, create_stem_set
from studio_api.stems import CreateMix, CreateStemSet, LABELS, MixInput

router = APIRouter(prefix="/api/v1")


def stem_set_public(db: DB, row: StemSet) -> dict:
    stems = db.scalars(select(Stem).where(Stem.stem_set_id == row.id, Stem.workspace_id == row.workspace_id).order_by(Stem.label)).all()
    return {**public(row, ("id", "source_asset_id", "engine", "engine_version", "created_at")), "stems": [public(stem, ("id", "label", "asset_id", "created_at")) for stem in stems]}


@router.get("/assets/{asset_id}/stem-sets")
def list_stem_sets(asset_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0) -> dict:
    scoped(db, AudioAsset, asset_id, auth.workspace_id)
    rows = db.scalars(select(StemSet).where(StemSet.source_asset_id == asset_id, StemSet.workspace_id == auth.workspace_id).order_by(StemSet.created_at.desc()).limit(limit).offset(offset))
    return {"items": [stem_set_public(db, row) for row in rows]}


@router.post("/assets/{asset_id}/stem-sets", status_code=202)
def request_stem_set(asset_id: UUID, data: CreateStemSet, auth: Auth, db: DB) -> dict:
    asset = scoped(db, AudioAsset, asset_id, auth.workspace_id)
    if asset.duration_seconds > 180:
        raise fail(422, "source_too_long", "CPU stem separation is limited to three-minute audio assets")
    try:
        stem_set, job = create_stem_set(db, asset, data.idempotency_key)
    except ValueError:
        raise fail(409, "idempotency_conflict", "This request key belongs to another job") from None
    return {"stem_set_id": stem_set.id, "job_id": job.id, "state": job.state}


@router.get("/stem-sets/{stem_set_id}")
def get_stem_set(stem_set_id: UUID, auth: Auth, db: DB) -> dict:
    return stem_set_public(db, scoped(db, StemSet, stem_set_id, auth.workspace_id))


@router.get("/stem-sets/{stem_set_id}/mix-versions")
def list_mix_versions(stem_set_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0) -> dict:
    scoped(db, StemSet, stem_set_id, auth.workspace_id)
    rows = db.scalars(select(MixVersion).where(MixVersion.stem_set_id == stem_set_id, MixVersion.workspace_id == auth.workspace_id).order_by(MixVersion.version.desc()).limit(limit).offset(offset))
    return {"items": [public(row, ("id", "stem_set_id", "asset_id", "version", "levels", "created_at")) for row in rows]}


@router.post("/stem-sets/{stem_set_id}/mix-versions", status_code=202)
def request_mix(stem_set_id: UUID, data: CreateMix, auth: Auth, db: DB) -> dict:
    stem_set = scoped(db, StemSet, stem_set_id, auth.workspace_id)
    stems = db.scalars(select(Stem).where(Stem.stem_set_id == stem_set.id, Stem.workspace_id == auth.workspace_id)).all()
    if {row.label for row in stems} != set(LABELS):
        raise fail(409, "stems_incomplete", "All four stems must be ready before mixing")
    if set(data.levels) != set(LABELS) or any(not math.isfinite(value) or not 0 <= value <= 2 for value in data.levels.values()):
        raise fail(422, "invalid_levels", "Each stem level must be between zero and two")
    source = scoped(db, AudioAsset, stem_set.source_asset_id, auth.workspace_id)
    inputs = MixInput(stem_set_id=stem_set.id, levels=data.levels)
    try:
        job = create_mix(db, stem_set, source.song_id, data.idempotency_key, inputs)
    except ValueError:
        raise fail(409, "idempotency_conflict", "This request key belongs to another job") from None
    return {"job_id": job.id, "state": job.state}
