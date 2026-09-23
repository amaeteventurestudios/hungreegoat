"""Authenticated producer-plan creation and immutable plan history."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from studio_api.auth import fail
from studio_api.domain_models import ProductionPlan, Song
from studio_api.domain_routes import DB, Auth, Limit, Offset, public, scoped
from studio_api.job_service import create_producer
from studio_api.models import WorkspaceSettings
from studio_api.producer import CreatePlanInput, ProducerJobInput
from studio_api.provider_http import CATALOGS
from studio_api.provider_routes import config_row

router = APIRouter(prefix="/api/v1")
PLAN_FIELDS = ("id", "song_id", "version", "provider", "model", "plan", "active", "created_at")


def plan_public(row: ProductionPlan) -> dict:
    return public(row, PLAN_FIELDS)


@router.get("/songs/{song_id}/production-plans")
def list_plans(song_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0) -> dict:
    scoped(db, Song, song_id, auth.workspace_id)
    rows = db.scalars(
        select(ProductionPlan)
        .where(ProductionPlan.song_id == song_id, ProductionPlan.workspace_id == auth.workspace_id)
        .order_by(ProductionPlan.version.desc())
        .limit(limit)
        .offset(offset)
    )
    return {"items": [plan_public(row) for row in rows]}


@router.post("/songs/{song_id}/production-plans", status_code=202)
def create_plan(song_id: UUID, data: CreatePlanInput, auth: Auth, db: DB) -> dict:
    song = scoped(db, Song, song_id, auth.workspace_id)
    settings = db.get(WorkspaceSettings, auth.workspace_id)
    default_provider = settings.document["providers"]["default_producer"]
    provider = data.provider or default_provider
    if provider not in {"openai", "openrouter", "anthropic"}:
        raise fail(409, "producer_not_configured", "Choose an enabled AI producer in Settings")
    configured = config_row(db, auth.workspace_id, provider)
    if configured is None or not configured.enabled or not configured.secret_reference:
        raise fail(409, "producer_not_configured", "Selected AI producer is not configured")
    model = data.model or configured.default_model or CATALOGS[provider][0]["id"]
    previous = db.scalar(
        select(ProductionPlan)
        .where(
            ProductionPlan.song_id == song.id,
            ProductionPlan.workspace_id == auth.workspace_id,
            ProductionPlan.active,
        )
        .with_for_update()
    )
    inputs = ProducerJobInput(
        provider=provider,
        model=model,
        instructions=data.instructions,
        title=song.title,
        brief=song.brief,
        notes=song.notes,
        tags=song.tags,
        bpm=song.bpm,
        musical_key=song.musical_key,
        style=song.style,
        vocal_mode=song.vocal_mode,
        target_duration_seconds=song.target_duration_seconds,
        previous_plan=previous.plan if previous else None,
    )
    try:
        job = create_producer(
            db, auth.workspace_id, song.project_id, song.id, data.idempotency_key, inputs
        )
    except ValueError:
        raise fail(
            409, "idempotency_conflict", "Idempotency key belongs to another request"
        ) from None
    return {"job_id": job.id, "state": job.state}
