"""Authenticated music generation requests and immutable version history."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from studio_api.auth import fail
from studio_api.domain_models import Generation, GenerationVersion, ProductionPlan, Song
from studio_api.domain_routes import DB, Auth, Limit, Offset, public, scoped
from studio_api.job_service import create_music_generation
from studio_api.models import WorkspaceSettings
from studio_api.music import (
    CreateGenerationInput,
    MusicGenerationJobInput,
    ProductionPlanData,
    ReviewGenerationVersionInput,
    music_prompt,
)
from studio_api.provider_http import CATALOGS
from studio_api.provider_routes import config_row

router = APIRouter(prefix="/api/v1")
GENERATION_FIELDS = ("id", "song_id", "plan_id", "provider", "model", "settings", "created_at")
VERSION_FIELDS = (
    "id",
    "generation_id",
    "version",
    "asset_id",
    "approved",
    "rejected",
    "favorite",
    "notes",
    "provider_request_id",
    "generation_metadata",
    "created_at",
)


def generation_public(row: Generation) -> dict:
    return public(row, GENERATION_FIELDS)


def version_public(row: GenerationVersion) -> dict:
    result = public(row, VERSION_FIELDS)
    result["metadata"] = result.pop("generation_metadata")
    return result


@router.get("/songs/{song_id}/generations")
def list_generations(
    song_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0
) -> dict:
    scoped(db, Song, song_id, auth.workspace_id)
    rows = db.scalars(
        select(Generation)
        .where(Generation.song_id == song_id, Generation.workspace_id == auth.workspace_id)
        .order_by(Generation.created_at.desc(), Generation.id)
        .limit(limit)
        .offset(offset)
    )
    return {"items": [generation_public(row) for row in rows]}


@router.get("/generations/{generation_id}/versions")
def list_versions(
    generation_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0
) -> dict:
    scoped(db, Generation, generation_id, auth.workspace_id)
    rows = db.scalars(
        select(GenerationVersion)
        .where(
            GenerationVersion.generation_id == generation_id,
            GenerationVersion.workspace_id == auth.workspace_id,
        )
        .order_by(GenerationVersion.version)
        .limit(limit)
        .offset(offset)
    )
    return {"items": [version_public(row) for row in rows]}


@router.patch("/generation-versions/{version_id}")
def review_version(
    version_id: UUID, data: ReviewGenerationVersionInput, auth: Auth, db: DB
) -> dict:
    row = scoped(db, GenerationVersion, version_id, auth.workspace_id)
    if row.asset_id is None:
        raise fail(409, "version_not_ready", "Generated audio is not ready for review")
    if data.approved is True and data.rejected is True:
        raise fail(422, "invalid_review", "A version cannot be approved and rejected")
    for field, value in data.model_dump(exclude_none=True).items():
        setattr(row, field, value.strip() if field == "notes" else value)
    if data.approved is True:
        row.rejected = False
    elif data.rejected is True:
        row.approved = False
    db.commit()
    return version_public(row)


@router.post("/songs/{song_id}/generations", status_code=202)
def create_generation(song_id: UUID, data: CreateGenerationInput, auth: Auth, db: DB) -> dict:
    song = scoped(db, Song, song_id, auth.workspace_id)
    plan = db.scalar(
        select(ProductionPlan)
        .where(
            ProductionPlan.song_id == song.id,
            ProductionPlan.workspace_id == auth.workspace_id,
            ProductionPlan.active,
        )
        .with_for_update()
    )
    if plan is None:
        raise fail(
            409, "production_plan_required", "Create a production plan before generating music"
        )
    settings = db.get(WorkspaceSettings, auth.workspace_id)
    provider = data.provider or settings.document["providers"]["default_music"]
    if provider != "elevenlabs":
        raise fail(
            409, "music_provider_not_configured", "Choose an enabled music provider in Settings"
        )
    configured = config_row(db, auth.workspace_id, provider)
    if configured is None or not configured.enabled or not configured.secret_reference:
        raise fail(
            409, "music_provider_not_configured", "Selected music provider is not configured"
        )
    model = data.model or configured.default_model or CATALOGS[provider][0]["id"]
    duration = data.duration_seconds or song.target_duration_seconds or 180
    plan_data = ProductionPlanData.model_validate(plan.plan)
    inputs = MusicGenerationJobInput(
        generation_id=UUID(int=0),  # replaced after the durable generation row exists
        provider=provider,
        model=model,
        version_count=data.version_count,
        duration_seconds=duration,
        prompt=music_prompt(song, plan_data, data.prompt),
        force_instrumental=song.vocal_mode == "instrumental",
        composition_plan=plan.plan,
    )
    try:
        generation, job = create_music_generation(
            db, auth.workspace_id, song.project_id, song.id, plan.id, data.idempotency_key, inputs
        )
    except ValueError:
        raise fail(
            409, "idempotency_conflict", "Idempotency key belongs to another request"
        ) from None
    return {"generation_id": generation.id, "job_id": job.id, "state": job.state}
