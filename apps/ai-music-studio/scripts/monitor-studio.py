#!/usr/bin/env python3
"""Read-only Studio health probe for a timer, Uptime Kuma, or an operator."""

from __future__ import annotations

import argparse
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMPOSE = ["bash", str(ROOT / "scripts/compose.sh")]
REQUIRED = {"studio-api", "studio-web", "studio-postgres", "studio-windmill", "studio-windmill-postgres", "studio-worker", "studio-dispatcher"}


def environment() -> dict[str, str]:
    env_file = Path(os.environ.get("STUDIO_COMPOSE_ENV_FILE", str(ROOT / ".env")))
    return dict(line.split("=", 1) for line in env_file.read_text().splitlines() if line and not line.startswith("#") and "=" in line)


def http_status(url: str) -> int:
    with urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": "StudioMonitor/1"}), timeout=8) as response:
        response.read(64 * 1024)
        return response.status


def sql(service: str, user: str, database: str, query: str) -> str:
    return subprocess.check_output(COMPOSE + ["exec", "-T", service, "psql", "-U", user, "-d", database, "-At", "-c", query], text=True, timeout=10).strip()


def check(public: bool) -> dict:
    env = environment()
    production = env.get("COMPOSE_PROJECT_NAME") == "hg-studio-prod"
    required = REQUIRED | ({"studio-uptime-kuma"} if production else set())
    checks: dict[str, object] = {}
    failures: list[str] = []
    try:
        output = subprocess.check_output(COMPOSE + ["ps", "--format", "json"], text=True, timeout=15)
        services = {row["Service"]: row for row in (json.loads(line) for line in output.splitlines() if line)}
        for name in sorted(required):
            row = services.get(name)
            healthy = bool(row and row["State"] == "running" and row.get("Health") not in {"unhealthy", "starting"})
            checks[name] = "ok" if healthy else "unavailable"
            if not healthy:
                failures.append(name)
    except (OSError, ValueError, subprocess.SubprocessError):
        failures.append("compose")
        checks["compose"] = "unavailable"
    endpoints = [("web_http", f"http://127.0.0.1:{env.get('STUDIO_WEB_PORT', '3210')}/"), ("api_ready", f"http://127.0.0.1:{env.get('STUDIO_API_PORT', '8310')}/api/v1/health/ready")]
    if production:
        endpoints.append(("monitor_http", f"http://127.0.0.1:{env.get('STUDIO_MONITOR_PORT', '3212')}/"))
    for label, url in endpoints:
        try:
            status = http_status(url)
            checks[label] = status
            if status != 200:
                failures.append(label)
        except (OSError, urllib.error.URLError):
            checks[label] = "unavailable"
            failures.append(label)
    try:
        seconds = int(sql("studio-windmill-postgres", "windmill", "windmill", "SELECT coalesce(round(extract(epoch from now()-max(ping_at)))::int,999999) FROM worker_ping WHERE worker_group='studio'"))
        checks["worker_ping_age_seconds"] = seconds
        if seconds > 60:
            failures.append("worker_ping")
    except (OSError, ValueError, subprocess.SubprocessError):
        checks["worker_ping_age_seconds"] = None
        failures.append("worker_ping")
    try:
        providers = sql("studio-postgres", "studio", "studio", "SELECT coalesce(string_agg(provider || ':' || health_status, ',' ORDER BY provider),'') FROM provider_configs WHERE enabled")
        checks["enabled_provider_health"] = providers or "none_configured"
    except (OSError, subprocess.SubprocessError):
        checks["enabled_provider_health"] = "unavailable"
        failures.append("provider_state")
    asset_root = Path(env["STUDIO_ASSET_ROOT"])
    try:
        usage = shutil.disk_usage(asset_root)
        checks["storage_free_gib"] = round(usage.free / 1024**3, 2)
        if usage.free < max(5 * 1024**3, usage.total * 0.1):
            failures.append("storage_free")
    except OSError:
        checks["storage_free_gib"] = None
        failures.append("storage_free")
    if production:
        backup_root = Path(os.environ["STUDIO_COMPOSE_ENV_FILE"]).parent / "backups"
        completed = [path / "manifest.json" for path in backup_root.glob("studio-*") if (path / "manifest.json").is_file()]
        age_hours = round((time.time() - max(path.stat().st_mtime for path in completed)) / 3600, 1) if completed else None
        checks["latest_backup_age_hours"] = age_hours
        if age_hours is None or age_hours > 36:
            failures.append("backup_recency")
        try:
            offsite = json.loads((backup_root.parent / "offsite-last-ok.json").read_text())
            offsite_age = round((time.time() - float(offsite["checked_at_epoch"])) / 3600, 1)
            if offsite.get("host") != "hetzner-usg" or offsite_age < 0 or offsite_age > 36:
                failures.append("offsite_backup_recency")
        except (OSError, ValueError, KeyError, TypeError):
            offsite_age = None
            failures.append("offsite_backup_recency")
        checks["offsite_backup_age_hours"] = offsite_age
    if public:
        try:
            status = http_status("https://studio.hungreegoat.com/api/v1/health/ready")
            checks["public_https"] = status
            if status != 200:
                failures.append("public_https")
        except (OSError, urllib.error.URLError):
            checks["public_https"] = "unavailable"
            failures.append("public_https")
    return {"status": "ok" if not failures else "degraded", "checks": checks, "failures": failures}


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--public", action="store_true", help="also require the production HTTPS endpoint")
    args = parser.parse_args()
    result = check(args.public)
    print(json.dumps(result, sort_keys=True))
    sys.exit(0 if result["status"] == "ok" else 1)
