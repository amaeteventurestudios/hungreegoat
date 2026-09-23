"""Windmill entry point. Never return raw provider data or credentials."""
from __future__ import annotations

import hashlib
import os
import time
from typing import Any
from uuid import UUID, uuid4

from studio_worker.runtime import JobCancelled, ProtocolFailure, WorkerClient, WorkerContext, WorkerFailure


def diagnostic(context: WorkerContext) -> dict[str, Any]:
    inputs = context.claim["inputs"]
    duration = inputs.get("duration_seconds", 1)
    payload = inputs.get("payload", "Studio diagnostic fixture")
    fail_first = inputs.get("fail_first_attempt", False)
    if (type(duration) not in {int, float} or not 1 <= duration <= 120
            or not isinstance(payload, str) or len(payload) > 1000 or type(fail_first) is not bool):
        raise WorkerFailure("invalid_diagnostic", "Diagnostic parameters are invalid")
    start = time.monotonic()
    previous = -1
    while (elapsed := time.monotonic() - start) < duration:
        percent = int(elapsed / duration * 90)
        if percent != previous:
            context.progress(percent, "verifying")
            previous = percent
        context.check_cancelled()
        if fail_first and context.client.attempt == 1 and elapsed >= duration / 2:
            raise WorkerFailure("diagnostic_failure", "Diagnostic requested a first-attempt failure", True)
        time.sleep(min(0.2, duration - elapsed))
    context.progress(95, "persisting")
    value = payload.encode()
    return {"diagnostic": True, "sha256": hashlib.sha256(value).hexdigest(), "bytes": len(value)}


def execute(job_id: str, attempt: int) -> dict[str, Any]:
    client = WorkerClient(job_id, attempt)
    execution_id = str(UUID(os.environ["WM_JOB_ID"]))
    worker_id = str(uuid4())
    deadline = time.monotonic() + 180
    while True:
        try:
            claim = client.call("/claim", {"execution_id": execution_id, "worker_id": worker_id})
            break
        except ProtocolFailure as error:
            if error.code in {"job_cancelled", "attempt_cancelled"}:
                return {"job_id": client.job_id, "attempt": attempt, "state": "cancelled"}
            if (error.code == "lease_busy" or error.status >= 500) and time.monotonic() < deadline:
                time.sleep(2)
                continue
            raise RuntimeError("Studio job could not be claimed") from None
    if claim.get("already_complete"):
        return {"job_id": client.job_id, "attempt": attempt, "state": claim["state"]}
    client.lease = claim["lease_token"]
    context = WorkerContext(client, claim, cancelled=bool(claim.get("cancel_requested")))
    context.start()
    failure: WorkerFailure | None = None
    try:
        context.check_cancelled()
        if claim["kind"] != "system.verify":
            raise WorkerFailure("unsupported_job", "This worker does not support the requested job")
        result = diagnostic(context)
        context.stop()
        for retry in range(3):
            try:
                completed = client.call("/complete", {"outputs": [], "result": result})
                return {"job_id": client.job_id, "attempt": attempt, "state": completed["state"]}
            except ProtocolFailure as error:
                if error.status < 500 or retry == 2:
                    raise
                time.sleep(1)
    except WorkerFailure as error:
        failure = error
    except ProtocolFailure:
        # Do not turn ambiguous finalization into a new operation. Dispatcher reconciles it.
        raise RuntimeError("Studio worker connection interrupted; reconciliation is required") from None
    except Exception:
        failure = WorkerFailure("worker_failed", "Worker could not complete the operation")
    finally:
        context.stop()
    if failure:
        try:
            failed = client.call("/fail", {
                "error_code": failure.code, "message": failure.message,
                "retryable": failure.retryable, "outcome_unknown": False,
            })
        except ProtocolFailure:
            raise RuntimeError("Studio worker result could not be reported") from None
        return {"job_id": client.job_id, "attempt": attempt, "state": failed["state"]}
    raise RuntimeError("Studio worker did not produce a terminal result")
