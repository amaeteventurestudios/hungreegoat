#!/usr/bin/env python3
"""Create isolated private Studio production material without replacing anything."""

from __future__ import annotations

import argparse
import base64
import json
import os
import secrets
import stat
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def private_directory(path: Path) -> None:
    if not path.is_absolute() or any(part.is_symlink() for part in (path, *path.parents)):
        raise ValueError("Production paths must be absolute without symlink components")
    path.mkdir(parents=True, mode=0o700, exist_ok=True)
    if stat.S_IMODE(path.stat().st_mode) != 0o700:
        raise ValueError("Production directories must be mode 0700")


def write_private(path: Path, value: str) -> None:
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
    with os.fdopen(descriptor, "w") as handle:
        handle.write(value)
        handle.flush()
        os.fsync(handle.fileno())


def bootstrap(runtime: Path) -> None:
    if runtime == ROOT or runtime.is_relative_to(ROOT) or ROOT.is_relative_to(runtime):
        raise ValueError("Production runtime must be separate from source")
    private_directory(runtime)
    if (runtime / ".env").exists():
        raise ValueError("Existing production environment is preserved")
    assets = runtime / "assets"
    secrets_root = runtime / "secrets"
    orchestration = runtime / "orchestration"
    for path in (assets, secrets_root, secrets_root / "values", orchestration, runtime / "backups"):
        private_directory(path)
    write_private(secrets_root / "fernet.key", base64.urlsafe_b64encode(secrets.token_bytes(32)).decode())
    for name in ("worker-token", "bootstrap-token"):
        write_private(orchestration / name, secrets.token_hex(32))
    for name in ("windmill-token", "script-hash"):
        write_private(orchestration / name, "")
    write_private(runtime / "backup-passphrase", secrets.token_urlsafe(64) + "\n")
    owner = {"email": "owner@studio.hungreegoat.com", "password": secrets.token_urlsafe(32)}
    write_private(runtime / "owner.json", json.dumps(owner) + "\n")
    values = {
        "STUDIO_ENV": "production",
        "COMPOSE_PROJECT_NAME": "hg-studio-prod",
        "STUDIO_LOG_LEVEL": "INFO",
        "STUDIO_UID": str(os.getuid()),
        "STUDIO_GID": str(os.getgid()),
        "STUDIO_WEB_PORT": "3211",
        "STUDIO_API_PORT": "8311",
        "STUDIO_MONITOR_PORT": "3212",
        "STUDIO_PUBLIC_URL": "https://studio.hungreegoat.com",
        "STUDIO_DB_PASSWORD": secrets.token_hex(32),
        "STUDIO_WINDMILL_DB_PASSWORD": secrets.token_hex(32),
        "STUDIO_ASSET_ROOT": str(assets),
        "STUDIO_SECRET_DIRECTORY": str(secrets_root),
        "STUDIO_ORCHESTRATION_DIRECTORY": str(orchestration),
    }
    write_private(runtime / ".env", "".join(f"{name}={value}\n" for name, value in values.items()))
    print(f"Private Studio production configuration created at {runtime}; no credential values printed")


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--runtime-root", required=True, type=Path)
    args = parser.parse_args()
    bootstrap(args.runtime_root)
