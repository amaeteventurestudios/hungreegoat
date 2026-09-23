import hashlib
import os
from datetime import timedelta
from uuid import UUID, uuid4

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session
from test_auth_settings import ORIGIN, configured, login  # noqa:F401

from studio_api.dispatcher import dispatch_once, reconcile_once
from studio_api.domain_models import JobEvent
from studio_api.job_service import DiagnosticInput, create_diagnostic
from studio_api.main import create_app
from studio_api.models import utcnow
from studio_api.orchestration_client import OrchestrationError, WindmillClient
from studio_api.orchestration_models import JobAttempt, JobOutbox

pytestmark = pytest.mark.skipif(
    not os.getenv("STUDIO_TEST_DATABASE_URL"), reason="Needs PostgreSQL"
)
TOKEN = "worker-test-service-token-not-production"


@pytest.fixture()
def orchestration(configured, tmp_path):  # noqa:F811
    config, engine = configured
    token = tmp_path / "worker-token"
    token.write_text(TOKEN)
    token.chmod(0o600)
    script = tmp_path / "script-hash"
    script.write_text("0123456789abcdef")
    script.chmod(0o600)
    config = config.model_copy(
        update={
            "worker_token_file": token,
            "windmill_script_hash_file": script,
            "windmill_token_file": token,
            "windmill_url": "http://windmill.test",
        }
    )
    with TestClient(create_app(config, engine)) as browser:
        identity = login(browser).json()
        browser.headers.update({"Origin": ORIGIN, "X-CSRF-Token": identity["csrf_token"]})
        project = browser.post("/api/v1/projects", json={"name": "Workflow tests"}).json()
        with Session(engine) as db:
            idempotency = uuid4()
            job = create_diagnostic(
                db,
                UUID(identity["active_workspace_id"]),
                UUID(project["id"]),
                idempotency,
                DiagnosticInput(payload="original fixture"),
            )
            same = create_diagnostic(
                db,
                job.workspace_id,
                job.project_id,
                idempotency,
                DiagnosticInput(payload="original fixture"),
            )
            assert same.id == job.id
            attempt = db.scalar(select(JobAttempt).where(JobAttempt.job_id == job.id))
            job_id, execution_id = job.id, attempt.execution_id
        yield browser, config, engine, job_id, execution_id


def worker_headers(lease=None):
    result = {"Authorization": "Bearer " + TOKEN}
    if lease:
        result["X-Job-Lease"] = lease
    return result


def claim(browser, id, execution, number=1):
    response = browser.post(
        f"/api/v1/internal/jobs/{id}/attempts/{number}/claim",
        json={"execution_id": str(execution), "worker_id": "worker-a"},
        headers=worker_headers(),
    )
    assert response.status_code == 200, response.text
    return response.json()["lease_token"]


def test_claim_progress_complete_idempotency_and_auth(orchestration):
    browser, config, engine, id, execution = orchestration
    base = f"/api/v1/internal/jobs/{id}/attempts/1"
    assert (
        browser.post(
            base + "/claim", json={"execution_id": str(execution), "worker_id": "x"}
        ).status_code
        == 401
    )
    # Internal service calls work without a browser origin.
    browser.headers.pop("Origin")
    lease = claim(browser, id, execution)
    headers = worker_headers(lease)
    assert (
        browser.post(
            base + "/claim",
            json={"execution_id": str(execution), "worker_id": "b"},
            headers=worker_headers(),
        ).json()["error"]["code"]
        == "lease_busy"
    )
    assert (
        browser.post(
            base + "/progress",
            json={"progress_percent": 50, "current_stage": "verifying"},
            headers=headers,
        ).status_code
        == 200
    )
    assert (
        browser.post(
            base + "/progress",
            json={"progress_percent": 20, "current_stage": "secret"},
            headers=headers,
        ).status_code
        == 409
    )
    assert browser.get(base + "/credentials/openai", headers=headers).status_code == 403
    result = {
        "outputs": [],
        "result": {
            "diagnostic": True,
            "sha256": hashlib.sha256(b"original fixture").hexdigest(),
            "bytes": len(b"original fixture"),
        },
    }
    assert (
        browser.post(base + "/complete", json=result, headers=headers).json()["state"]
        == "succeeded"
    )
    assert (
        browser.post(base + "/complete", json=result, headers=headers).json()["state"]
        == "succeeded"
    )
    with Session(engine) as db:
        assert (
            db.scalar(
                select(func.count())
                .select_from(JobEvent)
                .where(JobEvent.job_id == id, JobEvent.state == "succeeded")
            )
            == 1
        )
    terminal = browser.post(
        base + "/claim",
        json={"execution_id": str(execution), "worker_id": "b"},
        headers=worker_headers(),
    )
    assert terminal.json()["already_complete"]
    public = browser.get(f"/api/v1/jobs/{id}").json()
    assert public["attempt"] == 1 and not public["can_retry"] and not public["can_cancel"]
    assert "lease" not in str(public) and "execution_id" not in public


def test_retry_stale_completion_cancel_and_error_redaction(orchestration):
    browser, config, engine, id, execution = orchestration
    lease = claim(browser, id, execution)
    base = f"/api/v1/internal/jobs/{id}/attempts/1"
    failed = browser.post(
        base + "/fail",
        headers=worker_headers(lease),
        json={
            "error_code": "secret-value",
            "message": "supersecret raw provider error",
            "retryable": True,
        },
    )
    assert failed.json()["state"] == "failed"
    public = browser.get(f"/api/v1/jobs/{id}").json()
    assert public["can_retry"] and "supersecret" not in str(public)
    assert browser.post(f"/api/v1/jobs/{id}/retry").status_code == 202
    assert (
        browser.post(
            base + "/fail", headers=worker_headers(lease), json={"error_code": "x", "message": "x"}
        ).status_code
        == 409
    )
    with Session(engine) as db:
        second = db.scalar(
            select(JobAttempt).where(JobAttempt.job_id == id, JobAttempt.attempt == 2)
        )
        next_execution = second.execution_id
    nextlease = claim(browser, id, next_execution, 2)
    assert browser.post(f"/api/v1/jobs/{id}/cancel").json()["cancel_requested"]
    result = {
        "outputs": [],
        "result": {
            "diagnostic": True,
            "sha256": hashlib.sha256(b"original fixture").hexdigest(),
            "bytes": 16,
        },
    }
    assert (
        browser.post(
            f"/api/v1/internal/jobs/{id}/attempts/2/complete",
            headers=worker_headers(nextlease),
            json=result,
        ).json()["state"]
        == "cancelled"
    )
    assert browser.get(f"/api/v1/jobs/{id}").json()["can_retry"]


def test_expired_lease_takeover_and_pending_cancellation(orchestration):
    browser, config, engine, id, execution = orchestration
    old = claim(browser, id, execution)
    with Session(engine) as db:
        attempt = db.scalar(select(JobAttempt).where(JobAttempt.job_id == id))
        attempt.lease_expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    base = f"/api/v1/internal/jobs/{id}/attempts/1"
    assert (
        browser.post(
            base + "/progress",
            headers=worker_headers(old),
            json={"progress_percent": 1, "current_stage": "waiting"},
        ).status_code
        == 409
    )
    new = claim(browser, id, execution)
    assert new != old
    assert (
        browser.post(
            base + "/progress",
            headers=worker_headers(old),
            json={"progress_percent": 1, "current_stage": "waiting"},
        ).status_code
        == 403
    )


class FakeOrchestrator:
    def __init__(self):
        self.jobs = {}
        self.submissions = 0
        self.lose_response = False

    def inspect(self, id):
        return self.jobs.get(id)

    def submit(self, id, script, job, attempt):
        self.submissions += 1
        self.jobs[id] = {
            "script_hash": script,
            "args": {"job_id": str(job), "attempt": attempt},
            "type": "QueuedJob",
        }
        if self.lose_response:
            raise OrchestrationError("dispatch_unconfirmed")

    def cancel(self, id):
        raise AssertionError("No broad Windmill cancellation permission")


def test_dispatch_lost_response_recovery_and_remote_failure(orchestration):
    browser, config, engine, id, execution = orchestration
    client = FakeOrchestrator()
    client.lose_response = True
    assert dispatch_once(engine, config, client)
    with Session(engine) as db:
        row = db.scalar(select(JobOutbox).where(JobOutbox.job_id == id))
        row.next_dispatch_at = utcnow()
        db.commit()
    assert dispatch_once(engine, config, client)
    assert client.submissions == 1
    assert browser.get(f"/api/v1/jobs/{id}").json()["state"] == "queued"
    client.jobs[execution].update(type="CompletedJob", success=False)
    reconcile_once(engine, client)
    job = browser.get(f"/api/v1/jobs/{id}").json()
    assert job["state"] == "failed" and job["can_retry"]


def test_existing_execution_identity_mismatch_is_not_accepted(orchestration):
    browser, config, engine, id, execution = orchestration
    client = FakeOrchestrator()
    client.jobs[execution] = {"script_hash": "bad", "args": {"job_id": str(id), "attempt": 1}}
    dispatch_once(engine, config, client)
    job = browser.get(f"/api/v1/jobs/{id}").json()
    assert job["state"] == "failed" and job["outcome_unknown"] and not job["can_retry"]
    assert client.submissions == 0


def test_windmill_http_contract(orchestration):
    browser, config, engine, id, execution = orchestration
    requests = []

    def handler(request):
        requests.append(request)
        if request.method == "POST":
            return httpx.Response(201, text=str(execution))
        return httpx.Response(404)

    with httpx.Client(transport=httpx.MockTransport(handler)) as http:
        client = WindmillClient(config, http)
        assert client.inspect(execution) is None
        client.submit(execution, "0123456789abcdef", id, 1)
    assert requests[-1].url.params["job_id"] == str(execution)
    assert b'"attempt":1' in requests[-1].content
    assert requests[-1].headers["authorization"] == "Bearer " + TOKEN


def test_dispatch_lease_exclusion_expiry_and_cancel_before_claim(orchestration):
    browser, config, engine, id, execution = orchestration
    client = FakeOrchestrator()
    with Session(engine) as db:
        row = db.scalar(select(JobOutbox).where(JobOutbox.job_id == id))
        row.state = "dispatching"
        row.lease_owner = uuid4()
        row.lease_expires_at = utcnow() + timedelta(seconds=60)
        db.commit()
    assert not dispatch_once(engine, config, client)
    assert client.submissions == 0
    with Session(engine) as db:
        row = db.scalar(select(JobOutbox).where(JobOutbox.job_id == id))
        row.lease_expires_at = utcnow() - timedelta(seconds=1)
        db.commit()
    assert dispatch_once(engine, config, client)
    assert client.submissions == 1
    assert browser.post(f"/api/v1/jobs/{id}/cancel").json()["state"] == "cancelled"
    response = browser.post(
        f"/api/v1/internal/jobs/{id}/attempts/1/claim",
        json={"execution_id": str(execution), "worker_id": "worker"},
        headers=worker_headers(),
    )
    assert response.status_code == 409 and response.json()["error"]["code"] == "job_cancelled"
    events = browser.get(f"/api/v1/jobs/{id}/events").json()["items"]
    assert [item["sequence"] for item in events] == list(range(1, len(events) + 1))


def test_unknown_outcome_blocks_retry_and_worker_secrets_are_private(orchestration):
    browser, config, engine, id, execution = orchestration
    lease = claim(browser, id, execution)
    response = browser.post(
        f"/api/v1/internal/jobs/{id}/attempts/1/fail",
        headers=worker_headers(lease),
        json={
            "error_code": "provider_timeout",
            "message": TOKEN,
            "retryable": True,
            "outcome_unknown": True,
        },
    )
    assert response.json()["state"] == "failed"
    public = browser.get(f"/api/v1/jobs/{id}").json()
    assert public["outcome_unknown"] and not public["can_retry"]
    assert TOKEN not in str(public) and lease not in str(public)
    assert browser.post(f"/api/v1/jobs/{id}/retry").status_code == 409
    alljobs = browser.get("/api/v1/jobs?state=failed").json()["items"]
    assert alljobs[0]["id"] == str(id)
