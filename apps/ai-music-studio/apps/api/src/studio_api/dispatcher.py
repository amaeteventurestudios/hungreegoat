"""Separate durable outbox dispatcher; never runs an audio engine in the API."""

import logging
import time
from datetime import timedelta
from uuid import uuid4

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from studio_api.config import Settings
from studio_api.database import create_database_engine
from studio_api.domain_models import Job
from studio_api.job_service import TERMINAL, current_attempt, event, locked_job, terminal
from studio_api.logging import configure_logging
from studio_api.models import utcnow
from studio_api.orchestration_client import (
    OrchestrationClient,
    OrchestrationError,
    WindmillClient,
    configured_script,
)
from studio_api.orchestration_models import JobAttempt, JobOutbox

logger = logging.getLogger("studio.dispatcher")


def matches(remote: dict, job: Job, attempt: JobAttempt) -> bool:
    args = remote.get("args")
    return (
        str(remote.get("script_hash", "")) == attempt.script_hash
        and isinstance(args, dict)
        and args.get("job_id") == str(job.id)
        and args.get("attempt") == attempt.attempt
    )


def dispatch_once(engine, settings: Settings, client: OrchestrationClient) -> bool:
    owner = uuid4()
    with Session(engine) as db:
        row = db.scalar(
            select(JobOutbox)
            .where(
                JobOutbox.state.in_(["pending", "dispatching"]),
                JobOutbox.next_dispatch_at <= utcnow(),
                or_(JobOutbox.lease_expires_at.is_(None), JobOutbox.lease_expires_at <= utcnow()),
            )
            .order_by(JobOutbox.next_dispatch_at)
            .with_for_update(skip_locked=True)
            .limit(1)
        )
        if row is None:
            return False
        job = locked_job(db, row.job_id)
        if job.state in TERMINAL or job.attempt != row.attempt:
            row.state = "closed"
            db.commit()
            return True
        attempt = current_attempt(db, job, row.attempt)
        try:
            attempt.script_hash = attempt.script_hash or configured_script(settings)
        except OrchestrationError as error:
            row.last_error_code = str(error)
            row.next_dispatch_at = utcnow() + timedelta(seconds=5)
            db.commit()
            return False
        row.state = "dispatching"
        row.lease_owner = owner
        row.lease_expires_at = utcnow() + timedelta(seconds=60)
        row_id, job_id, number = row.id, job.id, attempt.attempt
        execution_id, script_hash = attempt.execution_id, attempt.script_hash
        db.commit()
    error_code = None
    mismatch = False
    try:
        remote = client.inspect(execution_id)
        if remote is None:
            client.submit(execution_id, script_hash, job_id, number)
        else:
            with Session(engine) as db:
                job = db.get(Job, job_id)
                attempt = current_attempt(db, job, number)
                if not matches(remote, job, attempt):
                    mismatch = True
                    raise OrchestrationError("execution_mismatch")
    except OrchestrationError as error:
        error_code = str(error)
    with Session(engine) as db:
        row = db.scalar(select(JobOutbox).where(JobOutbox.id == row_id).with_for_update())
        if row.lease_owner != owner:
            return True
        job = locked_job(db, job_id)
        row.lease_owner = None
        row.lease_expires_at = None
        if job.state in TERMINAL or job.attempt != number:
            row.state = "closed"
        elif mismatch:
            attempt = current_attempt(db, job, number)
            terminal(
                db,
                job,
                attempt,
                "failed",
                "execution_mismatch",
                "Execution identity did not match",
                unknown=True,
            )
            row.state = "closed"
        elif error_code:
            row.state = "pending"
            row.last_error_code = error_code
            row.next_dispatch_at = utcnow() + timedelta(seconds=3)
        else:
            row.state = "dispatched"
            row.last_error_code = None
            if job.state == "pending":
                job.state = "queued"
                job.updated_at = utcnow()
                event(db, job, "Workflow execution queued")
        db.commit()
    return True


def reconcile_once(engine, client: OrchestrationClient) -> None:
    with Session(engine) as db:
        ids = db.scalars(
            select(Job.id)
            .join(JobOutbox, JobOutbox.job_id == Job.id)
            .where(
                Job.state.not_in(TERMINAL),
                JobOutbox.state == "dispatched",
                JobOutbox.attempt == Job.attempt,
            )
            .limit(25)
        ).all()
    for id in ids:
        with Session(engine) as db:
            job = db.get(Job, id)
            attempt = current_attempt(db, job, job.attempt)
            execution_id = attempt.execution_id
            try:
                remote = client.inspect(execution_id)
            except OrchestrationError:
                continue
            # Refresh after HTTP: a worker may have committed completion meanwhile.
            db.expire_all()
            job = locked_job(db, id)
            if job.state in TERMINAL:
                continue
            attempt = current_attempt(db, job, job.attempt)
            if attempt.execution_id != execution_id:
                continue
            if remote is not None and not matches(remote, job, attempt):
                terminal(
                    db,
                    job,
                    attempt,
                    "failed",
                    "execution_mismatch",
                    "Execution identity did not match",
                    unknown=True,
                )
            elif remote is not None and (
                remote.get("type") == "CompletedJob" or "success" in remote
            ):
                # Success without a domain finalization is not domain success.
                if job.cancel_requested:
                    terminal(db, job, attempt, "cancelled", retryable=job.kind == "system.verify")
                else:
                    terminal(
                        db,
                        job,
                        attempt,
                        "failed",
                        "execution_interrupted",
                        "Execution ended before finalization",
                        retryable=job.kind == "system.verify",
                        unknown=job.kind != "system.verify",
                    )
            elif remote is None:
                terminal(
                    db,
                    job,
                    attempt,
                    "failed",
                    "execution_missing",
                    "Execution could not be reconciled",
                    retryable=job.kind == "system.verify",
                    unknown=job.kind != "system.verify",
                )
            db.commit()


def main() -> None:
    settings = Settings()
    configure_logging(settings.log_level)
    engine = create_database_engine(settings)
    client = WindmillClient(settings)
    try:
        while True:
            try:
                for _ in range(10):
                    if not dispatch_once(engine, settings, client):
                        break
                reconcile_once(engine, client)
            except Exception as error:
                logger.error("Dispatcher cycle failed", extra={"error_type": type(error).__name__})
            time.sleep(2)
    except KeyboardInterrupt:
        pass
    finally:
        client.close()
        engine.dispose()


if __name__ == "__main__":
    main()
