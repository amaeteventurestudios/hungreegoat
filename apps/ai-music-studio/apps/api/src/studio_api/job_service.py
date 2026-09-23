import hashlib
import secrets
from uuid import UUID

from pydantic import Field
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from studio_api.auth import fail
from studio_api.domain_models import Generation, Job, JobEvent
from studio_api.models import utcnow
from studio_api.music import MusicGenerationJobInput
from studio_api.orchestration_models import JobAttempt, JobOutbox
from studio_api.producer import ProducerJobInput
from studio_api.schemas import StrictModel

TERMINAL = {"succeeded", "failed", "cancelled"}
LEASE_SECONDS = 90


class DiagnosticInput(StrictModel):
    duration_seconds: int = Field(default=1, ge=1, le=120)
    fail_first_attempt: bool = False
    payload: str = Field(default="Studio worker diagnostic", max_length=1000)


def event(db: Session, job: Job, message: str) -> None:
    sequence = (
        db.scalar(select(func.max(JobEvent.sequence)).where(JobEvent.job_id == job.id)) or 0
    ) + 1
    db.add(
        JobEvent(
            job_id=job.id,
            project_id=job.project_id,
            workspace_id=job.workspace_id,
            sequence=sequence,
            state=job.state,
            message=message,
        )
    )


def add_attempt(db: Session, job: Job) -> JobAttempt:
    attempt = JobAttempt(job_id=job.id, attempt=job.attempt)
    db.add(attempt)
    db.flush()
    db.add(JobOutbox(job_id=job.id, attempt=job.attempt))
    return attempt


def create_diagnostic(
    db: Session,
    workspace_id: UUID,
    project_id: UUID,
    idempotency_key: UUID,
    inputs: DiagnosticInput,
) -> Job:
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": str(idempotency_key)})
    existing = db.scalar(
        select(Job).where(Job.workspace_id == workspace_id, Job.idempotency_key == idempotency_key)
    )
    if existing:
        if existing.project_id != project_id or existing.parameters != inputs.model_dump():
            raise ValueError("Idempotency key already belongs to another request")
        return existing
    job = Job(
        workspace_id=workspace_id,
        project_id=project_id,
        kind="system.verify",
        parameters=inputs.model_dump(),
        idempotency_key=idempotency_key,
    )
    db.add(job)
    db.flush()
    add_attempt(db, job)
    event(db, job, "Diagnostic queued for verification")
    db.commit()
    return job


def create_producer(
    db: Session,
    workspace_id: UUID,
    project_id: UUID,
    song_id: UUID,
    idempotency_key: UUID,
    inputs: ProducerJobInput,
) -> Job:
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": str(idempotency_key)})
    existing = db.scalar(
        select(Job).where(Job.workspace_id == workspace_id, Job.idempotency_key == idempotency_key)
    )
    if existing:
        if (
            existing.project_id != project_id
            or existing.song_id != song_id
            or existing.kind != "producer.plan"
            or existing.parameters != inputs.model_dump(mode="json")
        ):
            raise ValueError("Idempotency key already belongs to another request")
        return existing
    job = Job(
        workspace_id=workspace_id,
        project_id=project_id,
        song_id=song_id,
        kind="producer.plan",
        parameters=inputs.model_dump(mode="json"),
        idempotency_key=idempotency_key,
    )
    db.add(job)
    db.flush()
    add_attempt(db, job)
    event(db, job, "Production plan queued")
    db.commit()
    return job


def create_music_generation(
    db: Session,
    workspace_id: UUID,
    project_id: UUID,
    song_id: UUID,
    plan_id: UUID,
    idempotency_key: UUID,
    inputs: MusicGenerationJobInput,
) -> tuple[Generation, Job]:
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:key))"), {"key": str(idempotency_key)})
    existing = db.scalar(
        select(Job).where(Job.workspace_id == workspace_id, Job.idempotency_key == idempotency_key)
    )
    if existing:
        generation_id = existing.parameters.get("generation_id")
        generation = db.get(Generation, generation_id) if generation_id else None
        comparable = inputs.model_dump(mode="json", exclude={"generation_id"})
        stored = dict(existing.parameters)
        stored.pop("generation_id", None)
        if (
            existing.project_id != project_id
            or existing.song_id != song_id
            or existing.kind != "music.generate"
            or stored != comparable
            or generation is None
        ):
            raise ValueError("Idempotency key already belongs to another request")
        return generation, existing
    generation = Generation(
        workspace_id=workspace_id,
        project_id=project_id,
        song_id=song_id,
        plan_id=plan_id,
        provider=inputs.provider,
        model=inputs.model,
        settings={
            "version_count": inputs.version_count,
            "duration_seconds": inputs.duration_seconds,
            "force_instrumental": inputs.force_instrumental,
            "prompt": inputs.prompt,
            "composition_plan": inputs.composition_plan,
        },
    )
    db.add(generation)
    db.flush()
    payload = inputs.model_copy(update={"generation_id": generation.id}).model_dump(mode="json")
    job = Job(
        workspace_id=workspace_id,
        project_id=project_id,
        song_id=song_id,
        kind="music.generate",
        parameters=payload,
        idempotency_key=idempotency_key,
    )
    db.add(job)
    db.flush()
    add_attempt(db, job)
    event(db, job, "Music generation queued")
    db.commit()
    return generation, job


def locked_job(db: Session, job_id: UUID, workspace_id: UUID | None = None) -> Job:
    query = select(Job).where(Job.id == job_id)
    if workspace_id is not None:
        query = query.where(Job.workspace_id == workspace_id)
    job = db.scalar(query.with_for_update())
    if job is None:
        raise fail(404, "not_found", "Job was not found")
    return job


def current_attempt(db: Session, job: Job, number: int) -> JobAttempt:
    if job.attempt != number:
        raise fail(409, "stale_attempt", "This attempt is no longer current")
    attempt = db.scalar(
        select(JobAttempt).where(JobAttempt.job_id == job.id, JobAttempt.attempt == number)
    )
    if attempt is None:
        raise fail(404, "not_found", "Attempt was not found")
    return attempt


def lease_valid(attempt: JobAttempt, supplied: str, allow_expired: bool = False) -> None:
    digest = hashlib.sha256(supplied.encode()).hexdigest()
    if not attempt.lease_hash or not secrets.compare_digest(digest, attempt.lease_hash):
        raise fail(403, "invalid_lease", "Worker lease is invalid")
    if not allow_expired and (
        attempt.lease_expires_at is None or attempt.lease_expires_at <= utcnow()
    ):
        raise fail(409, "expired_lease", "Worker lease has expired")


def terminal(
    db: Session,
    job: Job,
    attempt: JobAttempt,
    state: str,
    code: str | None = None,
    message: str | None = None,
    retryable: bool = False,
    unknown: bool = False,
) -> None:
    if job.state in TERMINAL:
        return
    job.state = attempt.state = state
    job.error_code, job.error_message = code, message
    job.retry_eligible = retryable
    job.outcome_unknown = unknown
    job.updated_at = job.completed_at = attempt.completed_at = utcnow()
    if state == "succeeded":
        job.progress_percent = 100
    event(
        db,
        job,
        {"succeeded": "Job completed", "failed": "Job failed", "cancelled": "Job cancelled"}[state],
    )
