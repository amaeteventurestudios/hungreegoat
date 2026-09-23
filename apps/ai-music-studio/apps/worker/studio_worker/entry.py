"""Windmill entry point. Never return raw provider data or credentials."""

from __future__ import annotations

import hashlib
import os
import time
from typing import Any
from uuid import UUID, uuid4

from studio_worker.music import request_music
from studio_worker.producer import create_plan
from studio_worker.runtime import (
    ProtocolFailure,
    WorkerClient,
    WorkerContext,
    WorkerFailure,
)


def diagnostic(context: WorkerContext) -> dict[str, Any]:
    inputs = context.claim["inputs"]
    duration = inputs.get("duration_seconds", 1)
    payload = inputs.get("payload", "Studio diagnostic fixture")
    fail_first = inputs.get("fail_first_attempt", False)
    if (
        type(duration) not in {int, float}
        or not 1 <= duration <= 120
        or not isinstance(payload, str)
        or len(payload) > 1000
        or type(fail_first) is not bool
    ):
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
            raise WorkerFailure(
                "diagnostic_failure",
                "Diagnostic requested a first-attempt failure",
                True,
            )
        time.sleep(min(0.2, duration - elapsed))
    context.progress(95, "persisting")
    value = payload.encode()
    return {
        "diagnostic": True,
        "sha256": hashlib.sha256(value).hexdigest(),
        "bytes": len(value),
    }


def production_plan(context: WorkerContext) -> dict[str, Any]:
    inputs = context.claim["inputs"]
    provider, model = inputs.get("provider"), inputs.get("model")
    if provider not in {"openai", "openrouter", "anthropic"} or not isinstance(
        model, str
    ):
        raise WorkerFailure(
            "invalid_producer_input", "Production plan inputs are invalid"
        )
    context.progress(10, "verifying")
    credential = context.client.call("/credentials/" + provider)
    api_key = credential.get("api_key")
    if not isinstance(api_key, str) or not api_key:
        raise WorkerFailure(
            "provider_not_configured", "Selected AI producer is not configured"
        )
    context.progress(35, "working")
    plan = create_plan(provider, model, api_key, inputs)
    context.progress(90, "finishing")
    return {"plan": plan}


def music_generation(context: WorkerContext) -> dict[str, Any]:
    inputs = context.claim["inputs"]
    if inputs.get("provider") != "elevenlabs" or not isinstance(
        inputs.get("generation_id"), str
    ):
        raise WorkerFailure(
            "invalid_music_input", "Music generation inputs are invalid"
        )
    count = inputs.get("version_count")
    completed = inputs.get("completed_versions", [])
    if type(count) is not int or not 1 <= count <= 4 or not isinstance(completed, list):
        raise WorkerFailure(
            "invalid_music_input", "Music generation inputs are invalid"
        )
    completed_by_version = {
        item.get("version"): item
        for item in completed
        if isinstance(item, dict)
        and type(item.get("version")) is int
        and 1 <= item["version"] <= count
        and isinstance(item.get("asset_id"), str)
    }
    if len(completed_by_version) != len(completed):
        raise WorkerFailure(
            "invalid_music_input", "Music generation inputs are invalid"
        )
    context.progress(5, "verifying")
    credential = context.client.call("/credentials/elevenlabs")
    api_key = credential.get("api_key")
    if not isinstance(api_key, str) or not api_key:
        raise WorkerFailure(
            "provider_not_configured", "Selected music provider is not configured"
        )
    outputs: list[dict[str, Any]] = []
    for version in range(1, count + 1):
        context.check_cancelled()
        if version in completed_by_version:
            # A safe retry may resume only outputs atomically committed by a prior attempt.
            continue
        context.progress(10 + int((version - 1) / count * 70), "generating")
        audio, media_type, request_id = request_music(api_key, inputs)
        context.check_cancelled()
        context.progress(20 + int(version / count * 65), "uploading")
        uploaded = context.client.upload_audio(version, audio, media_type, request_id)
        asset_id = uploaded.get("asset_id")
        if not isinstance(asset_id, str):
            raise WorkerFailure(
                "worker_protocol", "Generated audio could not be stored"
            )
        outputs.append(
            {
                "version": version,
                "asset_id": asset_id,
                "provider_request_id": request_id,
            }
        )
    # Safe retries resume only assets atomically committed by a prior attempt.
    outputs.extend(completed_by_version.values())
    context.progress(95, "finishing")
    return {"generation_id": inputs["generation_id"], "outputs": outputs}


def execute(job_id: str, attempt: int) -> dict[str, Any]:
    client = WorkerClient(job_id, attempt)
    execution_id = str(UUID(os.environ["WM_JOB_ID"]))
    worker_id = str(uuid4())
    deadline = time.monotonic() + 180
    while True:
        try:
            claim = client.call(
                "/claim", {"execution_id": execution_id, "worker_id": worker_id}
            )
            break
        except ProtocolFailure as error:
            if error.code in {"job_cancelled", "attempt_cancelled"}:
                return {
                    "job_id": client.job_id,
                    "attempt": attempt,
                    "state": "cancelled",
                }
            if (
                error.code == "lease_busy" or error.status >= 500
            ) and time.monotonic() < deadline:
                time.sleep(2)
                continue
            raise RuntimeError("Studio job could not be claimed") from None
    if claim.get("already_complete"):
        return {"job_id": client.job_id, "attempt": attempt, "state": claim["state"]}
    client.lease = claim["lease_token"]
    context = WorkerContext(
        client, claim, cancelled=bool(claim.get("cancel_requested"))
    )
    context.start()
    failure: WorkerFailure | None = None
    try:
        context.check_cancelled()
        if claim["kind"] == "system.verify":
            result = diagnostic(context)
        elif claim["kind"] == "producer.plan":
            result = production_plan(context)
        elif claim["kind"] == "music.generate":
            result = music_generation(context)
        else:
            raise WorkerFailure(
                "unsupported_job", "This worker does not support the requested job"
            )
        context.stop()
        for retry in range(3):
            try:
                completed = client.call("/complete", {"outputs": [], "result": result})
                return {
                    "job_id": client.job_id,
                    "attempt": attempt,
                    "state": completed["state"],
                }
            except ProtocolFailure as error:
                if error.status < 500 or retry == 2:
                    raise
                time.sleep(1)
    except WorkerFailure as error:
        failure = error
    except ProtocolFailure:
        # Do not turn ambiguous finalization into a new operation. Dispatcher reconciles it.
        raise RuntimeError(
            "Studio worker connection interrupted; reconciliation is required"
        ) from None
    except Exception:  # noqa: BLE001 - sanitize every unexpected adapter failure
        failure = WorkerFailure(
            "worker_failed", "Worker could not complete the operation"
        )
    finally:
        context.stop()
    if failure:
        try:
            failed = client.call(
                "/fail",
                {
                    "error_code": failure.code,
                    "message": failure.message,
                    "retryable": failure.retryable,
                    "outcome_unknown": failure.outcome_unknown,
                },
            )
        except ProtocolFailure:
            raise RuntimeError("Studio worker result could not be reported") from None
        return {"job_id": client.job_id, "attempt": attempt, "state": failed["state"]}
    raise RuntimeError("Studio worker did not produce a terminal result")
