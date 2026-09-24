#!/usr/bin/env python3
"""Encrypted, atomic Studio backup and isolated database restore verification.

Run from the canonical Studio checkout. This script never touches sibling apps or
existing broadcast volumes. The passphrase file must be backed up separately.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import stat
import subprocess
import tarfile
from datetime import UTC, datetime
from pathlib import Path
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ["bash", str(ROOT / "scripts/compose.sh")]
DATABASES = (("studio", "studio-postgres", "studio"), ("windmill", "studio-windmill-postgres", "windmill"))
BASE_ARTIFACTS = {"studio.dump.gpg", "windmill.dump.gpg", "assets.tar.gz.gpg", "secrets.tar.gz.gpg", "orchestration.tar.gz.gpg"}


def config() -> dict[str, str]:
    env_file = Path(os.environ.get("STUDIO_COMPOSE_ENV_FILE", str(ROOT / ".env")))
    return dict(line.split("=", 1) for line in env_file.read_text().splitlines() if line and not line.startswith("#") and "=" in line)


def private_file(path: Path) -> None:
    info = path.lstat()
    if not stat.S_ISREG(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o600:
        raise ValueError("Backup passphrase must be a regular mode-0600 file")
    if not 32 <= info.st_size <= 4096:
        raise ValueError("Backup passphrase has an unsupported length")


def private_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True, mode=0o700)
    info = path.lstat()
    if not stat.S_ISDIR(info.st_mode) or stat.S_IMODE(info.st_mode) != 0o700:
        raise ValueError("Backup directory must be private mode 0700")


def encrypted_stream(source: list[str], destination: Path, key: Path) -> str:
    temporary = destination.with_name("." + destination.name + "." + str(uuid4()))
    command = ["gpg", "--batch", "--yes", "--pinentry-mode", "loopback", "--passphrase-file", str(key), "--symmetric", "--cipher-algo", "AES256", "--compress-algo", "none", "--output", str(temporary)]
    try:
        with subprocess.Popen(source, stdout=subprocess.PIPE, stderr=subprocess.PIPE) as producer:
            with subprocess.Popen(command, stdin=producer.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE) as cipher:
                assert producer.stdout is not None
                producer.stdout.close()
                cipher_error = cipher.communicate()[1]
                source_error = producer.communicate()[1]
                if producer.returncode or cipher.returncode:
                    raise RuntimeError(f"Backup stream failed: source={producer.returncode}, cipher={cipher.returncode}, detail={(source_error or cipher_error)[:300].decode(errors='replace')}")
        os.chmod(temporary, 0o600)
        with temporary.open("rb") as handle:
            digest = hashlib.file_digest(handle, "sha256").hexdigest()
        temporary.replace(destination)
        return digest
    finally:
        temporary.unlink(missing_ok=True)


def backup(target: Path, key: Path) -> Path:
    private_file(key)
    private_directory(target)
    environment = config()
    required = {"STUDIO_ASSET_ROOT": "assets", "STUDIO_SECRET_DIRECTORY": "secrets", "STUDIO_ORCHESTRATION_DIRECTORY": "orchestration"}
    sources = {label: Path(environment[name]) for name, label in required.items()}
    for source in sources.values():
        if not source.is_absolute() or not source.is_dir() or source.is_symlink() or target == source or target.is_relative_to(source):
            raise ValueError("Backup source or target is unsafe")
    stamp = datetime.now(UTC).strftime("%Y%m%dT%H%M%SZ")
    directory = target / f"studio-{stamp}-{str(uuid4())[:8]}"
    directory.mkdir(mode=0o700)
    try:
        files: dict[str, str] = {}
        for label, service, database in DATABASES:
            name = f"{label}.dump.gpg"
            files[name] = encrypted_stream(COMPOSE + ["exec", "-T", service, "pg_dump", "-U", database, "-d", database, "-Fc"], directory / name, key)
        for label, source in sources.items():
            name = f"{label}.tar.gz.gpg"
            files[name] = encrypted_stream(["tar", "-czf", "-", "-C", str(source), "."], directory / name, key)
        if environment.get("COMPOSE_PROJECT_NAME") == "hg-studio-prod":
            # SQLite's .dump reads a consistent transaction while Kuma remains live.
            name = "uptime-kuma.sql.gpg"
            files[name] = encrypted_stream(COMPOSE + ["exec", "-T", "studio-uptime-kuma", "sqlite3", "/app/data/kuma.db", ".dump"], directory / name, key)
            # Keep restore-critical credentials, but never include this backup's passphrase.
            name = "config.tar.gz.gpg"
            configuration = Path(os.environ["STUDIO_COMPOSE_ENV_FILE"]).parent
            files[name] = encrypted_stream(["tar", "-czf", "-", "-C", str(configuration), ".env", "owner.json", "monitoring-admin-password", "gateway/studio-tunnel-ed25519", "gateway/studio-tunnel-ed25519.pub"], directory / name, key)
        manifest = {"created_at": datetime.now(UTC).isoformat(), "compose_project": environment.get("COMPOSE_PROJECT_NAME"), "format": 1, "files": files}
        manifest_path = directory / "manifest.json"
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
        os.chmod(manifest_path, 0o600)
        print(f"Studio encrypted backup complete: {directory} ({len(files)} verified artifacts)")
        return directory
    except BaseException:
        # An incomplete directory is retained for diagnosis, never presented as a valid backup.
        raise


def decrypt_command(path: Path, key: Path) -> list[str]:
    return ["gpg", "--batch", "--quiet", "--pinentry-mode", "loopback", "--passphrase-file", str(key), "--decrypt", str(path)]


def verify(directory: Path, key: Path, restore_test: bool) -> None:
    private_file(key)
    manifest = json.loads((directory / "manifest.json").read_text())
    if set(manifest["files"]) not in (BASE_ARTIFACTS, BASE_ARTIFACTS | {"uptime-kuma.sql.gpg"}, BASE_ARTIFACTS | {"uptime-kuma.sql.gpg", "config.tar.gz.gpg"}):
        raise ValueError("Backup manifest is incomplete")
    service_by_dump = {f"{label}.dump.gpg": service for label, service, _ in DATABASES}
    for name, expected in manifest["files"].items():
        path = directory / name
        if not path.is_file() or path.is_symlink():
            raise ValueError("Backup artifact is missing or unsafe")
        with path.open("rb") as handle:
            if hashlib.file_digest(handle, "sha256").hexdigest() != expected:
                raise ValueError("Backup artifact checksum mismatch")
        if name == "uptime-kuma.sql.gpg":
            with subprocess.Popen(decrypt_command(path, key), stdout=subprocess.PIPE, stderr=subprocess.PIPE) as cipher:
                assert cipher.stdout is not None
                restored = subprocess.run(["docker", "run", "--rm", "-i", "--network", "none", "--entrypoint", "sqlite3", "louislam/uptime-kuma:2.5.5", "-bail", ":memory:"], stdin=cipher.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=False)
                cipher.stdout.close()
                if cipher.wait() or restored.returncode:
                    raise RuntimeError("Uptime Kuma backup cannot be restored into an isolated SQLite database")
            print("Verified uptime-kuma.sql.gpg: isolated SQLite restore passed")
        elif name.endswith(".tar.gz.gpg"):
            with subprocess.Popen(decrypt_command(path, key), stdout=subprocess.PIPE, stderr=subprocess.PIPE) as cipher:
                assert cipher.stdout is not None
                with tarfile.open(fileobj=cipher.stdout, mode="r|gz") as archive:
                    count = 0
                    for member in archive:
                        if member.name.startswith("/") or ".." in Path(member.name).parts:
                            raise ValueError("Backup archive has unsafe path")
                        if member.isfile():
                            extracted = archive.extractfile(member)
                            assert extracted is not None
                            while extracted.read(1024 * 1024):
                                pass
                        count += 1
                if cipher.wait() != 0:
                    raise RuntimeError("Backup decryption failed")
            print(f"Verified {name}: {count} archive entries")
        else:
            with subprocess.Popen(decrypt_command(path, key), stdout=subprocess.PIPE, stderr=subprocess.PIPE) as cipher:
                assert cipher.stdout is not None
                listing = subprocess.run(COMPOSE + ["exec", "-T", service_by_dump[name], "pg_restore", "--list"], stdin=cipher.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=False)
                cipher.stdout.close()
                if cipher.wait() or listing.returncode:
                    raise RuntimeError("Database backup cannot be decoded")
            print(f"Verified {name}: PostgreSQL archive readable")
    if restore_test:
        for label, service, user in DATABASES:
            database = "studio_restore_" + uuid4().hex[:16]
            subprocess.run(COMPOSE + ["exec", "-T", service, "createdb", "-U", user, database], check=True, stdout=subprocess.DEVNULL)
            try:
                with subprocess.Popen(decrypt_command(directory / f"{label}.dump.gpg", key), stdout=subprocess.PIPE, stderr=subprocess.PIPE) as cipher:
                    assert cipher.stdout is not None
                    restored = subprocess.run(COMPOSE + ["exec", "-T", service, "pg_restore", "--exit-on-error", "--no-owner", "--no-privileges", "-U", user, "-d", database], stdin=cipher.stdout, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE, check=False)
                    cipher.stdout.close()
                    if cipher.wait() or restored.returncode:
                        raise RuntimeError(f"Isolated {label} restore failed: {restored.stderr[:300].decode(errors='replace')}")
                count = subprocess.check_output(COMPOSE + ["exec", "-T", service, "psql", "-U", user, "-d", database, "-At", "-c", "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'"], text=True).strip()
                if int(count) < 1:
                    raise RuntimeError("Restored database has no public tables")
                print(f"Restored {label} into disposable database ({count} public tables)")
            finally:
                subprocess.run(COMPOSE + ["exec", "-T", service, "dropdb", "-U", user, "--if-exists", "--force", database], check=True, stdout=subprocess.DEVNULL)
    print("Studio backup verification passed")


if __name__ == "__main__":
    os.umask(0o077)
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("command", choices=("backup", "verify"))
    parser.add_argument("--backup-root", type=Path, required=True)
    parser.add_argument("--passphrase-file", type=Path, required=True)
    parser.add_argument("--backup-directory", type=Path)
    parser.add_argument("--restore-test", action="store_true")
    args = parser.parse_args()
    if args.command == "backup":
        backup(args.backup_root, args.passphrase_file)
    else:
        if args.backup_directory is None:
            parser.error("verify requires --backup-directory")
        verify(args.backup_directory, args.passphrase_file, args.restore_test)
