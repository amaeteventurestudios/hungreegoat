"""Workspace-scoped delivery APIs for immutable stem ZIP packages."""

from uuid import UUID

from fastapi import APIRouter, Request
from fastapi.responses import FileResponse
from sqlalchemy import select

from studio_api.auth import fail
from studio_api.domain_models import Stem, StemPackage, StemSet
from studio_api.domain_routes import DB, Auth, Limit, Offset, public, scoped, storage
from studio_api.job_service import create_stem_package_job
from studio_api.schemas import StrictModel
from studio_api.stems import LABELS
from studio_api.storage import StorageError

router = APIRouter(prefix="/api/v1")
PACKAGE_FIELDS = ("id", "stem_set_id", "byte_size", "sha256", "manifest", "created_at")


class CreateStemPackage(StrictModel):
    idempotency_key: UUID


@router.get("/stem-sets/{stem_set_id}/exports")
def list_stem_packages(
    stem_set_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0
) -> dict:
    scoped(db, StemSet, stem_set_id, auth.workspace_id)
    rows = db.scalars(
        select(StemPackage)
        .where(
            StemPackage.stem_set_id == stem_set_id,
            StemPackage.workspace_id == auth.workspace_id,
        )
        .order_by(StemPackage.created_at.desc(), StemPackage.id)
        .limit(limit)
        .offset(offset)
    )
    return {"items": [public(row, PACKAGE_FIELDS) for row in rows]}


@router.post("/stem-sets/{stem_set_id}/exports", status_code=202)
def request_stem_package(stem_set_id: UUID, data: CreateStemPackage, auth: Auth, db: DB) -> dict:
    stem_set = scoped(db, StemSet, stem_set_id, auth.workspace_id)
    stems = db.scalars(
        select(Stem).where(
            Stem.stem_set_id == stem_set.id,
            Stem.workspace_id == auth.workspace_id,
        )
    ).all()
    if {row.label for row in stems} != set(LABELS):
        raise fail(409, "stems_incomplete", "All four stems must be ready before packaging")
    try:
        job = create_stem_package_job(db, stem_set, data.idempotency_key)
    except ValueError:
        raise fail(409, "idempotency_conflict", "This request key belongs to another job") from None
    return {"job_id": job.id, "state": job.state}


@router.get("/stem-packages/{package_id}/download")
def download_stem_package(package_id: UUID, request: Request, auth: Auth, db: DB) -> FileResponse:
    package = scoped(db, StemPackage, package_id, auth.workspace_id)
    try:
        path = storage(request).path_for(package.storage_key)
        if not path.is_file():
            raise StorageError
    except (StorageError, OSError):
        raise fail(503, "package_unavailable", "Stem package is unavailable") from None
    return FileResponse(
        path,
        media_type="application/zip",
        filename=f"stem-package-{package.id}.zip",
        content_disposition_type="attachment",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )
