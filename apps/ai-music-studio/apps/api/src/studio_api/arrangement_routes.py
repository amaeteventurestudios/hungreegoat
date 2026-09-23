"""Immutable, optimistic-concurrency arrangement revisions."""

from uuid import UUID

from fastapi import APIRouter
from sqlalchemy import select

from studio_api.arrangement import CreateArrangementRevision
from studio_api.auth import fail
from studio_api.domain_models import Arrangement, GenerationVersion
from studio_api.domain_routes import DB, Auth, Limit, Offset, public, scoped

router = APIRouter(prefix="/api/v1")
FIELDS = ("id", "version_id", "revision", "asset_id", "sections", "created_at")


@router.get("/generation-versions/{version_id}/arrangements")
def list_arrangements(
    version_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0
) -> dict:
    scoped(db, GenerationVersion, version_id, auth.workspace_id)
    rows = db.scalars(
        select(Arrangement)
        .where(Arrangement.version_id == version_id, Arrangement.workspace_id == auth.workspace_id)
        .order_by(Arrangement.revision.desc())
        .limit(limit)
        .offset(offset)
    )
    return {"items": [public(row, FIELDS) for row in rows]}


@router.post("/generation-versions/{version_id}/arrangements", status_code=201)
def create_arrangement(
    version_id: UUID, data: CreateArrangementRevision, auth: Auth, db: DB
) -> dict:
    version = db.scalar(
        select(GenerationVersion)
        .where(
            GenerationVersion.id == version_id, GenerationVersion.workspace_id == auth.workspace_id
        )
        .with_for_update()
    )
    if version is None:
        raise fail(404, "not_found", "Resource was not found")
    if version.asset_id is None or not version.approved:
        raise fail(409, "approved_version_required", "Approve a ready version before arranging")
    current = (
        db.scalar(
            select(Arrangement.revision)
            .where(
                Arrangement.version_id == version_id, Arrangement.workspace_id == auth.workspace_id
            )
            .order_by(Arrangement.revision.desc())
            .limit(1)
        )
        or 0
    )
    if current != data.base_revision:
        raise fail(409, "arrangement_conflict", "A newer arrangement revision exists; reload it")
    row = Arrangement(
        workspace_id=auth.workspace_id,
        project_id=version.project_id,
        version_id=version.id,
        revision=current + 1,
        asset_id=version.asset_id,
        sections=[section.model_dump() for section in data.sections],
    )
    db.add(row)
    db.commit()
    return public(row, FIELDS)
