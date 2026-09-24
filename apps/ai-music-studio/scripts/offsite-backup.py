#!/usr/bin/env python3
"""Copy only the newest complete encrypted Studio backup to a separate host.

The gateway's unprivileged home is a second failure domain, not a decryption-key
escrow. No existing gateway service, account, or nginx configuration is changed.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import shlex
import subprocess
import time
from pathlib import Path
from uuid import uuid4

HOST = "hetzner-usg"
REMOTE_ROOT = "/home/hermes-ro/.local/share/hg-studio-backups"
SSH = ["ssh", "-o", "BatchMode=yes", "-o", "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=8", HOST]


def remote(*command: str, check: bool = True, timeout: int = 30) -> subprocess.CompletedProcess[str]:
    return subprocess.run(SSH + [shlex.join(command)], text=True, capture_output=True, check=check, timeout=timeout)


def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def remote_digest(path: str) -> str:
    output = remote("sha256sum", path, timeout=4 * 3600).stdout.strip().split()
    if not output or not re.fullmatch(r"[0-9a-f]{64}", output[0]):
        raise RuntimeError("Remote backup checksum is unavailable")
    return output[0]


def main() -> None:
    os.umask(0o077)
    env_path = Path(os.environ["STUDIO_COMPOSE_ENV_FILE"])
    if not env_path.is_absolute() or env_path.is_symlink():
        raise ValueError("Production environment must be an absolute regular file")
    settings = dict(line.split("=", 1) for line in env_path.read_text().splitlines() if line and not line.startswith("#") and "=" in line)
    if settings.get("COMPOSE_PROJECT_NAME") != "hg-studio-prod":
        raise ValueError("Off-site copy is restricted to the isolated production project")
    source_root = env_path.parent / "backups"
    candidates = sorted((path for path in source_root.glob("studio-*") if path.is_dir() and (path / "manifest.json").is_file()), reverse=True)
    if not candidates:
        raise RuntimeError("No complete encrypted Studio backup exists")
    source = candidates[0]
    if not re.fullmatch(r"studio-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}", source.name):
        raise ValueError("Backup directory name is unsafe")
    manifest = json.loads((source / "manifest.json").read_text())
    if manifest.get("compose_project") != "hg-studio-prod" or not manifest.get("files"):
        raise ValueError("Backup manifest is not a complete production backup")
    expected = {"manifest.json": digest(source / "manifest.json"), **manifest["files"]}
    for name, checksum in expected.items():
        if not re.fullmatch(r"[a-z0-9.-]+", name) or not re.fullmatch(r"[0-9a-f]{64}", checksum):
            raise ValueError("Unsafe backup artifact name or checksum")
        path = source / name
        if not path.is_file() or path.is_symlink() or digest(path) != checksum:
            raise ValueError(f"Local backup artifact failed integrity check: {name}")
    remote("install", "-d", "-m", "700", REMOTE_ROOT)
    if remote("stat", "-c", "%a", REMOTE_ROOT).stdout.strip() != "700":
        raise ValueError("Off-site directory is not mode 0700")
    target = f"{REMOTE_ROOT}/{source.name}"
    def record_verified() -> None:
        stamp = env_path.parent / "offsite-last-ok.json"
        temporary = stamp.with_name(".offsite-last-ok-" + uuid4().hex)
        try:
            temporary.write_text(json.dumps({"backup": source.name, "host": HOST, "checked_at_epoch": time.time()}) + "\n")
            temporary.replace(stamp)
        finally:
            temporary.unlink(missing_ok=True)
    if remote("test", "-e", target, check=False).returncode == 0:
        if any(remote_digest(f"{target}/{name}") != checksum for name, checksum in expected.items()):
            raise ValueError("An existing off-site backup has different content")
        record_verified()
        print(f"Off-site encrypted Studio backup already verified: {source.name}")
        return
    disk = remote("df", "-Pk", REMOTE_ROOT).stdout.splitlines()[-1].split()
    if len(disk) < 4:
        raise RuntimeError("Off-site storage capacity is unavailable")
    free_bytes = int(disk[3]) * 1024
    total_bytes = sum((source / name).stat().st_size for name in expected)
    if free_bytes - total_bytes < 5 * 1024**3:
        raise RuntimeError("Off-site copy would leave less than 5 GiB free on the shared gateway")
    staging = f"{REMOTE_ROOT}/.incoming-{uuid4().hex}"
    remote("install", "-d", "-m", "700", staging)
    transfer_timeout = min(4 * 3600, max(180, 180 + total_bytes // (2 * 1024 * 1024)))
    subprocess.run(["rsync", "-a", "--chmod=Du=rwx,Dgo=,Fu=rw,Fgo=", "-e", "ssh -o BatchMode=yes -o StrictHostKeyChecking=yes", f"{source}/", f"{HOST}:{staging}/"], check=True, timeout=transfer_timeout)
    if any(remote_digest(f"{staging}/{name}") != checksum for name, checksum in expected.items()):
        raise ValueError("Off-site transfer failed checksum verification; staging retained")
    remote("mv", "-T", staging, target)
    record_verified()
    print(f"Off-site encrypted Studio backup copied and verified: {source.name} ({len(expected)} files)")


if __name__ == "__main__":
    main()
