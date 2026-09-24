#!/usr/bin/env python3
"""Exercise real Studio mastering, audio deliveries, and truthful stem ZIPs."""

import hashlib
import io
import json
import math
import stat
import time
import wave
import zipfile
from pathlib import Path
from uuid import uuid4

import httpx

ROOT = Path(__file__).resolve().parents[1]
environment = dict(line.split("=", 1) for line in (ROOT / ".env").read_text().splitlines() if line and not line.startswith("#") and "=" in line)
if environment.get("STUDIO_ENV") != "development":
    raise SystemExit("This check runs only in the isolated local development Studio.")
credentials = Path.home() / ".local/share/hg-studio/dev/owner.json"
if stat.S_IMODE(credentials.stat().st_mode) != 0o600:
    raise SystemExit("Owner credential file must be private.")
owner = json.loads(credentials.read_text())


def fixture(frequency: int) -> bytes:
    output = io.BytesIO()
    with wave.open(output, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(22050)
        samples = bytearray()
        for index in range(22050 * 4):
            second = index / 22050
            value = 0.4 * math.sin(2 * math.pi * frequency * second)
            value += 0.12 * math.sin(2 * math.pi * 100 * second) * math.exp(-(second % 0.5) * 40)
            samples.extend(int(value * 20000).to_bytes(2, "little", signed=True))
        stream.writeframes(samples)
    return output.getvalue()


def wait_job(client: httpx.Client, job_id: str, timeout: int = 600) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        response.raise_for_status()
        job = response.json()
        if job["state"] in {"succeeded", "failed", "cancelled"}:
            if job["state"] != "succeeded":
                raise RuntimeError(f"Job {job_id}: {job['state']} {job.get('error_code')}")
            return job
        time.sleep(3)
    raise TimeoutError(job_id)


with httpx.Client(base_url="http://127.0.0.1:3210", timeout=90) as client:
    login = client.post("/api/v1/auth/login", json=owner, headers={"Origin": "http://localhost:3210"})
    login.raise_for_status()
    client.headers.update({"Origin": "http://localhost:3210", "X-CSRF-Token": login.json()["csrf_token"]})
    project = client.post("/api/v1/projects", json={"name": f"Mastering fixture {str(uuid4())[:8]}"})
    project.raise_for_status()
    project_id = project.json()["id"]
    song = client.post(f"/api/v1/projects/{project_id}/songs", json={"title": "Mastering fixture"})
    song.raise_for_status()
    original = fixture(440)
    reference = fixture(660)
    def upload(name: str, data: bytes) -> str:
        response = client.post(f"/api/v1/projects/{project_id}/assets/upload", files={"file": (name, data, "audio/wav")}, data={"song_id": song.json()["id"]})
        response.raise_for_status()
        return response.json()["id"]
    source_id = upload("source.wav", original)
    reference_id = upload("reference.wav", reference)
    master_request = client.post(f"/api/v1/assets/{source_id}/masters", json={"idempotency_key": str(uuid4()), "reference_asset_id": reference_id, "target_lufs": -14, "true_peak_dbtp": -1})
    master_request.raise_for_status()
    master = wait_job(client, master_request.json()["job_id"])
    master_id = master["result_asset_id"]
    master_bytes = client.get(f"/api/v1/assets/{master_id}/download").content
    assert master_bytes[:4] == b"fLaC"
    lineage = client.get(f"/api/v1/assets/{master_id}/lineage").json()["items"]
    assert {row["parent_asset_id"] for row in lineage} == {source_id, reference_id}
    loudnorm = client.post(f"/api/v1/assets/{source_id}/masters", json={"idempotency_key": str(uuid4()), "target_lufs": -16, "true_peak_dbtp": -1})
    loudnorm.raise_for_status()
    wait_job(client, loudnorm.json()["job_id"])
    for fmt, extra, magic in (("wav", {"bit_depth": 16}, b"RIFF"), ("wav", {"bit_depth": 24}, b"RIFF"), ("mp3", {"mp3_bitrate_kbps": 192}, None)):
        request = client.post(f"/api/v1/assets/{master_id}/exports", json={"idempotency_key": str(uuid4()), "format": fmt, **extra})
        request.raise_for_status()
        job = wait_job(client, request.json()["job_id"])
        delivery = client.get(f"/api/v1/assets/{job['result_asset_id']}/download")
        delivery.raise_for_status()
        assert len(delivery.content) > 1000 and (magic is None or delivery.content[:4] == magic)
    stems_request = client.post(f"/api/v1/assets/{source_id}/stem-sets", json={"idempotency_key": str(uuid4())})
    stems_request.raise_for_status()
    stem_set_id = stems_request.json()["stem_set_id"]
    wait_job(client, stems_request.json()["job_id"], 1200)
    package_request = client.post(f"/api/v1/stem-sets/{stem_set_id}/exports", json={"idempotency_key": str(uuid4())})
    package_request.raise_for_status()
    wait_job(client, package_request.json()["job_id"])
    packages = client.get(f"/api/v1/stem-sets/{stem_set_id}/exports").json()["items"]
    assert len(packages) == 1 and set(packages[0]["manifest"]) == {"vocals", "drums", "bass", "other"}
    archive = client.get(f"/api/v1/stem-packages/{packages[0]['id']}/download")
    archive.raise_for_status()
    with zipfile.ZipFile(io.BytesIO(archive.content)) as package:
        assert set(package.namelist()) == {f"{label}.flac" for label in ("vocals", "drums", "bass", "other")}
    preserved = client.get(f"/api/v1/assets/{source_id}/stream")
    preserved.raise_for_status()
    assert hashlib.sha256(preserved.content).digest() == hashlib.sha256(original).digest()
    print(f"Mastering workflow passed: master={master_id}, packages={packages[0]['id']}")
