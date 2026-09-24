"""Windmill entry point. Never return raw provider data or credentials."""

from __future__ import annotations

import hashlib
import os
import sys
import time
from typing import Any
from uuid import UUID, uuid4

from studio_worker.audio import analyze_audio, render_tempo, source_path
from studio_worker.music import request_music
from studio_worker.producer import create_plan
from studio_worker.runtime import (
    ProtocolFailure,
    WorkerClient,
    WorkerContext,
    WorkerFailure,
)
from studio_worker.stems import LABELS, StemSeparator, mix_stems


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


def audio_analysis(context: WorkerContext) -> dict[str, Any]:
    inputs = context.claim["inputs"]
    if not isinstance(inputs.get("source_asset_id"), str) or not isinstance(
        inputs.get("source_key"), str
    ):
        raise WorkerFailure("invalid_audio_input", "Audio analysis inputs are invalid")
    context.progress(10, "verifying")
    source = source_path(inputs["source_key"])
    context.progress(25, "working")
    result = analyze_audio(source, inputs["source_asset_id"])
    context.check_cancelled()
    context.progress(95, "finishing")
    return result


def tempo_version(context: WorkerContext) -> dict[str, Any]:
    inputs = context.claim["inputs"]
    source_id, key = inputs.get("source_asset_id"), inputs.get("source_key")
    if not isinstance(source_id, str) or not isinstance(key, str):
        raise WorkerFailure("invalid_tempo_input", "Tempo inputs are invalid")
    completed = inputs.get("completed_asset_id")
    if completed:
        return {"source_asset_id": source_id, "asset_id": str(UUID(completed))}
    context.progress(10, "verifying")
    source = source_path(key)
    context.progress(25, "working")
    audio = render_tempo(source, inputs, context.check_cancelled)
    context.check_cancelled()
    context.progress(85, "uploading")
    uploaded = context.client.upload_derived_audio(audio)
    asset_id = uploaded.get("asset_id")
    if not isinstance(asset_id, str):
        raise WorkerFailure("worker_protocol", "Derived audio could not be stored")
    context.progress(95, "finishing")
    return {"source_asset_id": source_id, "asset_id": asset_id}


def separate_stems(context: WorkerContext) -> dict[str, Any]:
    inputs = context.claim["inputs"]
    if inputs.get("engine_version") != StemSeparator.version or not isinstance(inputs.get("source_key"), str):
        raise WorkerFailure("invalid_stem_input", "Stem separation inputs are invalid")
    completed = inputs.get("completed_stems", {})
    if not isinstance(completed, dict) or not set(completed).issubset(LABELS):
        raise WorkerFailure("invalid_stem_input", "Stem separation inputs are invalid")
    if set(completed) != set(LABELS):
        context.progress(10, "separating")
        rendered = StemSeparator().separate(source_path(inputs["source_key"]), context.check_cancelled)
        for index, label in enumerate(LABELS):
            context.check_cancelled()
            if label not in completed:
                context.progress(70 + index * 5, "uploading")
                uploaded = context.client.upload_derived_audio(rendered[label], f"/stems/{label}")
                completed[label] = uploaded["asset_id"]
    context.progress(95, "finishing")
    return {"stem_set_id": inputs["stem_set_id"], "asset_ids": completed}


def render_mix(context: WorkerContext) -> dict[str, Any]:
    inputs = context.claim["inputs"]
    if not isinstance(inputs.get("stem_set_id"), str):
        raise WorkerFailure("invalid_mix_input", "Mix inputs are invalid")
    if inputs.get("completed_asset_id"):
        return {"stem_set_id": inputs["stem_set_id"], "asset_id": inputs["completed_asset_id"]}
    keys = inputs.get("stem_keys")
    if not isinstance(keys, dict) or set(keys) != set(LABELS):
        raise WorkerFailure("invalid_mix_input", "Four stems are required")
    context.progress(15, "mixing")
    audio = mix_stems({label: source_path(keys[label]) for label in LABELS}, inputs["levels"], context.check_cancelled)
    context.check_cancelled()
    context.progress(85, "uploading")
    uploaded = context.client.upload_derived_audio(audio, "/mix-audio")
    context.progress(95, "finishing")
    return {"stem_set_id": inputs["stem_set_id"], "asset_id": uploaded["asset_id"]}


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
        elif claim["kind"] == "audio.analyze":
            result = audio_analysis(context)
        elif claim["kind"] == "audio.tempo":
            result = tempo_version(context)
        elif claim["kind"] == "audio.separate":
            result = separate_stems(context)
        elif claim["kind"] == "audio.mix":
            result = render_mix(context)
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
    except Exception as error:  # noqa: BLE001 - sanitize every unexpected adapter failure
        print(f"Studio worker unexpected failure: {claim['kind']} {type(error).__name__}", file=sys.stderr)
        failure = WorkerFailure(
            "worker_failed", "Worker could not complete the operation"
        )
    finally:
        context.stop()
    if failure:
        print(f"Studio worker failure: {claim['kind']} {failure.code}", file=sys.stderr)
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
