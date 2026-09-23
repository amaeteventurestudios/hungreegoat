"""Provider-neutral structured production-plan calls from the isolated worker."""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

from studio_worker.runtime import WorkerFailure

PLAN_SCHEMA: dict[str, Any] = {
    "type": "object",
    "additionalProperties": False,
    "properties": {
        "style": {"type": "string"},
        "bpm": {"type": ["integer", "null"]},
        "musical_key": {"type": ["string", "null"]},
        "instrumentation": {"type": "array", "items": {"type": "string"}},
        "structure": {"type": "array", "items": {"type": "string"}},
        "energy_curve": {"type": "array", "items": {"type": "string"}},
        "vocal_direction": {"type": "string"},
        "arrangement_guidance": {"type": "string"},
        "negative_instructions": {"type": "array", "items": {"type": "string"}},
        "production_notes": {"type": "string"},
        "provider_request_id": {"type": ["string", "null"]},
    },
    "required": [
        "style",
        "bpm",
        "musical_key",
        "instrumentation",
        "structure",
        "energy_curve",
        "vocal_direction",
        "arrangement_guidance",
        "negative_instructions",
        "production_notes",
        "provider_request_id",
    ],
}


def prompt(inputs: dict[str, Any]) -> str:
    context = {
        key: value for key, value in inputs.items() if key not in {"provider", "model"}
    }
    return (
        "Create a practical music production plan. Return only the requested JSON object. "
        "Use the song context below. Do not include copyrighted lyrics or claims about audio that "
        "does not exist. The arrays must contain useful, concrete entries.\n\n"
        + json.dumps(context, ensure_ascii=True, separators=(",", ":"))
    )


def request_json(
    url: str, headers: dict[str, str], payload: dict[str, Any]
) -> tuple[dict, str | None]:
    request = urllib.request.Request(
        url,
        method="POST",
        headers={**headers, "Content-Type": "application/json"},
        data=json.dumps(payload, ensure_ascii=True, separators=(",", ":")).encode(),
    )
    try:
        with urllib.request.urlopen(request, timeout=45) as response:  # nosec B310: fixed HTTPS URLs
            body = response.read(1024 * 1024 + 1)
            if len(body) > 1024 * 1024:
                raise WorkerFailure(
                    "provider_invalid_response", "Provider response exceeded the limit"
                )
            data = json.loads(body)
            if not isinstance(data, dict):
                raise TypeError
            return data, response.headers.get("x-request-id")
    except urllib.error.HTTPError as error:
        if error.code in {401, 403}:
            raise WorkerFailure(
                "provider_auth_failed", "Provider credential or permission was rejected"
            ) from None
        if error.code == 429:
            raise WorkerFailure(
                "provider_rate_limited", "Provider rate limit reached", True
            ) from None
        raise WorkerFailure(
            "provider_unavailable", "Provider request failed", error.code >= 500
        ) from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise WorkerFailure(
            "provider_unavailable", "Provider request was unavailable", True
        ) from None
    except (TypeError, ValueError, UnicodeError):
        raise WorkerFailure(
            "provider_invalid_response", "Provider returned invalid JSON"
        ) from None


def parse_json(value: object) -> dict[str, Any]:
    if not isinstance(value, str):
        raise WorkerFailure(
            "provider_invalid_response", "Provider omitted the production plan"
        )
    try:
        plan = json.loads(value)
    except ValueError:
        raise WorkerFailure(
            "provider_invalid_response", "Provider returned invalid production JSON"
        ) from None
    if not isinstance(plan, dict):
        raise WorkerFailure(
            "provider_invalid_response", "Provider returned an invalid production plan"
        )
    return plan


def create_plan(
    provider: str, model: str, api_key: str, inputs: dict[str, Any]
) -> dict[str, Any]:
    text = prompt(inputs)
    response_schema = {"name": "production_plan", "strict": True, "schema": PLAN_SCHEMA}
    if provider == "openai":
        data, request_id = request_json(
            "https://api.openai.com/v1/responses",
            {"Authorization": "Bearer " + api_key},
            {
                "model": model,
                "input": [
                    {"role": "user", "content": [{"type": "input_text", "text": text}]}
                ],
                "text": {"format": {"type": "json_schema", **response_schema}},
            },
        )
        plan = parse_json(data.get("output_text"))
        request_id = request_id or data.get("id")
    elif provider == "openrouter":
        data, request_id = request_json(
            "https://openrouter.ai/api/v1/chat/completions",
            {"Authorization": "Bearer " + api_key},
            {
                "model": model,
                "messages": [{"role": "user", "content": text}],
                "response_format": {
                    "type": "json_schema",
                    "json_schema": response_schema,
                },
            },
        )
        choices = data.get("choices")
        content = (
            choices[0].get("message", {}).get("content")
            if isinstance(choices, list) and choices
            else None
        )
        plan = parse_json(content)
        request_id = request_id or data.get("id")
    elif provider == "anthropic":
        data, request_id = request_json(
            "https://api.anthropic.com/v1/messages",
            {"x-api-key": api_key, "anthropic-version": "2023-06-01"},
            {
                "model": model,
                "max_tokens": 1600,
                "messages": [{"role": "user", "content": text}],
                "output_config": {
                    "format": {"type": "json_schema", "schema": PLAN_SCHEMA}
                },
            },
        )
        content = data.get("content")
        text_value = (
            content[0].get("text") if isinstance(content, list) and content else None
        )
        plan = parse_json(text_value)
        request_id = request_id or data.get("id")
    else:
        raise WorkerFailure(
            "provider_unsupported", "Selected AI producer is unsupported"
        )
    if isinstance(request_id, str) and len(request_id) <= 200:
        plan["provider_request_id"] = request_id
    else:
        plan["provider_request_id"] = None
    return plan
