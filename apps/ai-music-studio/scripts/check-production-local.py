#!/usr/bin/env python3
"""End-to-end production-configured API/worker smoke over its loopback port."""

import argparse
import json
import hashlib
import io
import math
import os
import stat
import subprocess
import time
import wave
from http.cookies import SimpleCookie
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--restart", action="store_true", help="also verify session and audio survive Studio-only database/API restart")
args = parser.parse_args()
env_file = Path(os.environ["STUDIO_COMPOSE_ENV_FILE"])
settings = dict(line.split("=", 1) for line in env_file.read_text().splitlines() if line and not line.startswith("#") and "=" in line)
if settings.get("STUDIO_ENV") != "production" or settings.get("COMPOSE_PROJECT_NAME") != "hg-studio-prod":
    raise SystemExit("This smoke test requires the isolated production Studio project.")
owner_path = env_file.parent / "owner.json"
if stat.S_IMODE(owner_path.stat().st_mode) != 0o600:
    raise SystemExit("Owner credential file is not private.")
owner = json.loads(owner_path.read_text())
origin = settings["STUDIO_PUBLIC_URL"]
url = f"http://127.0.0.1:{settings['STUDIO_WEB_PORT']}"

with httpx.Client(base_url=url, timeout=10, trust_env=False) as client:
    ready = client.get("/api/v1/health/ready")
    ready.raise_for_status()
    assert ready.json()["status"] == "ok"
    shell = client.get("/")
    shell.raise_for_status()
    assert "DENY" == shell.headers["x-frame-options"]
    assert shell.headers["x-content-type-options"] == "nosniff"
    login = client.post("/api/v1/auth/login", json=owner, headers={"Origin": origin})
    login.raise_for_status()
    cookie_header = login.headers.get("set-cookie", "")
    assert "Secure" in cookie_header and "HttpOnly" in cookie_header
    cookie = SimpleCookie()
    cookie.load(cookie_header)
    token = cookie["__Host-studio_session"].value
    headers = {"Origin": origin, "X-CSRF-Token": login.json()["csrf_token"], "Cookie": f"__Host-studio_session={token}"}
    session = client.get("/api/v1/auth/session", headers=headers)
    session.raise_for_status()
    assert session.json()["authenticated"] is True
    project = client.post("/api/v1/projects", json={"name": f"Production smoke {str(uuid4())[:8]}"}, headers=headers)
    project.raise_for_status()
    project_id = project.json()["id"]
    song = client.post(f"/api/v1/projects/{project_id}/songs", json={"title": "Production audio smoke"}, headers=headers)
    song.raise_for_status()
    audio = io.BytesIO()
    with wave.open(audio, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(22050)
        output.writeframes(b"".join(int(10000 * math.sin(2 * math.pi * 440 * index / 22050)).to_bytes(2, "little", signed=True) for index in range(22050 * 2)))
    source = client.post(f"/api/v1/projects/{project_id}/assets/upload", files={"file": ("production-smoke.wav", audio.getvalue(), "audio/wav")}, data={"song_id": song.json()["id"]}, headers=headers)
    source.raise_for_status()
    source_id = source.json()["id"]
    request = client.post(f"/api/v1/assets/{source_id}/masters", json={"idempotency_key": str(uuid4()), "target_lufs": -14, "true_peak_dbtp": -1}, headers=headers)
    request.raise_for_status()
    job_id = request.json()["job_id"]
    deadline = time.monotonic() + 180
    while time.monotonic() < deadline:
        job = client.get(f"/api/v1/jobs/{job_id}", headers=headers)
        job.raise_for_status()
        if job.json()["state"] in {"succeeded", "failed", "cancelled"}:
            assert job.json()["state"] == "succeeded", job.json()["error_code"]
            master_id = job.json()["result_asset_id"]
            break
        time.sleep(2)
    else:
        raise TimeoutError("Production diagnostic did not finish")
    mastered = client.get(f"/api/v1/assets/{master_id}/download", headers=headers)
    mastered.raise_for_status()
    assert mastered.content.startswith(b"fLaC")
    preserved = client.get(f"/api/v1/assets/{source_id}/download", headers=headers)
    preserved.raise_for_status()
    assert hashlib.sha256(preserved.content).digest() == hashlib.sha256(audio.getvalue()).digest()
    if args.restart:
        subprocess.run(["bash", str(ROOT / "scripts/compose.sh"), "restart", "studio-postgres", "studio-api"], check=True, stdout=subprocess.DEVNULL)
        deadline = time.monotonic() + 90
        while time.monotonic() < deadline:
            try:
                if client.get("/api/v1/health/ready").status_code == 200:
                    break
            except httpx.HTTPError:
                pass
            time.sleep(2)
        else:
            raise TimeoutError("Production API did not recover after restart")
        assert client.get("/api/v1/auth/session", headers=headers).json()["authenticated"] is True
        assert client.get(f"/api/v1/assets/{source_id}/download", headers=headers).content == audio.getvalue()
        assert client.get(f"/api/v1/assets/{master_id}/download", headers=headers).content == mastered.content
        while time.monotonic() < deadline:
            health = subprocess.run(["python3", str(ROOT / "scripts/monitor-studio.py")], capture_output=True, check=False)
            if health.returncode == 0:
                break
            time.sleep(2)
        else:
            raise TimeoutError("Production container health did not settle after restart")
    logout = client.post("/api/v1/auth/logout", headers=headers)
    assert logout.status_code == 204
    assert client.get("/api/v1/auth/session", headers=headers).json()["authenticated"] is False
    print(f"Production-configured loopback smoke passed: project={project_id}, master={master_id}, job={job_id}")
