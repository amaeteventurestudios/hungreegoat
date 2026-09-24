"""Narrow authenticated worker protocol with sanitized failures."""

from __future__ import annotations

import json
import os
import stat
import threading
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any
from uuid import UUID


class WorkerFailure(Exception):
    def __init__(
        self,
        code: str,
        message: str,
        retryable: bool = False,
        outcome_unknown: bool = False,
    ):
        self.code, self.message, self.retryable, self.outcome_unknown = (
            code,
            message,
            retryable,
            outcome_unknown,
        )
        super().__init__(message)


class JobCancelled(WorkerFailure):
    def __init__(self) -> None:
        super().__init__("job_cancelled", "Job was cancelled")


class ProtocolFailure(Exception):
    def __init__(self, status: int, code: str):
        self.status, self.code = status, code
        super().__init__("Studio worker request failed")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(
        self,
        req: urllib.request.Request,
        fp: Any,
        code: int,
        msg: str,
        headers: Any,
        newurl: str,
    ) -> None:
        return None


def private_token(path: Path) -> str:
    if not path.is_absolute() or any(p.is_symlink() for p in (path, *path.parents)):
        raise WorkerFailure(
            "worker_configuration", "Worker credentials are unavailable"
        )
    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(fd, "r") as handle:
        info = os.fstat(handle.fileno())
        if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
            raise WorkerFailure(
                "worker_configuration", "Worker credentials are unavailable"
            )
        value = handle.read(4097).strip()
    if (
        not 32 <= len(value) <= 4096
        or not value.isascii()
        or any(c.isspace() for c in value)
    ):
        raise WorkerFailure(
            "worker_configuration", "Worker credentials are unavailable"
        )
    return value


class WorkerClient:
    def __init__(self, job_id: str, attempt: int):
        self.job_id = str(UUID(job_id))
        if attempt < 1:
            raise ValueError("Invalid attempt")
        self.attempt = attempt
        origin = os.environ.get(
            "STUDIO_INTERNAL_API_URL", "http://studio-api:8000"
        ).rstrip("/")
        if origin != "http://studio-api:8000":
            raise WorkerFailure("worker_configuration", "Worker API origin is invalid")
        self.url = f"{origin}/api/v1/internal/jobs/{self.job_id}/attempts/{attempt}"
        self.token = private_token(Path("/run/studio-orchestration/worker-token"))
        self.lease: str | None = None
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), NoRedirect()
        )

    def call(
        self, endpoint: str, payload: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        headers = {
            "Authorization": "Bearer " + self.token,
            "Content-Type": "application/json",
        }
        if self.lease:
            headers["X-Job-Lease"] = self.lease
        request = urllib.request.Request(
            self.url + endpoint,
            headers=headers,
            data=json.dumps(payload).encode() if payload is not None else None,
            method="POST" if payload is not None else "GET",
        )
        try:
            with self.opener.open(request, timeout=10) as response:
                body = response.read(1024 * 1024 + 1)
                if len(body) > 1024 * 1024:
                    raise ProtocolFailure(502, "invalid_worker_response")
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise ProtocolFailure(502, "invalid_worker_response")
                return data
        except urllib.error.HTTPError as error:
            # Only the normalized machine code is used, never arbitrary error text.
            try:
                data = json.loads(error.read(8192))
                code = data.get("error", {}).get("code", "worker_request_failed")
                if not isinstance(code, str) or len(code) > 100:
                    code = "worker_request_failed"
            except (ValueError, AttributeError):
                code = "worker_request_failed"
            raise ProtocolFailure(error.code, code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ProtocolFailure(503, "worker_connection_unavailable") from None
        except (ValueError, UnicodeError):
            raise ProtocolFailure(502, "invalid_worker_response") from None

    def upload_audio(
        self,
        version: int,
        audio: bytes,
        media_type: str,
        provider_request_id: str | None,
    ) -> dict[str, Any]:
        if not 1 <= version <= 4 or not audio or len(audio) > 100 * 1024 * 1024:
            raise WorkerFailure(
                "provider_invalid_response", "Provider returned invalid audio"
            )
        if media_type not in {
            "audio/mpeg",
            "audio/wav",
            "audio/x-wav",
            "audio/flac",
            "audio/mp4",
        }:
            raise WorkerFailure(
                "provider_invalid_response", "Provider returned unsupported audio"
            )
        headers = {"Authorization": "Bearer " + self.token, "Content-Type": media_type}
        if self.lease:
            headers["X-Job-Lease"] = self.lease
        if provider_request_id and len(provider_request_id) <= 200:
            headers["X-Provider-Request-ID"] = provider_request_id
        request = urllib.request.Request(
            self.url + f"/outputs/{version}", headers=headers, data=audio, method="PUT"
        )
        try:
            with self.opener.open(request, timeout=45) as response:
                body = response.read(1024 * 1024 + 1)
                if len(body) > 1024 * 1024:
                    raise ProtocolFailure(502, "invalid_worker_response")
                data = json.loads(body)
                if not isinstance(data, dict):
                    raise ProtocolFailure(502, "invalid_worker_response")
                return data
        except urllib.error.HTTPError as error:
            try:
                data = json.loads(error.read(8192))
                code = data.get("error", {}).get("code", "worker_request_failed")
                if not isinstance(code, str) or len(code) > 100:
                    code = "worker_request_failed"
            except (ValueError, AttributeError):
                code = "worker_request_failed"
            raise ProtocolFailure(error.code, code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ProtocolFailure(503, "worker_connection_unavailable") from None
        except (ValueError, UnicodeError):
            raise ProtocolFailure(502, "invalid_worker_response") from None

    def upload_derived_audio(
        self,
        audio: bytes,
        endpoint: str = "/derived-audio",
        media_type: str = "audio/flac",
    ) -> dict[str, Any]:
        if not audio or len(audio) > 100 * 1024 * 1024:
            raise WorkerFailure("invalid_derived_audio", "Derived audio is invalid")
        if media_type not in {
            "audio/flac",
            "audio/wav",
            "audio/mpeg",
            "application/zip",
        }:
            raise WorkerFailure("invalid_derived_audio", "Delivery type is invalid")
        headers = {"Authorization": "Bearer " + self.token, "Content-Type": media_type}
        if self.lease:
            headers["X-Job-Lease"] = self.lease
        request = urllib.request.Request(
            self.url + endpoint, headers=headers, data=audio, method="PUT"
        )
        try:
            with self.opener.open(request, timeout=45) as response:
                body = response.read(1024 * 1024 + 1)
                if len(body) > 1024 * 1024:
                    raise ProtocolFailure(502, "invalid_worker_response")
                result = json.loads(body)
                if not isinstance(result, dict):
                    raise ProtocolFailure(502, "invalid_worker_response")
                return result
        except urllib.error.HTTPError as error:
            try:
                data = json.loads(error.read(8192))
                code = data.get("error", {}).get("code", "worker_request_failed")
                if not isinstance(code, str) or len(code) > 100:
                    code = "worker_request_failed"
            except (ValueError, AttributeError):
                code = "worker_request_failed"
            raise ProtocolFailure(error.code, code) from None
        except (urllib.error.URLError, TimeoutError, OSError):
            raise ProtocolFailure(503, "worker_connection_unavailable") from None
        except (ValueError, UnicodeError):
            raise ProtocolFailure(502, "invalid_worker_response") from None


@dataclass
class WorkerContext:
    client: WorkerClient
    claim: dict[str, Any]
    percent: int = 0
    stage: str = "preparing"
    cancelled: bool = False
    lost_lease: bool = False
    _lock: threading.Lock = field(default_factory=threading.Lock)
    _stop: threading.Event = field(default_factory=threading.Event)
    _thread: threading.Thread | None = None

    def progress(self, percent: int, stage: str) -> None:
        self.check_cancelled()
        with self._lock:
            self.percent = max(self.percent, min(99, percent))
            self.stage = stage
            result = self.client.call(
                "/progress",
                {
                    "progress_percent": self.percent,
                    "current_stage": self.stage,
                },
            )
            self.cancelled = bool(result.get("cancel_requested"))
        self.check_cancelled()

    def check_cancelled(self) -> None:
        if self.cancelled:
            raise JobCancelled()
        if self.lost_lease:
            raise WorkerFailure("worker_lease_lost", "Worker lease is no longer valid")

    def start(self) -> None:
        self.percent = int(self.claim.get("progress_percent", 0))

        def heartbeat() -> None:
            while not self._stop.wait(10):
                try:
                    self.progress(self.percent, self.stage)
                except JobCancelled:
                    return
                except ProtocolFailure as error:
                    if error.status in {401, 403, 404, 409}:
                        self.lost_lease = True
                        return
                except WorkerFailure:
                    return

        self._thread = threading.Thread(
            target=heartbeat, name="studio-heartbeat", daemon=True
        )
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=12)
