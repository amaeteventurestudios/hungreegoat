"""Fixed upstream endpoints with normalized, credential-free health results."""

import json
import math
import re
import time
from dataclasses import dataclass

import httpx
from fastapi import Request

PROVIDERS = ("openai", "openrouter", "anthropic", "elevenlabs")
CATALOGS: dict[str, list[dict[str, str]]] = {
    "openai": [{"id": "gpt-6-luna", "label": "GPT-6 Luna"}],
    "anthropic": [
        {"id": "claude-sonnet-5", "label": "Claude Sonnet 5"},
        {"id": "claude-haiku-4-5-20251001", "label": "Claude Haiku 4.5"},
    ],
    "openrouter": [
        {"id": "openai/gpt-6-luna", "label": "OpenAI GPT-6 Luna"},
        {"id": "anthropic/claude-sonnet-5", "label": "Anthropic Claude Sonnet 5"},
    ],
    "elevenlabs": [
        {"id": "music_v1", "label": "Eleven Music v1"},
        {"id": "music_v2", "label": "Eleven Music v2"},
        {"id": "music_v2_5", "label": "Eleven Music v2.5"},
    ],
}
CAPABILITIES = {
    "openai": ["production_plan", "model_selection"],
    "openrouter": ["production_plan", "model_selection"],
    "anthropic": ["production_plan", "model_selection"],
    "elevenlabs": ["music_generation", "composition_plan"],
}
MODELS_URL = {
    "openai": "https://api.openai.com/v1/models",
    "openrouter": "https://openrouter.ai/api/v1/models",
    "anthropic": "https://api.anthropic.com/v1/models",
}
HEALTH_URL = {
    **MODELS_URL,
    "openrouter": "https://openrouter.ai/api/v1/key",
    "elevenlabs": "https://api.elevenlabs.io/v1/user/subscription",
}


@dataclass
class ProviderFailure(Exception):
    code: str
    message: str
    status: str = "unavailable"


def get_provider_client(request: Request) -> httpx.Client:
    return request.app.state.provider_client


def headers(provider: str, key: str) -> dict[str, str]:
    if provider == "anthropic":
        return {"x-api-key": key, "anthropic-version": "2023-06-01"}
    if provider == "elevenlabs":
        return {"xi-api-key": key}
    return {"Authorization": "Bearer " + key}


def fetch(client: httpx.Client, url: str, provider: str, key: str) -> dict:
    try:
        started = time.monotonic()
        with client.stream(
            "GET", url, headers=headers(provider, key), timeout=8, follow_redirects=False
        ) as response:
            if response.status_code in {401, 403}:
                raise ProviderFailure(
                    "provider_auth_failed", "Credential or permission was rejected"
                )
            if response.status_code == 429:
                raise ProviderFailure(
                    "provider_rate_limited", "Provider rate limit reached", "degraded"
                )
            if not 200 <= response.status_code < 300:
                raise ProviderFailure("provider_unavailable", "Provider is unavailable")
            content = bytearray()
            for chunk in response.iter_bytes():
                if len(content) + len(chunk) > 2 * 1024 * 1024:
                    raise ProviderFailure(
                        "provider_invalid_response", "Provider response exceeds limit"
                    )
                if time.monotonic() - started > 10:
                    raise ProviderFailure("provider_timeout", "Provider request timed out")
                content.extend(chunk)
            data = json.loads(content)
            if not isinstance(data, dict):
                raise ValueError
            return data
    except httpx.TimeoutException:
        raise ProviderFailure("provider_timeout", "Provider request timed out") from None
    except httpx.HTTPError:
        raise ProviderFailure("provider_unavailable", "Provider is unavailable") from None
    except (ValueError, UnicodeError):
        raise ProviderFailure(
            "provider_invalid_response", "Provider returned an invalid response"
        ) from None


def check_health(client: httpx.Client, provider: str, key: str) -> dict:
    data = fetch(client, HEALTH_URL[provider], provider, key)
    usage: dict = {"available": False}
    if provider in {"openai", "anthropic"} and not isinstance(data.get("data"), list):
        raise ProviderFailure("provider_invalid_response", "Provider returned an invalid response")
    if provider == "openrouter":
        if not isinstance(data.get("data"), dict):
            raise ProviderFailure(
                "provider_invalid_response", "Provider returned an invalid response"
            )
        remaining = data["data"].get("limit_remaining")
        if (
            isinstance(remaining, (int, float))
            and not isinstance(remaining, bool)
            and math.isfinite(remaining)
        ):
            usage = {
                "available": True,
                "remaining": max(0, remaining),
                "unit": "USD key spending limit",
            }
    if provider == "elevenlabs":
        limit, count = data.get("character_limit"), data.get("character_count")
        if not isinstance(data.get("tier"), str):
            raise ProviderFailure(
                "provider_invalid_response", "Provider returned an invalid response"
            )
        if type(limit) is int and type(count) is int:
            usage = {
                "available": True,
                "remaining": max(0, limit - count),
                "unit": "subscription characters (not music quota)",
            }
    return usage


def list_models(client: httpx.Client, provider: str, key: str | None) -> dict:
    if not key or provider not in MODELS_URL:
        return {"items": CATALOGS[provider], "source": "catalog"}
    data = fetch(client, MODELS_URL[provider], provider, key)
    rows = data.get("data")
    if not isinstance(rows, list):
        raise ProviderFailure("provider_invalid_response", "Provider returned an invalid response")
    items = []
    for row in rows[:1000]:
        if not isinstance(row, dict):
            continue
        identifier = row.get("id")
        if (
            not isinstance(identifier, str)
            or not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}", identifier)
            or key in identifier
        ):
            continue
        label = row.get("display_name", row.get("name", identifier))
        if not isinstance(label, str) or key in label:
            label = identifier
        items.append({"id": identifier, "label": label[:200]})
    return {"items": items, "source": "live"}
