#!/usr/bin/env python3
"""Exercise real local leased analysis and Rubber Band tempo rendering."""

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
environment = dict(
    line.split("=", 1)
    for line in (root / ".env").read_text().splitlines()
    if line and not line.startswith("#") and "=" in line
)
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
        for index in range(22050 * 8):
            second = index / 22050
            beat = second % 0.5
            envelope = math.exp(-beat * 24)
            sample = math.sin(2 * math.pi * 220 * second) * envelope * 9000
            frames.extend(int(sample).to_bytes(2, "little", signed=True))
        output.writeframes(frames)
    return signal.getvalue()


def await_job(client: httpx.Client, job_id: str) -> dict:
    deadline = time.monotonic() + 240
    while time.monotonic() < deadline:
        response = client.get(f"/api/v1/jobs/{job_id}")
        response.raise_for_status()
        job = response.json()
        if job["state"] in {"succeeded", "failed", "cancelled"}:
            if job["state"] != "succeeded":
                raise RuntimeError(f"Studio job {job_id} ended {job['state']}: {job['error_code']}")
            return job
        time.sleep(2)
    raise TimeoutError(f"Studio job {job_id} did not finish within four minutes")


with httpx.Client(base_url="http://127.0.0.1:3210", timeout=45) as client:
    login = client.post(
        "/api/v1/auth/login",
        json=owner,
        headers={"Origin": "http://localhost:3210"},
    )
    login.raise_for_status()
    client.headers.update({
        "Origin": "http://localhost:3210",
        "X-CSRF-Token": login.json()["csrf_token"],
    })
    project = client.post("/api/v1/projects", json={"name": f"Audio workflow fixture {str(uuid4())[:8]}"})
    project.raise_for_status()
    project_id = project.json()["id"]
    song = client.post(
        f"/api/v1/projects/{project_id}/songs",
        json={"title": "Original rhythmic test tone", "bpm": 120},
    )
    song.raise_for_status()
    song_id = song.json()["id"]
    original = fixture()
    uploaded = client.post(
        f"/api/v1/projects/{project_id}/assets/upload",
        files={"file": ("original-tone.wav", original, "audio/wav")},
        data={"song_id": song_id},
    )
    uploaded.raise_for_status()
    source_id = uploaded.json()["id"]
    analysis = client.post(
        f"/api/v1/assets/{source_id}/analysis",
        json={"idempotency_key": str(uuid4())},
    )
    analysis.raise_for_status()
    await_job(client, analysis.json()["job_id"])
    measurements = client.get(f"/api/v1/assets/{source_id}/analysis")
    measurements.raise_for_status()
    rows = measurements.json()["items"]
    if len(rows) != 1 or len(rows[0]["measurements"]["peaks"]) != 256:
        raise AssertionError("Real analysis was not persisted")
    render = client.post(
        f"/api/v1/assets/{source_id}/tempo-versions",
        json={
            "idempotency_key": str(uuid4()),
            "mode": "time_stretch",
            "source_bpm": 120,
            "target_bpm": 150,
            "preserve_pitch": True,
            "pitch_semitones": 0,
            "preserve_formants": True,
            "transients": "mixed",
        },
    )
    render.raise_for_status()
    job = await_job(client, render.json()["job_id"])
    derived_id = job["result_asset_id"]
    versions = client.get(f"/api/v1/assets/{source_id}/tempo-versions")
    versions.raise_for_status()
    if len(versions.json()["items"]) != 1 or versions.json()["items"][0]["asset_id"] != derived_id:
        raise AssertionError("Tempo version was not persisted")
    lineage = client.get(f"/api/v1/assets/{derived_id}/lineage")
    lineage.raise_for_status()
    if not any(row["parent_asset_id"] == source_id for row in lineage.json()["items"]):
        raise AssertionError("Tempo source lineage is missing")
    preserved = client.get(f"/api/v1/assets/{source_id}/stream")
    preserved.raise_for_status()
    if hashlib.sha256(preserved.content).digest() != hashlib.sha256(original).digest():
        raise AssertionError("The original audio changed")
    print(f"Real audio workflow passed: analysis={rows[0]['id']} tempo={derived_id}")
