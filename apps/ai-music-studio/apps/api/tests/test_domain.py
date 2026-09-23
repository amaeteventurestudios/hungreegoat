import hashlib
import io
import os
import wave
from uuid import UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from test_auth_settings import ORIGIN, configured, login  # noqa: F401

from studio_api.domain_models import Job, Song
from studio_api.main import create_app
from studio_api.models import AuthSession, Membership, Workspace
from studio_api.storage import LocalStorageProvider, StorageError

pytestmark = pytest.mark.skipif(
    not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL"
)


def wav_bytes():
    data = io.BytesIO()
    with wave.open(data, "wb") as stream:
        stream.setnchannels(1)
        stream.setsampwidth(2)
        stream.setframerate(22050)
        stream.writeframes(b"\x00\x00" * 22050)
    return data.getvalue()


@pytest.fixture()
def domain(configured):  # noqa: F811
    config, engine = configured
    with TestClient(create_app(config, engine)) as browser:
        body = login(browser).json()
        browser.headers.update({"Origin": ORIGIN, "X-CSRF-Token": body["csrf_token"]})
        project = browser.post(
            "/api/v1/projects", json={"name": "Studio project", "tags": ["test"]}
        ).json()
        song = browser.post(
            f"/api/v1/projects/{project['id']}/songs", json={"title": "First song", "bpm": 120}
        ).json()
        yield browser, config, engine, project, song


def test_projects_songs_patch_search_and_persistence(domain):
    browser, config, engine, project, song = domain
    assert browser.get("/api/v1/projects?q=Studio").json()["items"][0]["id"] == project["id"]
    assert browser.get("/api/v1/projects?q=nonexistent").json()["items"] == []
    assert browser.get("/api/v1/projects?limit=101").status_code == 422
    assert browser.post("/api/v1/projects", json={"name": "   "}).status_code == 422
    assert (
        browser.patch(
            f"/api/v1/projects/{project['id']}", json={"description": "Kept after restart"}
        ).json()["name"]
        == "Studio project"
    )
    updated = browser.patch(
        f"/api/v1/songs/{song['id']}",
        json={
            "notes": "Notes",
            "style": "ambient",
            "vocal_mode": "instrumental",
            "target_duration_seconds": 180,
        },
    )
    assert updated.status_code == 200 and updated.json()["bpm"] == 120
    assert (
        browser.patch(
            f"/api/v1/songs/{song['id']}", json={"target_duration_seconds": 601}
        ).status_code
        == 422
    )
    assert browser.patch(f"/api/v1/songs/{song['id']}", json={"bpm": None}).json()["bpm"] is None
    token = browser.cookies.get("studio_session")
    with TestClient(create_app(config, engine)) as restarted:
        restarted.cookies.set("studio_session", token)
        assert restarted.get(f"/api/v1/songs/{song['id']}").json()["notes"] == "Notes"
        assert (
            restarted.get(f"/api/v1/projects/{project['id']}").json()["description"]
            == "Kept after restart"
        )


def test_upload_download_ranges_immutable_and_clean_invalid(domain):
    browser, config, engine, project, song = domain
    wav = wav_bytes()
    url = f"/api/v1/projects/{project['id']}/assets/upload"
    response = browser.post(
        url, files={"file": ("../../escape.wav", wav, "text/plain")}, data={"song_id": song["id"]}
    )
    assert response.status_code == 201, response.text
    asset = response.json()
    assert asset["original_filename"] == "escape.wav"
    assert asset["media_type"] == "audio/wav" and asset["sample_rate"] == 22050
    assert asset["byte_size"] == len(wav) and asset["sha256"] == hashlib.sha256(wav).hexdigest()
    assert "storage_key" not in asset and "workspace_id" not in asset
    second = browser.post(url, files={"file": ("audio.wav", wav, "audio/wav")}).json()
    assert second["id"] != asset["id"]
    files = list((config.asset_root / "objects").iterdir())
    assert len(files) == 2 and all(path.stat().st_mode & 0o777 == 0o600 for path in files)
    download = browser.get(f"/api/v1/assets/{asset['id']}/download")
    assert download.content == wav and "attachment" in download.headers["content-disposition"]
    ranged = browser.get(f"/api/v1/assets/{asset['id']}/stream", headers={"Range": "bytes=0-31"})
    assert ranged.status_code == 206 and ranged.content == wav[:32]
    assert (
        browser.get(
            f"/api/v1/assets/{asset['id']}/stream", headers={"Range": "bytes=999999-"}
        ).status_code
        == 416
    )
    assert browser.get(f"/api/v1/assets/{asset['id']}/lineage").json()["items"] == []
    assert len(browser.get(f"/api/v1/assets?song_id={song['id']}").json()["items"]) == 1
    for invalid in [b"", b"not audio", b"#EXTM3U\nhttp://127.0.0.1:8000/private\n"]:
        response = browser.post(url, files={"file": ("malicious.mp3", invalid, "audio/mpeg")})
        assert response.status_code == 422, response.text
    assert len(list((config.asset_root / "objects").iterdir())) == 2
    with pytest.raises(StorageError):
        LocalStorageProvider(config.asset_root).path_for("../../outside")


def test_workspace_isolation_relationship_constraints_and_jobs(domain):
    browser, config, engine, project, song = domain
    asset = browser.post(
        f"/api/v1/projects/{project['id']}/assets/upload",
        files={"file": ("audio.wav", wav_bytes(), "audio/wav")},
    ).json()
    with Session(engine) as db:
        session = db.scalar(select(AuthSession))
        first_workspace = session.workspace_id
        job = Job(
            project_id=UUID(project["id"]),
            workspace_id=first_workspace,
            song_id=UUID(song["id"]),
            kind="analysis",
            parameters={"private": "not returned"},
        )
        db.add(job)
        db.commit()
        job_id = job.id
    public = browser.get(f"/api/v1/jobs/{job_id}")
    assert public.status_code == 200 and "parameters" not in public.json()
    assert public.json()["state"] == "pending"
    assert len(browser.get(f"/api/v1/projects/{project['id']}/jobs").json()["items"]) == 1
    with Session(engine) as db:
        session = db.scalar(select(AuthSession))
        second = Workspace(name="Isolated workspace")
        db.add(second)
        db.flush()
        db.add(Membership(user_id=session.user_id, workspace_id=second.id))
        session.workspace_id = second.id
        db.commit()
        second_id = second.id
    for endpoint in [
        f"projects/{project['id']}",
        f"songs/{song['id']}",
        f"assets/{asset['id']}",
        f"assets/{asset['id']}/stream",
        f"assets/{asset['id']}/download",
        f"assets/{asset['id']}/lineage",
        f"jobs/{job_id}",
    ]:
        assert browser.get("/api/v1/" + endpoint).status_code == 404
    assert browser.get("/api/v1/projects").json()["items"] == []
    assert browser.get("/api/v1/assets").json()["items"] == []
    assert (
        browser.post(
            f"/api/v1/projects/{project['id']}/assets/upload",
            files={"file": ("audio.wav", wav_bytes())},
        ).status_code
        == 404
    )
    with Session(engine) as db:
        db.add(Song(project_id=UUID(project["id"]), workspace_id=second_id, title="Mismatch"))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_upload_auth_before_body_and_stream_limit(domain, monkeypatch):
    browser, config, engine, project, song = domain
    from studio_api import main

    monkeypatch.setattr(main, "MAX_MULTIPART", 100)
    url = f"/api/v1/projects/{project['id']}/assets/upload"
    response = browser.post(url, files={"file": ("audio.wav", wav_bytes())})
    assert response.status_code == 413, response.text
    browser.cookies.clear()
    assert browser.post(url, content=b"x" * 500).status_code == 401
    assert not (config.asset_root / "objects").exists()


def test_wrong_project_song_and_failed_commit_cleanup(domain, monkeypatch):
    browser, config, engine, project, song = domain
    other = browser.post("/api/v1/projects", json={"name": "Other project"}).json()
    url = f"/api/v1/projects/{other['id']}/assets/upload"
    assert (
        browser.post(
            url, files={"file": ("audio.wav", wav_bytes())}, data={"song_id": song["id"]}
        ).status_code
        == 422
    )
    original = Session.commit

    def failure(self):
        raise RuntimeError("simulated commit failure")

    monkeypatch.setattr(Session, "commit", failure)
    assert browser.post(url, files={"file": ("audio.wav", wav_bytes())}).status_code == 500
    monkeypatch.setattr(Session, "commit", original)
    assert list((config.asset_root / "objects").iterdir()) == []


def test_storage_fsync_failure_removes_new_final_object(tmp_path, monkeypatch):
    store = LocalStorageProvider(tmp_path)
    original = os.fsync
    calls = 0

    def fail_directory(fd):
        nonlocal calls
        calls += 1
        if calls == 2:
            raise OSError("injected directory sync failure")
        return original(fd)

    monkeypatch.setattr(os, "fsync", fail_directory)
    with pytest.raises(OSError):
        store.save_upload(io.BytesIO(wav_bytes()))
    assert list(store.root.iterdir()) == []


def test_plan_generation_constraints(domain):
    from studio_api.domain_models import Generation, ProductionPlan

    browser, config, engine, project, song = domain
    other = browser.post(f"/api/v1/projects/{project['id']}/songs", json={"title": "Other"}).json()
    with Session(engine) as db:
        workspace_id = db.scalar(select(AuthSession)).workspace_id
        common = {"project_id": UUID(project["id"]), "workspace_id": workspace_id}
        plan = ProductionPlan(
            **common,
            song_id=UUID(song["id"]),
            version=1,
            provider="openai",
            model="example",
            plan={},
            active=True,
        )
        db.add(plan)
        db.commit()
        db.add(
            Generation(
                **common,
                song_id=UUID(other["id"]),
                plan_id=plan.id,
                provider="elevenlabs",
                model="music_v1",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
        db.add(
            ProductionPlan(
                **common,
                song_id=UUID(song["id"]),
                version=2,
                provider="openai",
                model="example",
                plan={},
                active=True,
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()


def test_multiple_files_rejected_and_chunked_limit(domain, monkeypatch):
    browser, config, engine, project, song = domain
    url = f"/api/v1/projects/{project['id']}/assets/upload"
    response = browser.post(
        url, files=[("file", ("one.wav", wav_bytes())), ("file", ("two.wav", wav_bytes()))]
    )
    assert response.status_code == 422
    from studio_api import main

    monkeypatch.setattr(main, "MAX_MULTIPART", 100)
    body = (
        b'--boundary\r\nContent-Disposition: form-data; name="file"; filename="a.wav"\r\n\r\n'
        + wav_bytes()
        + b"\r\n--boundary--\r\n"
    )
    response = browser.post(
        url,
        content=iter([body[:90], body[90:]]),
        headers={
            "Content-Type": "multipart/form-data; boundary=boundary",
            "Transfer-Encoding": "chunked",
        },
    )
    assert response.status_code == 413
