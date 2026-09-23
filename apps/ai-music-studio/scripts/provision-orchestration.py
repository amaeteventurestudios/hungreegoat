#!/usr/bin/env python3
"""Bootstrap the local Windmill workspace and fixed Studio script.

Windmill OSS cannot create ordinary users or service accounts. A normal account
must therefore mint and place the restricted runtime token before this helper can
finish. The temporary bootstrap superadmin is never used as that runtime identity.
"""

import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import time
import urllib.error
import urllib.request
from uuid import uuid4


ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ["bash", str(ROOT / "scripts/compose.sh")]
WORKSPACE = "studio"
RUNTIME_SCOPE = "jobs:run:scripts:f/studio/execute"


class RuntimeTokenRequired(RuntimeError):
    pass


def private(path: Path, empty: bool = False) -> str:
    if not path.is_absolute() or any(part.is_symlink() for part in (path, *path.parents)):
        raise ValueError
    descriptor = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)
    with os.fdopen(descriptor, "r") as file:
        metadata = os.fstat(file.fileno())
        if not stat.S_ISREG(metadata.st_mode) or stat.S_IMODE(metadata.st_mode) != 0o600:
            raise ValueError
        value = file.read(4097).strip()
    if not value and not empty:
        raise ValueError
    return value


def write_private(path: Path, value: str) -> None:
    temporary = path.with_name("." + path.name + "." + uuid4().hex)
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    try:
        with os.fdopen(descriptor, "w") as file:
            file.write(value + "\n")
            file.flush()
            os.fsync(file.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        temporary.unlink(missing_ok=True)


def compose(environment: dict[str, str], *arguments: str) -> None:
    result = subprocess.run(COMPOSE + list(arguments), env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, text=True)
    if result.returncode:
        raise RuntimeError


def server_ip() -> str:
    container = subprocess.check_output(COMPOSE + ["ps", "-q", "studio-windmill"], text=True).strip()
    networks = json.loads(subprocess.check_output(
        ["docker", "inspect", "--format", "{{json .NetworkSettings.Networks}}", container], text=True
    ))
    return next(iter(networks.values()))["IPAddress"]


def request(origin: str, path: str, token: str, payload: dict | None = None) -> tuple[int, str]:
    data = None if payload is None else json.dumps(payload).encode()
    headers = {"Authorization": "Bearer " + token}
    if data is not None:
        headers["Content-Type"] = "application/json"
    call = urllib.request.Request(origin + path, data=data, headers=headers, method="POST" if data else "GET")
    try:
        with urllib.request.urlopen(call, timeout=8) as response:
            return response.status, response.read(65537).decode()
    except urllib.error.HTTPError as error:
        return error.code, error.read(65537).decode(errors="replace")
    except (urllib.error.URLError, TimeoutError):
        raise RuntimeError from None


def acceptable(status: int, body: str, values: set[int]) -> bool:
    if status in values:
        return True
    lower = body.lower()
    return status in {400, 409} and any(word in lower for word in ("already", "exists", "conflict"))


def main() -> None:
    values = dict(line.split("=", 1) for line in (ROOT / ".env").read_text().splitlines()
                  if line and not line.startswith("#") and "=" in line)
    if values.get("STUDIO_ENV") != "development":
        raise SystemExit("Orchestration provisioning is restricted to local development.")
    directory = Path(values["STUDIO_ORCHESTRATION_DIRECTORY"])
    if stat.S_IMODE(directory.stat().st_mode) != 0o700:
        raise SystemExit("Private orchestration directory is not mode 0700.")
    try:
        bootstrap = private(directory / "bootstrap-token")
        existing_runtime = private(directory / "windmill-token", empty=True)
        existing_hash = private(directory / "script-hash", empty=True)
    except (KeyError, OSError, ValueError):
        raise SystemExit("Private orchestration material is unavailable.") from None
    environment = dict(os.environ)
    environment["STUDIO_WINDMILL_BOOTSTRAP_TOKEN"] = bootstrap
    try:
        compose(environment, "up", "-d", "studio-windmill-postgres", "studio-windmill")
        origin = "http://" + server_ip() + ":8000"
        for _ in range(45):
            try:
                status, _ = request(origin, "/api/workspaces/exists", bootstrap, {"id": WORKSPACE})
                if status in {200, 401, 403}:
                    break
            except RuntimeError:
                pass
            time.sleep(1)
        else:
            raise RuntimeError
        status, body = request(origin, "/api/workspaces/create", bootstrap, {
            "id": WORKSPACE, "name": "AI Music Studio"
        })
        if not acceptable(status, body, {200, 201}):
            raise RuntimeError
        content = Path(ROOT / "infra/windmill/execute.py").read_text()
        status, body = request(origin, f"/api/w/{WORKSPACE}/scripts/create", bootstrap, {
            "path": "f/studio/execute", "summary": "Run a fixed Studio job", "content": content,
            "language": "python3", "tag": "studio-ai", "timeout": 180,
        })
        if status not in {200, 201}:
            # An existing script is safe only if a saved hash already identifies it.
            if not existing_hash or not acceptable(status, body, set()):
                raise RuntimeError
            script_hash = existing_hash
        else:
            script_hash = body.strip().strip('"')
        if not script_hash or len(script_hash) > 32 or not all(c in "0123456789abcdef" for c in script_hash.lower()):
            raise RuntimeError
        write_private(directory / "script-hash", script_hash)
        if not existing_runtime:
            raise RuntimeTokenRequired(
                "Windmill workspace/script prepared. A normal non-superadmin Windmill account "
                f"must place a 0600 runtime token scoped only to {RUNTIME_SCOPE} in "
                "windmill-token before dispatcher startup."
            )
    except RuntimeTokenRequired as error:
        pending = str(error)
    except (RuntimeError, OSError, ValueError):
        pending = "Windmill provisioning failed; inspect Studio-only sanitized service logs."
    else:
        pending = None
    finally:
        environment.pop("STUDIO_WINDMILL_BOOTSTRAP_TOKEN", None)
        try:
            compose(environment, "up", "-d", "--force-recreate", "studio-windmill")
        except RuntimeError:
            raise SystemExit("Windmill provisioning finished but bootstrap removal could not be verified.") from None
    if pending:
        raise SystemExit(pending)
    print("Private Windmill workspace and fixed Studio script are prepared.")


if __name__ == "__main__":
    main()
