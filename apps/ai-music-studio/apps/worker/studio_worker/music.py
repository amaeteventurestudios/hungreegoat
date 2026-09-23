"""ElevenLabs Music adapter isolated behind the worker boundary."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from studio_worker.runtime import WorkerFailure

MAX_AUDIO_BYTES = 100 * 1024 * 1024


def request_music(
    api_key: str, inputs: dict[str, Any]
) -> tuple[bytes, str, str | None]:
    model = inputs.get("model")
    prompt = inputs.get("prompt")
    duration = inputs.get("duration_seconds")
    if (
        not isinstance(model, str)
        or not isinstance(prompt, str)
        or not isinstance(duration, int)
    ):
        raise WorkerFailure(
            "invalid_music_input", "Music generation inputs are invalid"
        )
    payload: dict[str, Any] = {
        "model_id": model,
        "prompt": prompt,
        "music_length_ms": duration * 1000,
        "force_instrumental": bool(inputs.get("force_instrumental")),
    }
    composition_plan = inputs.get("composition_plan")
    # ElevenLabs accepts either prompt or composition_plan. The normalized prompt is
    # the portable contract; retain the plan only as immutable provenance.
    if composition_plan is not None and not isinstance(composition_plan, dict):
        raise WorkerFailure(
            "invalid_music_input", "Music generation inputs are invalid"
        )
    request = urllib.request.Request(
        "https://api.elevenlabs.io/v1/music",
        method="POST",
        headers={"xi-api-key": api_key, "Content-Type": "application/json"},
        data=json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode(),
    )
    try:
        with urllib.request.urlopen(request, timeout=180) as response:  # nosec B310: fixed HTTPS endpoint
            audio = response.read(MAX_AUDIO_BYTES + 1)
            content_type = response.headers.get_content_type().lower()
            request_id = response.headers.get("song-id") or response.headers.get(
                "x-request-id"
            )
        if len(audio) > MAX_AUDIO_BYTES or not audio:
            raise WorkerFailure(
                "provider_invalid_response", "Provider returned invalid audio"
            )
        if content_type not in {
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/flac",
            "audio/mp4",
        }:
            raise WorkerFailure(
                "provider_invalid_response", "Provider returned unsupported audio"
            )
        return audio, content_type, request_id if isinstance(request_id, str) else None
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            raise WorkerFailure(
                "provider_auth_failed", "Provider credential or permission was rejected"
            ) from None
        if error.code == 429:
            raise WorkerFailure(
                "provider_rate_limited", "Provider rate limit reached", True
            ) from None
        if 400 <= error.code < 500:
            raise WorkerFailure(
                "provider_request_rejected", "Provider rejected the music request"
            ) from None
        raise WorkerFailure(
            "provider_unavailable", "Provider result is uncertain", False, True
        ) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        # The request may have been accepted after the connection was lost; never
        # automatically duplicate a paid generation in that case.
        raise WorkerFailure(
            "provider_outcome_unknown", "Provider result is uncertain", False, True
        ) from None
