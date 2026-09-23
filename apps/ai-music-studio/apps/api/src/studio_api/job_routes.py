import hashlib
import secrets
from datetime import timedelta
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Request
from pydantic import Field
from sqlalchemy import select

from studio_api.auth import fail
from studio_api.domain_models import Job, JobEvent, Project, Song
from studio_api.domain_routes import DB, JOB_FIELDS, Auth, Limit, Offset, public, scoped
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
from studio_api.orchestration_client import OrchestrationError, private_value
from studio_api.schemas import StrictModel

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
        terminal(db, job, attempt, "cancelled", retryable=job.kind == "system.verify")
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
    if job.kind != "system.verify":
        raise fail(409, "unsupported_operation", "No worker handler is enabled for this job")
    inputs = DiagnosticInput.model_validate(job.parameters).model_dump()
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
    # Diagnostic stage names are normalized; arbitrary worker text is never public.
    stage = (
        data.current_stage
        if data.current_stage in {"starting", "verifying", "waiting", "hashing", "finishing"}
        else "working"
    )
    if data.progress_percent > job.progress_percent or stage != job.current_stage:
        job.progress_percent = data.progress_percent
        job.current_stage = stage
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
        terminal(db, job, attempt, "cancelled", retryable=job.kind == "system.verify")
    else:
        if job.kind != "system.verify" or data.outputs:
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
    db.commit()
    return {"state": job.state, "result_asset_id": job.result_asset_id, "output_asset_ids": []}


@router.post(INTERNAL + "/fail")
def worker_fail(
    job_id: UUID, number: int, data: FailInput, request: Request, service: Service, db: DB
) -> dict:
    job, attempt = leased(db, job_id, number, request, terminal_ok=True)
    if job.state not in TERMINAL:
        if job.cancel_requested:
            terminal(db, job, attempt, "cancelled", retryable=job.kind == "system.verify")
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
                and job.kind == "system.verify"
                and not data.outcome_unknown,
                unknown=data.outcome_unknown,
            )
        db.commit()
    return {"state": job.state}


@router.get(INTERNAL + "/credentials/{provider}")
def credentials(
    job_id: UUID, number: int, provider: str, request: Request, service: Service, db: DB
) -> dict:
    leased(db, job_id, number, request)
    raise fail(
        403, "credential_access_denied", "This job is not authorized for provider credentials"
    )
