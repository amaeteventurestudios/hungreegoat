#!/usr/bin/env python3
"""Real leased Demucs separation and FFmpeg mix against the local Studio."""

import hashlib
import io
import json
import math
import stat
import time
import wave
from pathlib import Path
from uuid import uuid4

import httpx

root = Path(__file__).resolve().parents[1]
environment = dict(line.split("=", 1) for line in (root / ".env").read_text().splitlines() if line and not line.startswith("#") and "=" in line)
if environment.get("STUDIO_ENV") != "development":
    raise SystemExit("This check runs only in the isolated local development Studio.")
credentials = Path.home() / ".local/share/hg-studio/dev/owner.json"
if stat.S_IMODE(credentials.stat().st_mode) != 0o600:
    raise SystemExit("Owner credential file must be private.")
owner = json.loads(credentials.read_text())


def fixture() -> bytes:
    signal = io.BytesIO()
    with wave.open(signal, "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(22050)
        frames = bytearray()
        for index in range(22050 * 4):
            second = index / 22050
            beat = second % 0.5
            drum = math.sin(2 * math.pi * 100 * second) * math.exp(-beat * 45)
            bass = math.sin(2 * math.pi * 110 * second) * 0.3
            vocal = math.sin(2 * math.pi * 440 * second) * 0.15
            sample = int(max(-1, min(1, drum + bass + vocal)) * 14000)
            frames.extend(sample.to_bytes(2, "little", signed=True))
        output.writeframes(frames)
    return signal.getvalue()


def await_job(client: httpx.Client, job_id: str, timeout: int = 1200) -> dict:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        response.raise_for_status()
        job = response.json()
        if job["state"] in {"succeeded", "failed", "cancelled"}:
            if job["state"] != "succeeded":
                raise RuntimeError(f"Studio job {job_id} ended {job['state']}: {job['error_code']}")
            return job
        time.sleep(5)
    raise TimeoutError(f"Studio job {job_id} did not finish")


with httpx.Client(base_url="http://127.0.0.1:3210", timeout=60) as client:
    login = client.post("/api/v1/auth/login", json=owner, headers={"Origin": "http://localhost:3210"})
    login.raise_for_status()
    client.headers.update({"Origin": "http://localhost:3210", "X-CSRF-Token": login.json()["csrf_token"]})
    project = client.post("/api/v1/projects", json={"name": f"Stem workflow fixture {str(uuid4())[:8]}"})
    project.raise_for_status()
    project_id = project.json()["id"]
    song = client.post(f"/api/v1/projects/{project_id}/songs", json={"title": "Four source fixture"})
    song.raise_for_status()
    original = fixture()
    upload = client.post(f"/api/v1/projects/{project_id}/assets/upload", files={"file": ("stem-fixture.wav", original, "audio/wav")}, data={"song_id": song.json()["id"]})
    upload.raise_for_status()
    source_id = upload.json()["id"]
    request = client.post(f"/api/v1/assets/{source_id}/stem-sets", json={"idempotency_key": str(uuid4())})
    request.raise_for_status()
    await_job(client, request.json()["job_id"])
    stem_set_id = request.json()["stem_set_id"]
    stem_set = client.get(f"/api/v1/stem-sets/{stem_set_id}")
    stem_set.raise_for_status()
    stems = stem_set.json()["stems"]
    if {stem["label"] for stem in stems} != {"vocals", "drums", "bass", "other"}:
        raise AssertionError("Demucs did not produce all four stems")
    for stem in stems:
        lineage = client.get(f"/api/v1/assets/{stem['asset_id']}/lineage")
        lineage.raise_for_status()
        if not any(row["parent_asset_id"] == source_id for row in lineage.json()["items"]):
            raise AssertionError("A stem is missing source lineage")
    mix = client.post(f"/api/v1/stem-sets/{stem_set_id}/mix-versions", json={"idempotency_key": str(uuid4()), "levels": {"vocals": 0.7, "drums": 1.0, "bass": 0.9, "other": 0.5}})
    mix.raise_for_status()
    result = await_job(client, mix.json()["job_id"], timeout=300)
    mix_asset = result["result_asset_id"]
    lineage = client.get(f"/api/v1/assets/{mix_asset}/lineage")
    lineage.raise_for_status()
    if {row["parent_asset_id"] for row in lineage.json()["items"]} != {stem["asset_id"] for stem in stems}:
        raise AssertionError("Mix lineage does not include all four stems")
    preserved = client.get(f"/api/v1/assets/{source_id}/stream")
    preserved.raise_for_status()
    if hashlib.sha256(preserved.content).digest() != hashlib.sha256(original).digest():
        raise AssertionError("Original audio changed")
    print(f"Real stem workflow passed: stem_set={stem_set_id} mix={mix_asset}")
