import hashlib
import io
import secrets
from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field
from sqlalchemy import func, select

from studio_api.auth import fail
from studio_api.domain_models import (
    AudioAsset,
    Generation,
    GenerationVersion,
    Job,
    JobEvent,
    ProductionPlan,
    Project,
    Song,
)
from studio_api.domain_routes import DB, JOB_FIELDS, Auth, Limit, Offset, public, scoped, storage
from studio_api.job_service import (
    LEASE_SECONDS,
    TERMINAL,
    DiagnosticInput,
    add_attempt,
    current_attempt,
    event,
    lease_valid,
    locked_job,
    terminal,
)
from studio_api.models import utcnow
from studio_api.music import MusicGenerationJobInput, MusicGenerationResult
from studio_api.orchestration_client import OrchestrationError, private_value
from studio_api.producer import ProducerJobInput, ProducerResult
from studio_api.provider_routes import config_row, get_secret_store, read_key
from studio_api.schemas import StrictModel
from studio_api.storage import (
    InvalidMedia,
    StorageError,
    UploadTooLarge,
    probe_audio,
    safe_filename,
)

router = APIRouter(prefix="/api/v1")


def service_auth(request: Request) -> None:
    if getattr(request.state, "worker_authenticated", False):
        return
    try:
        expected = private_value(request.app.state.settings.worker_token_file)
    except OrchestrationError:
        raise fail(
            503, "worker_auth_unavailable", "Worker authentication is not configured"
        ) from None
    supplied = request.headers.get("authorization", "")
    if not supplied.startswith("Bearer ") or not secrets.compare_digest(
        hashlib.sha256(supplied[7:].encode()).digest(), hashlib.sha256(expected.encode()).digest()
    ):
        raise fail(401, "worker_unauthorized", "Worker authentication required")
    request.state.worker_authenticated = True


Service = Annotated[None, Depends(service_auth)]


def job_public(job: Job) -> dict:
    return {
        **public(job, JOB_FIELDS),
        "attempt": job.attempt,
        "cancel_requested": job.cancel_requested,
        "outcome_unknown": job.outcome_unknown,
        "can_cancel": job.state not in TERMINAL and not job.cancel_requested,
        "can_retry": job.state in {"failed", "cancelled"}
        and job.retry_eligible
        and not job.outcome_unknown,
    }


@router.get("/jobs")
def list_all_jobs(
    auth: Auth,
    db: DB,
    project_id: UUID | None = None,
    song_id: UUID | None = None,
    state: str | None = Query(
        default=None, pattern="^(pending|queued|running|succeeded|failed|cancelled)$"
    ),
    limit: Limit = 50,
    offset: Offset = 0,
) -> dict:
    query = select(Job).where(Job.workspace_id == auth.workspace_id)
    if project_id:
        scoped(db, Project, project_id, auth.workspace_id)
        query = query.where(Job.project_id == project_id)
    if song_id:
        scoped(db, Song, song_id, auth.workspace_id)
        query = query.where(Job.song_id == song_id)
    if state:
        query = query.where(Job.state == state)
    return {
        "items": [
            job_public(job)
            for job in db.scalars(
                query.order_by(Job.created_at.desc(), Job.id).limit(limit).offset(offset)
            )
        ]
    }


@router.get("/jobs/{job_id}/events")
def job_events(job_id: UUID, auth: Auth, db: DB, limit: Limit = 50, offset: Offset = 0) -> dict:
    scoped(db, Job, job_id, auth.workspace_id)
    rows = db.scalars(
        select(JobEvent)
        .where(JobEvent.job_id == job_id, JobEvent.workspace_id == auth.workspace_id)
        .order_by(JobEvent.sequence)
        .limit(limit)
        .offset(offset)
    )
    return {
        "items": [public(row, ("id", "sequence", "state", "message", "created_at")) for row in rows]
    }


@router.post("/jobs/{job_id}/retry", status_code=202)
def retry_job(job_id: UUID, auth: Auth, db: DB) -> dict:
    job = locked_job(db, job_id, auth.workspace_id)
    if not job_public(job)["can_retry"]:
        raise fail(409, "retry_unavailable", "This job cannot be safely retried")
    job.attempt += 1
    job.state = "pending"
    job.cancel_requested = False
    job.retry_eligible = False
    job.progress_percent = 0
    job.current_stage = None
    job.error_code = job.error_message = None
    job.started_at = job.completed_at = None
    job.updated_at = utcnow()
    add_attempt(db, job)
    event(db, job, "Retry queued")
    db.commit()
    return {"job_id": job.id, "state": job.state}


@router.post("/jobs/{job_id}/cancel", status_code=202)
def cancel_job(job_id: UUID, auth: Auth, db: DB) -> dict:
    job = locked_job(db, job_id, auth.workspace_id)
    if job.state in TERMINAL:
        raise fail(409, "cancel_unavailable", "Job has already finished")
    job.cancel_requested = True
    job.updated_at = utcnow()
    attempt = current_attempt(db, job, job.attempt)
    if job.state in {"pending", "queued"}:
        terminal(
            db,
            job,
            attempt,
            "cancelled",
            retryable=job.kind in {"system.verify", "producer.plan", "music.generate"},
        )
    else:
        event(db, job, "Cancellation requested")
    db.commit()
    return {"job_id": job.id, "state": job.state, "cancel_requested": True}


class ClaimInput(StrictModel):
    execution_id: UUID
    worker_id: str = Field(min_length=1, max_length=120)


class ProgressInput(StrictModel):
    progress_percent: int = Field(ge=0, le=99)
    current_stage: str = Field(min_length=1, max_length=120)


class CompleteInput(StrictModel):
    outputs: list[dict] = Field(default_factory=list, max_length=16)
    result: dict


class DiagnosticResult(StrictModel):
    diagnostic: bool
    sha256: str = Field(pattern="^[a-f0-9]{64}$")
    bytes: int = Field(ge=0, le=4000)


class FailInput(StrictModel):
    error_code: str = Field(min_length=1, max_length=64)
    message: str = Field(max_length=500)
    retryable: bool = False
    outcome_unknown: bool = False


INTERNAL = "/internal/jobs/{job_id}/attempts/{number}"


@router.post(INTERNAL + "/claim")
def claim(
    job_id: UUID, number: int, data: ClaimInput, request: Request, service: Service, db: DB
) -> dict:
    job = locked_job(db, job_id)
    attempt = current_attempt(db, job, number)
    if attempt.execution_id != data.execution_id:
        raise fail(409, "execution_mismatch", "Execution does not match the scheduled attempt")
    if job.state == "succeeded":
        return {"state": "succeeded", "result": attempt.result, "already_complete": True}
    if job.state == "cancelled" or job.cancel_requested:
        raise fail(409, "job_cancelled", "Job has been cancelled")
    if job.state in TERMINAL:
        raise fail(409, "job_terminal", "Job has already finished")
    if attempt.lease_expires_at and attempt.lease_expires_at > utcnow():
        raise fail(409, "lease_busy", "Another worker holds this attempt")
    token = secrets.token_urlsafe(32)
    attempt.lease_hash = hashlib.sha256(token.encode()).hexdigest()
    attempt.lease_expires_at = utcnow() + timedelta(seconds=LEASE_SECONDS)
    attempt.worker_id = data.worker_id
    attempt.state = job.state = "running"
    job.started_at = job.started_at or utcnow()
    job.updated_at = utcnow()
    event(db, job, "Worker claimed attempt")
    if job.kind == "system.verify":
        inputs = DiagnosticInput.model_validate(job.parameters).model_dump()
    elif job.kind == "producer.plan":
        inputs = ProducerJobInput.model_validate(job.parameters).model_dump(mode="json")
    elif job.kind == "music.generate":
        inputs = MusicGenerationJobInput.model_validate(job.parameters).model_dump(mode="json")
        inputs["completed_versions"] = [
            {
                "version": row.version,
                "asset_id": str(row.asset_id),
                "provider_request_id": row.provider_request_id,
            }
            for row in db.scalars(
                select(GenerationVersion)
                .where(
                    GenerationVersion.generation_id == inputs["generation_id"],
                    GenerationVersion.workspace_id == job.workspace_id,
                    GenerationVersion.asset_id.is_not(None),
                )
                .order_by(GenerationVersion.version)
            )
        ]
    else:
        raise fail(409, "unsupported_operation", "No worker handler is enabled for this job")
    db.commit()
    return {
        "job_id": job.id,
        "attempt": number,
        "execution_id": attempt.execution_id,
        "lease_token": token,
        "lease_expires_at": attempt.lease_expires_at,
        "kind": job.kind,
        "inputs": inputs,
        "input_assets": [],
        "cancel_requested": False,
        "progress_percent": job.progress_percent,
    }


def leased(db, job_id, number, request, terminal_ok=False):
    job = locked_job(db, job_id)
    attempt = current_attempt(db, job, number)
    lease_valid(
        attempt,
        request.headers.get("x-job-lease", ""),
        allow_expired=terminal_ok and job.state in TERMINAL,
    )
    return job, attempt


@router.post(INTERNAL + "/progress")
def progress(
    job_id: UUID, number: int, data: ProgressInput, request: Request, service: Service, db: DB
) -> dict:
    job, attempt = leased(db, job_id, number, request)
    if job.state in TERMINAL:
        raise fail(409, "job_terminal", "Job has already finished")
    if data.progress_percent < job.progress_percent:
        raise fail(409, "progress_regression", "Progress cannot decrease")
    # Stage names are normalized; arbitrary worker text is never public.
    stage = (
        data.current_stage
        if data.current_stage
        in {
            "starting",
            "verifying",
            "waiting",
            "hashing",
            "persisting",
            "generating",
            "uploading",
            "finishing",
        }
        else "working"
    )
    previous_progress = job.progress_percent
    previous_stage = job.current_stage
    if data.progress_percent > previous_progress or stage != previous_stage:
        job.progress_percent = data.progress_percent
        job.current_stage = stage
        # Progress is updated on every worker heartbeat, but immutable history is
        # intentionally compact.  Without this, a long-running task can hide its
        # terminal event behind a page of heartbeat noise.
        crossed_milestone = data.progress_percent // 5 > previous_progress // 5
        if stage != previous_stage or crossed_milestone:
            event(db, job, "Worker progress updated")
    job.updated_at = utcnow()
    attempt.lease_expires_at = utcnow() + timedelta(seconds=LEASE_SECONDS)
    db.commit()
    return {"cancel_requested": job.cancel_requested, "lease_expires_at": attempt.lease_expires_at}


@router.post(INTERNAL + "/complete")
def complete(
    job_id: UUID, number: int, data: CompleteInput, request: Request, service: Service, db: DB
) -> dict:
    job, attempt = leased(db, job_id, number, request, terminal_ok=True)
    if job.state == "succeeded":
        return {"state": job.state, "result_asset_id": job.result_asset_id, "output_asset_ids": []}
    if job.state in TERMINAL:
        raise fail(409, "job_terminal", "Job has already finished")
    if job.cancel_requested:
        terminal(
            db,
            job,
            attempt,
            "cancelled",
            retryable=job.kind in {"system.verify", "producer.plan", "music.generate"},
        )
    elif job.kind == "system.verify":
        if data.outputs:
            raise fail(422, "unsupported_operation", "This job does not accept output assets")
        try:
            result = DiagnosticResult.model_validate(data.result)
        except ValueError:
            raise fail(422, "invalid_result", "Invalid diagnostic result") from None
        payload = DiagnosticInput.model_validate(job.parameters).payload.encode()
        if (
            not result.diagnostic
            or result.sha256 != hashlib.sha256(payload).hexdigest()
            or result.bytes != len(payload)
        ):
            raise fail(422, "invalid_result", "Diagnostic verification did not match its input")
        attempt.result = result.model_dump()
        terminal(db, job, attempt, "succeeded")
    elif job.kind == "producer.plan":
        if data.outputs:
            raise fail(422, "unsupported_operation", "Production plans do not accept audio outputs")
        try:
            result = ProducerResult.model_validate(data.result)
            inputs = ProducerJobInput.model_validate(job.parameters)
        except ValueError:
            raise fail(422, "invalid_result", "Invalid production plan result") from None
        song = scoped(db, Song, job.song_id, job.workspace_id)
        active = db.scalar(
            select(ProductionPlan)
            .where(
                ProductionPlan.song_id == song.id,
                ProductionPlan.workspace_id == job.workspace_id,
                ProductionPlan.active,
            )
            .with_for_update()
        )
        version = (
            db.scalar(
                select(func.max(ProductionPlan.version)).where(
                    ProductionPlan.song_id == song.id,
                    ProductionPlan.workspace_id == job.workspace_id,
                )
            )
            or 0
        ) + 1
        if active:
            active.active = False
        plan = ProductionPlan(
            workspace_id=job.workspace_id,
            project_id=job.project_id,
            song_id=song.id,
            version=version,
            provider=inputs.provider,
            model=inputs.model,
            plan=result.plan.model_dump(mode="json"),
            active=True,
        )
        db.add(plan)
        db.flush()
        attempt.result = {"plan_id": str(plan.id), "plan_version": version}
        terminal(db, job, attempt, "succeeded")
    elif job.kind == "music.generate":
        if data.outputs:
            raise fail(
                422, "unsupported_operation", "Music outputs must use the leased upload endpoint"
            )
        try:
            result = MusicGenerationResult.model_validate(data.result)
            inputs = MusicGenerationJobInput.model_validate(job.parameters)
        except ValueError:
            raise fail(422, "invalid_result", "Invalid music generation result") from None
        if result.generation_id != inputs.generation_id:
            raise fail(422, "invalid_result", "Generation result does not match this job")
        generation = scoped(db, Generation, inputs.generation_id, job.workspace_id)
        if generation.song_id != job.song_id or len(result.outputs) != inputs.version_count:
            raise fail(422, "invalid_result", "Generated output count does not match request")
        if {item.version for item in result.outputs} != set(range(1, inputs.version_count + 1)):
            raise fail(422, "invalid_result", "Generated versions do not match request")
        rows = {
            row.version: row
            for row in db.scalars(
                select(GenerationVersion).where(
                    GenerationVersion.generation_id == generation.id,
                    GenerationVersion.workspace_id == job.workspace_id,
                )
            )
        }
        if any(
            rows.get(item.version) is None or rows[item.version].asset_id != item.asset_id
            for item in result.outputs
        ):
            raise fail(422, "invalid_result", "Generated asset does not match uploaded output")
        ordered = sorted(result.outputs, key=lambda item: item.version)
        job.result_asset_id = ordered[0].asset_id
        attempt.result = {
            "generation_id": str(generation.id),
            "output_asset_ids": [str(item.asset_id) for item in ordered],
        }
        terminal(db, job, attempt, "succeeded")
    else:
        raise fail(422, "unsupported_operation", "This job does not accept completion")
    db.commit()
    return {"state": job.state, "result_asset_id": job.result_asset_id, "output_asset_ids": []}


@router.post(INTERNAL + "/fail")
def worker_fail(
    job_id: UUID, number: int, data: FailInput, request: Request, service: Service, db: DB
) -> dict:
    job, attempt = leased(db, job_id, number, request, terminal_ok=True)
    if job.state not in TERMINAL:
        if job.cancel_requested:
            terminal(
                db,
                job,
                attempt,
                "cancelled",
                retryable=job.kind in {"system.verify", "producer.plan", "music.generate"},
            )
        else:
            code = "diagnostic_failed" if job.kind == "system.verify" else "processing_failed"
            terminal(
                db,
                job,
                attempt,
                "failed",
                code,
                "Worker could not complete this job",
                retryable=data.retryable
                and job.kind in {"system.verify", "producer.plan", "music.generate"}
                and not data.outcome_unknown,
                unknown=data.outcome_unknown,
            )
        db.commit()
    return {"state": job.state}


@router.get(INTERNAL + "/credentials/{provider}")
def credentials(
    job_id: UUID, number: int, provider: str, request: Request, service: Service, db: DB
) -> dict:
    job, _ = leased(db, job_id, number, request)
    if job.kind not in {"producer.plan", "music.generate"}:
        raise fail(403, "credential_access_denied", "This job is not authorized for credentials")
    inputs = (
        ProducerJobInput.model_validate(job.parameters)
        if job.kind == "producer.plan"
        else MusicGenerationJobInput.model_validate(job.parameters)
    )
    if provider != inputs.provider:
        raise fail(403, "credential_access_denied", "This job is not authorized for this provider")
    row = config_row(db, job.workspace_id, provider)
    if row is None or not row.enabled or not row.secret_reference:
        raise fail(409, "provider_not_configured", "Selected provider is not configured")
    return {"api_key": read_key(get_secret_store(request), row.secret_reference)}


@router.put(INTERNAL + "/outputs/{version}")
async def upload_music_output(
    job_id: UUID, number: int, version: int, request: Request, service: Service, db: DB
) -> dict:
    """Accept a bounded provider response only from the current leased worker."""
    job, _ = leased(db, job_id, number, request)
    if job.kind != "music.generate" or job.state in TERMINAL:
        raise fail(409, "output_unavailable", "This job cannot accept generated audio")
    try:
        inputs = MusicGenerationJobInput.model_validate(job.parameters)
    except ValueError:
        raise fail(422, "invalid_result", "Invalid music generation input") from None
    if not 1 <= version <= inputs.version_count:
        raise fail(422, "invalid_output", "Generated version is outside the requested range")
    content_type = request.headers.get("content-type", "").split(";", 1)[0].lower()
    if content_type not in {"audio/mpeg", "audio/wav", "audio/x-wav", "audio/flac", "audio/mp4"}:
        raise fail(422, "invalid_output", "Generated output must be supported audio")
    generation = scoped(db, Generation, inputs.generation_id, job.workspace_id)
    existing = db.scalar(
        select(GenerationVersion)
        .where(
            GenerationVersion.generation_id == generation.id,
            GenerationVersion.workspace_id == job.workspace_id,
            GenerationVersion.version == version,
        )
        .with_for_update()
    )
    if existing and existing.asset_id:
        return {"asset_id": existing.asset_id, "version": version, "already_present": True}
    key = None
    committed = False
    try:
        body = await request.body()
        store = storage(request)
        key, size, digest = store.save_upload(io.BytesIO(body))
        media = probe_audio(store.path_for(key))
        extension = {
            "audio/mpeg": "mp3",
            "audio/wav": "wav",
            "audio/flac": "flac",
            "audio/mp4": "m4a",
        }[media["media_type"]]
        asset = AudioAsset(
            workspace_id=job.workspace_id,
            project_id=job.project_id,
            song_id=job.song_id,
            kind="generated",
            original_filename=safe_filename(f"generation-{generation.id}-v{version}.{extension}"),
            storage_key=key,
            byte_size=size,
            sha256=digest,
            **media,
        )
        db.add(asset)
        db.flush()
        provider_request_id = request.headers.get("x-provider-request-id")
        if provider_request_id and len(provider_request_id) > 200:
            provider_request_id = None
        metadata = {"provider": inputs.provider, "model": inputs.model, "version": version}
        if existing:
            existing.asset_id = asset.id
            existing.provider_request_id = provider_request_id
            existing.generation_metadata = metadata
        else:
            db.add(
                GenerationVersion(
                    workspace_id=job.workspace_id,
                    project_id=job.project_id,
                    generation_id=generation.id,
                    version=version,
                    asset_id=asset.id,
                    provider_request_id=provider_request_id,
                    generation_metadata=metadata,
                )
            )
        db.commit()
        committed = True
        return {"asset_id": asset.id, "version": version, "already_present": False}
    except UploadTooLarge:
        raise fail(413, "output_too_large", "Generated audio exceeds 100 MiB") from None
    except InvalidMedia:
        raise fail(422, "invalid_output", "Provider returned unsupported audio") from None
    except (StorageError, OSError):
        raise fail(
            503, "storage_unavailable", "Audio storage or validation is unavailable"
        ) from None
    finally:
        if not committed:
            db.rollback()
            if key:
                try:
                    storage(request).delete_uncommitted(key)
                except (StorageError, OSError):
                    pass
