import re
from pathlib import Path
from typing import Protocol
from urllib.parse import quote
from uuid import UUID

import httpx

from studio_api.config import Settings
from studio_api.secret_store import EncryptedFileSecretStore


class OrchestrationError(Exception):
    pass


class OrchestrationClient(Protocol):
    def submit(self, execution_id: UUID, script_hash: str, job_id: UUID, attempt: int) -> None: ...
    def inspect(self, execution_id: UUID) -> dict | None: ...


def private_value(path: Path | None) -> str:
    if path is None:
        raise OrchestrationError("orchestration_unconfigured")
    try:
        if any(part.is_symlink() for part in (path, *path.parents)):
            raise ValueError
        value = EncryptedFileSecretStore._read_private(path).decode().strip()
        if not value:
            raise ValueError
        return value
    except Exception:
        raise OrchestrationError("orchestration_unconfigured") from None


def configured_script(settings: Settings) -> str:
    value = private_value(settings.windmill_script_hash_file)
    if not re.fullmatch(r"[a-fA-F0-9]{1,32}", value):
        raise OrchestrationError("orchestration_invalid_script")
    return value


class WindmillClient:
    def __init__(self, settings: Settings, client: httpx.Client | None = None):
        self.settings = settings
        self.client = client or httpx.Client(timeout=8, follow_redirects=False, trust_env=False)
        self.owns_client = client is None

    def close(self) -> None:
        if self.owns_client:
            self.client.close()

    def request(self, method: str, path: str, **kwargs) -> httpx.Response:
        if not self.settings.windmill_url:
            raise OrchestrationError("orchestration_unconfigured")
        token = private_value(self.settings.windmill_token_file)
        try:
            return self.client.request(
                method,
                self.settings.windmill_url.rstrip("/")
                + "/api/w/"
                + quote(self.settings.windmill_workspace, safe="")
                + path,
                headers={"Authorization": "Bearer " + token},
                **kwargs,
            )
        except httpx.HTTPError:
            raise OrchestrationError("orchestration_unavailable") from None

    def submit(self, execution_id: UUID, script_hash: str, job_id: UUID, attempt: int) -> None:
        response = self.request(
            "POST",
            f"/jobs/run/h/{script_hash}",
            params={"job_id": str(execution_id), "tag": "studio-ai"},
            json={"job_id": str(job_id), "attempt": attempt},
        )
        if response.status_code != 201 or response.text.strip().strip('"') != str(execution_id):
            raise OrchestrationError("dispatch_unconfirmed")

    def inspect(self, execution_id: UUID) -> dict | None:
        response = self.request("GET", f"/jobs_u/get/{execution_id}")
        if response.status_code == 404:
            return None
        if response.status_code != 200 or len(response.content) > 2 * 1024 * 1024:
            raise OrchestrationError("orchestration_unavailable")
        try:
            result = response.json()
            if not isinstance(result, dict):
                raise ValueError
            return result
        except ValueError:
            raise OrchestrationError("orchestration_invalid_response") from None
