#!/usr/bin/env python3
"""Bootstrap the local Windmill workspace and fixed Studio script.

Windmill OSS cannot create ordinary users or service accounts in this deployment.
A normal, non-superadmin user token is nevertheless the supported least-privilege
runtime credential; it must be minted through an established identity lifecycle
and placed before this helper can finish. The temporary bootstrap superadmin is
never used as that runtime identity.
"""

import json
import hashlib
import os
from pathlib import Path
import secrets
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
RUNTIME_EMAIL = "studio-dispatcher@windmill.local"
RUNTIME_USERNAME = "studio-dispatcher"
RUNTIME_LABEL = "studio-dispatcher"


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


def provision_runtime_identity(environment: dict[str, str]) -> str:
    """Create the isolated development identity from Windmill's documented schema.

    The pinned OSS server deliberately disables its global user-creation HTTP
    handler. This local-only bootstrap has direct ownership of the dedicated
    Windmill database and creates the minimum records consumed by its auth
    layer: a non-admin workspace membership and one path-scoped, hashed token.
    It never creates a password or a service account and never writes a
    superadmin token to the runtime credential file.
    """
    token = secrets.token_hex(32)
    token_hash = hashlib.sha256(token.encode()).hexdigest()
    token_prefix = token[:10]
    sql = f"""BEGIN;
INSERT INTO usr (workspace_id, username, email, is_admin, operator, disabled, is_service_account)
VALUES ('{WORKSPACE}', '{RUNTIME_USERNAME}', '{RUNTIME_EMAIL}', false, false, false, false)
ON CONFLICT (workspace_id, username) DO UPDATE SET
  email = EXCLUDED.email, is_admin = false, operator = false, disabled = false, is_service_account = false;
DELETE FROM token WHERE email = '{RUNTIME_EMAIL}' AND label = '{RUNTIME_LABEL}';
INSERT INTO token
  (token_hash, token_prefix, token, email, label, expiration, super_admin, scopes, workspace_id, read_only)
VALUES
  ('{token_hash}', '{token_prefix}', NULL, '{RUNTIME_EMAIL}', '{RUNTIME_LABEL}', now() + interval '30 days', false,
   ARRAY['{RUNTIME_SCOPE}'], '{WORKSPACE}', false);
COMMIT;
"""
    result = subprocess.run(
        COMPOSE + [
            "exec", "-T", "studio-windmill-postgres", "psql", "-X", "-q",
            "-v", "ON_ERROR_STOP=1", "-U", "windmill", "-d", "windmill",
        ],
        env=environment,
        input=sql,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
    if result.returncode:
        raise RuntimeError
    return token


def configure_runtime_resources(environment: dict[str, str]) -> None:
    """Allow the fixed tag and read-only RLS visibility for the runtime identity."""
    result = subprocess.run(
        COMPOSE + [
            "exec", "-T", "studio-windmill-postgres", "psql", "-X", "-q",
            "-v", "ON_ERROR_STOP=1", "-U", "windmill", "-d", "windmill",
        ],
        env=environment,
        input=f"""INSERT INTO global_settings (name, value)
VALUES ('custom_tags', '[\"chromium\", \"studio-ai\"]'::jsonb)
ON CONFLICT (name) DO UPDATE SET
  value = CASE WHEN global_settings.value ? 'studio-ai' THEN global_settings.value
               ELSE global_settings.value || '\"studio-ai\"'::jsonb END,
  updated_at = now();
UPDATE script
SET extra_perms = COALESCE(extra_perms, '{{}}'::jsonb)
                  || jsonb_build_object('u/{RUNTIME_USERNAME}', false)
WHERE workspace_id = '{WORKSPACE}' AND path = 'f/studio/execute'
  AND deleted = false AND archived = false;
""",
        stdout=subprocess.DEVNULL,
        stderr=subprocess.PIPE,
        text=True,
    )
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
    env_file = Path(os.environ.get("STUDIO_COMPOSE_ENV_FILE", str(ROOT / ".env")))
    if not env_file.is_absolute() or env_file.is_symlink():
        raise SystemExit("Studio environment path must be an absolute regular file.")
    values = dict(line.split("=", 1) for line in env_file.read_text().splitlines()
                  if line and not line.startswith("#") and "=" in line)
    if values.get("STUDIO_ENV") not in {"development", "production"}:
        raise SystemExit("Orchestration provisioning requires an isolated Studio environment.")
    if values.get("STUDIO_ENV") == "production" and (values.get("COMPOSE_PROJECT_NAME") != "hg-studio-prod" or values.get("STUDIO_PUBLIC_URL") != "https://studio.hungreegoat.com"):
        raise SystemExit("Production Studio configuration is not isolated or has the wrong origin.")
    directory = Path(values["STUDIO_ORCHESTRATION_DIRECTORY"])
    if directory.is_symlink() or stat.S_IMODE(directory.stat().st_mode) != 0o700:
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
        configure_runtime_resources(environment)
        if not existing_runtime:
            existing_runtime = provision_runtime_identity(environment)
            write_private(directory / "windmill-token", existing_runtime)
        status, _ = request(
            origin,
            f"/api/w/{WORKSPACE}/jobs_u/get/{uuid4()}",
            existing_runtime,
        )
        if status != 404:
            raise RuntimeError
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
