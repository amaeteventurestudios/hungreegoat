"""Mastering/export request safety and idempotency at the domain boundary."""

import os
from uuid import uuid4

import pytest
from test_auth_settings import configured  # noqa: F401
from test_domain import domain, wav_bytes  # noqa: F401

pytestmark = pytest.mark.skipif(
    not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL"
)


def test_master_and_export_requests_are_bounded_and_idempotent(domain):  # noqa: F811
    browser, _, _, project, song = domain
    upload = f"/api/v1/projects/{project['id']}/assets/upload"
    source = browser.post(
        upload,
        files={"file": ("source.wav", wav_bytes(), "audio/wav")},
        data={"song_id": song["id"]},
    ).json()
    reference = browser.post(
        upload,
        files={"file": ("reference.wav", wav_bytes(), "audio/wav")},
    ).json()
    master_url = f"/api/v1/assets/{source['id']}/masters"
    master_request = {
        "idempotency_key": str(uuid4()),
        "reference_asset_id": reference["id"],
        "target_lufs": -14,
        "true_peak_dbtp": -1,
    }
    response = browser.post(master_url, json=master_request)
    assert response.status_code == 202, response.text
    assert (
        browser.post(master_url, json=master_request).json()["job_id"] == response.json()["job_id"]
    )
    assert browser.post(master_url, json={**master_request, "target_lufs": -16}).status_code == 409
    assert (
        browser.post(
            master_url, json={**master_request, "idempotency_key": str(uuid4()), "target_lufs": -30}
        ).status_code
        == 422
    )
    assert (
        browser.post(
            master_url, json={"idempotency_key": str(uuid4()), "reference_asset_id": source["id"]}
        ).status_code
        == 422
    )
    assert browser.get(master_url).json() == {"items": []}

    export_url = f"/api/v1/assets/{source['id']}/exports"
    export_request = {"idempotency_key": str(uuid4()), "format": "wav", "bit_depth": 24}
    export = browser.post(export_url, json=export_request)
    assert export.status_code == 202, export.text
    assert browser.post(export_url, json=export_request).json()["job_id"] == export.json()["job_id"]
    assert browser.post(export_url, json={**export_request, "format": "mp3"}).status_code == 409
    assert (
        browser.post(
            export_url, json={"idempotency_key": str(uuid4()), "format": "zip"}
        ).status_code
        == 422
    )
    assert browser.get(export_url).json() == {"items": []}


def test_stem_packages_require_complete_stems(domain):  # noqa: F811
    browser, _, _, project, _ = domain
    source = browser.post(
        f"/api/v1/projects/{project['id']}/assets/upload",
        files={"file": ("source.wav", wav_bytes(), "audio/wav")},
    ).json()
    stem_set = browser.post(
        f"/api/v1/assets/{source['id']}/stem-sets",
        json={"idempotency_key": str(uuid4())},
    ).json()
    request = browser.post(
        f"/api/v1/stem-sets/{stem_set['stem_set_id']}/exports",
        json={"idempotency_key": str(uuid4())},
    )
    assert request.status_code == 409
    assert request.json()["error"]["code"] == "stems_incomplete"
