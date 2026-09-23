from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError
from sqlalchemy import or_, select
from sqlalchemy.orm import Session
from starlette.datastructures import UploadFile as FormUploadFile

from studio_api.auth import fail, require_session
from studio_api.database import get_session
from studio_api.domain_models import AssetLineage, AudioAsset, Job, Project, Song
from studio_api.domain_schemas import ProjectInput, SongInput
from studio_api.models import AuthSession, utcnow
from studio_api.storage import (
    InvalidMedia,
    LocalStorageProvider,
    StorageError,
    UploadTooLarge,
    probe_audio,
    safe_filename,
)

router = APIRouter(prefix="/api/v1")
Limit = Annotated[int, Query(ge=1, le=100)]
Offset = Annotated[int, Query(ge=0)]
Auth = Annotated[AuthSession, Depends(require_session)]
DB = Annotated[Session, Depends(get_session)]
PROJECT_FIELDS = ("id", "name", "description", "tags", "created_at", "updated_at")
SONG_FIELDS = (
    "id",
    "project_id",
    "title",
    "brief",
    "notes",
    "tags",
    "bpm",
    "musical_key",
    "style",
    "vocal_mode",
    "target_duration_seconds",
    "created_at",
    "updated_at",
)
ASSET_FIELDS = (
    "id",
    "project_id",
    "song_id",
    "kind",
    "original_filename",
    "media_type",
    "byte_size",
    "sha256",
    "duration_seconds",
    "sample_rate",
    "channels",
    "created_at",
)
JOB_FIELDS = (
    "id",
    "project_id",
    "song_id",
    "kind",
    "state",
    "progress_percent",
    "current_stage",
    "error_code",
    "error_message",
    "result_asset_id",
    "created_at",
    "updated_at",
    "started_at",
    "completed_at",
)


def public(row, fields: tuple[str, ...]) -> dict:
    return {field: getattr(row, field) for field in fields}


def scoped(db: Session, model, id: UUID, workspace_id: UUID):
    row = db.scalar(select(model).where(model.id == id, model.workspace_id == workspace_id))
    if row is None:
        raise fail(404, "not_found", "Resource was not found")
    return row


def storage(request: Request) -> LocalStorageProvider:
    try:
        return LocalStorageProvider(request.app.state.settings.asset_root)
    except (StorageError, OSError):
        raise fail(503, "storage_unavailable", "Asset storage is unavailable") from None


@router.get("/projects")
def list_projects(
    auth: Auth,
    db: DB,
    limit: Limit = 50,
    offset: Offset = 0,
    q: str = Query(default="", max_length=120),
) -> dict:
    query = select(Project).where(Project.workspace_id == auth.workspace_id)
    if q:
        query = query.where(Project.name.icontains(q, autoescape=True))
    return {
        "items": [
            public(row, PROJECT_FIELDS)
            for row in db.scalars(
                query.order_by(Project.updated_at.desc(), Project.id).limit(limit).offset(offset)
            )
        ]
    }


@router.post("/projects", status_code=201)
def create_project(data: ProjectInput, auth: Auth, db: DB) -> dict:
    row = Project(workspace_id=auth.workspace_id, **data.model_dump())
    db.add(row)
    db.commit()
    return public(row, PROJECT_FIELDS)


@router.get("/projects/{project_id}")
def get_project(project_id: UUID, auth: Auth, db: DB) -> dict:
    return public(scoped(db, Project, project_id, auth.workspace_id), PROJECT_FIELDS)


@router.patch("/projects/{project_id}")
def update_project(project_id: UUID, patch: dict, auth: Auth, db: DB) -> dict:
    row = scoped(db, Project, project_id, auth.workspace_id)
    try:
        data = ProjectInput.model_validate(
            {**{key: getattr(row, key) for key in ProjectInput.model_fields}, **patch}
        )
    except ValidationError:
        raise fail(422, "validation_error", "Invalid project values") from None
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    row.updated_at = utcnow()
    db.commit()
    return public(row, PROJECT_FIELDS)


@router.get("/projects/{project_id}/songs")
def list_songs(
    project_id: UUID,
    auth: Auth,
    db: DB,
    limit: Limit = 50,
    offset: Offset = 0,
    q: str = Query(default="", max_length=120),
) -> dict:
    scoped(db, Project, project_id, auth.workspace_id)
    query = select(Song).where(
        Song.project_id == project_id, Song.workspace_id == auth.workspace_id
    )
    if q:
        query = query.where(Song.title.icontains(q, autoescape=True))
    return {
        "items": [
            public(row, SONG_FIELDS)
            for row in db.scalars(
                query.order_by(Song.updated_at.desc(), Song.id).limit(limit).offset(offset)
            )
        ]
    }


@router.post("/projects/{project_id}/songs", status_code=201)
def create_song(project_id: UUID, data: SongInput, auth: Auth, db: DB) -> dict:
    scoped(db, Project, project_id, auth.workspace_id)
    row = Song(workspace_id=auth.workspace_id, project_id=project_id, **data.model_dump())
    db.add(row)
    db.commit()
    return public(row, SONG_FIELDS)


@router.get("/songs/{song_id}")
def get_song(song_id: UUID, auth: Auth, db: DB) -> dict:
    return public(scoped(db, Song, song_id, auth.workspace_id), SONG_FIELDS)


@router.patch("/songs/{song_id}")
def update_song(song_id: UUID, patch: dict, auth: Auth, db: DB) -> dict:
    row = scoped(db, Song, song_id, auth.workspace_id)
    try:
        data = SongInput.model_validate(
            {**{key: getattr(row, key) for key in SongInput.model_fields}, **patch}
        )
    except ValidationError:
        raise fail(422, "validation_error", "Invalid song values") from None
    for key, value in data.model_dump().items():
        setattr(row, key, value)
    row.updated_at = utcnow()
    db.commit()
    return public(row, SONG_FIELDS)


@router.get("/assets")
def list_assets(
    auth: Auth,
    db: DB,
    project_id: UUID | None = None,
    song_id: UUID | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> dict:
    query = select(AudioAsset).where(AudioAsset.workspace_id == auth.workspace_id)
    if project_id:
        scoped(db, Project, project_id, auth.workspace_id)
        query = query.where(AudioAsset.project_id == project_id)
    if song_id:
        scoped(db, Song, song_id, auth.workspace_id)
        query = query.where(AudioAsset.song_id == song_id)
    return {
        "items": [
            public(row, ASSET_FIELDS)
            for row in db.scalars(
                query.order_by(AudioAsset.created_at.desc(), AudioAsset.id)
                .limit(limit)
                .offset(offset)
            )
        ]
    }


@router.get("/projects/{project_id}/assets")
def project_assets(
    project_id: UUID,
    auth: Auth,
    db: DB,
    song_id: UUID | None = None,
    limit: Limit = 50,
    offset: Offset = 0,
) -> dict:
    return list_assets(auth, db, project_id, song_id, limit, offset)


@router.post("/projects/{project_id}/assets/upload", status_code=201)
def upload_asset(
    project_id: UUID,
    request: Request,
    auth: Auth,
    db: DB,
    file: Annotated[UploadFile, File()],
    song_id: Annotated[UUID | None, Form()] = None,
) -> dict:
    scoped(db, Project, project_id, auth.workspace_id)
    if song_id:
        song = scoped(db, Song, song_id, auth.workspace_id)
        if song.project_id != project_id:
            raise fail(422, "invalid_song", "Song does not belong to this project")
    form = request._form
    if (
        form is None
        or sum(isinstance(value, FormUploadFile) for _, value in form.multi_items()) != 1
    ):
        raise fail(422, "invalid_upload", "Upload exactly one audio file")
    if any(name not in {"file", "song_id"} for name in form):
        raise fail(422, "invalid_upload", "Unsupported upload field")
    store = storage(request)
    key = None
    committed = False
    try:
        key, size, digest = store.save_upload(file.file)
        media = probe_audio(store.path_for(key))
        row = AudioAsset(
            workspace_id=auth.workspace_id,
            project_id=project_id,
            song_id=song_id,
            kind="source",
            original_filename=safe_filename(file.filename),
            storage_key=key,
            byte_size=size,
            sha256=digest,
            **media,
        )
        db.add(row)
        db.commit()
        committed = True
        return public(row, ASSET_FIELDS)
    except UploadTooLarge:
        raise fail(413, "upload_too_large", "Audio file exceeds 100 MiB") from None
    except InvalidMedia as error:
        raise fail(422, "invalid_media", str(error)) from None
    except (StorageError, OSError):
        raise fail(
            503, "storage_unavailable", "Audio storage or validation is unavailable"
        ) from None
    finally:
        if not committed:
            db.rollback()
            if key:
                store.delete_uncommitted(key)
        file.file.close()


@router.get("/assets/{asset_id}")
def get_asset(asset_id: UUID, auth: Auth, db: DB) -> dict:
    return public(scoped(db, AudioAsset, asset_id, auth.workspace_id), ASSET_FIELDS)


def asset_file(
    asset_id: UUID, request: Request, auth: AuthSession, db: Session, download: bool
) -> FileResponse:
    row = scoped(db, AudioAsset, asset_id, auth.workspace_id)
    try:
        path = storage(request).path_for(row.storage_key)
        if not path.is_file():
            raise StorageError
    except (StorageError, OSError):
        raise fail(503, "asset_unavailable", "Audio asset is unavailable") from None
    return FileResponse(
        path,
        media_type=row.media_type,
        filename=row.original_filename,
        content_disposition_type="attachment" if download else "inline",
        headers={"Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff"},
    )


@router.get("/assets/{asset_id}/stream")
def stream_asset(asset_id: UUID, request: Request, auth: Auth, db: DB) -> FileResponse:
    return asset_file(asset_id, request, auth, db, False)


@router.get("/assets/{asset_id}/download")
def download_asset(asset_id: UUID, request: Request, auth: Auth, db: DB) -> FileResponse:
    return asset_file(asset_id, request, auth, db, True)


@router.get("/assets/{asset_id}/lineage")
def asset_lineage(
    asset_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0
) -> dict:
    scoped(db, AudioAsset, asset_id, auth.workspace_id)
    query = select(AssetLineage).where(
        AssetLineage.workspace_id == auth.workspace_id,
        or_(AssetLineage.parent_asset_id == asset_id, AssetLineage.child_asset_id == asset_id),
    )
    return {
        "items": [
            public(
                row,
                (
                    "id",
                    "parent_asset_id",
                    "child_asset_id",
                    "operation",
                    "parameters",
                    "created_at",
                ),
            )
            for row in db.scalars(
                query.order_by(AssetLineage.created_at, AssetLineage.id).limit(limit).offset(offset)
            )
        ]
    }


@router.get("/jobs/{job_id}")
def get_job(job_id: UUID, auth: Auth, db: DB) -> dict:
    from studio_api.job_routes import job_public

    return job_public(scoped(db, Job, job_id, auth.workspace_id))


@router.get("/projects/{project_id}/jobs")
def list_jobs(project_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0) -> dict:
    from studio_api.job_routes import job_public

    scoped(db, Project, project_id, auth.workspace_id)
    query = select(Job).where(Job.project_id == project_id, Job.workspace_id == auth.workspace_id)
    return {
        "items": [
            job_public(row)
            for row in db.scalars(
                query.order_by(Job.created_at.desc(), Job.id).limit(limit).offset(offset)
            )
        ]
    }
