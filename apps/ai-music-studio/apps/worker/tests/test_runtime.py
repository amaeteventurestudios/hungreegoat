import hashlib
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from uuid import uuid4

from studio_worker.entry import diagnostic, execute
from studio_worker.runtime import JobCancelled, WorkerContext, WorkerFailure, private_token


class FakeClient:
    def __init__(self, claim=None):
        self.job_id = str(uuid4())
        self.attempt = 1
        self.lease = None
        self.calls = []
        self.claim = claim or {"kind": "system.verify", "inputs": {}, "lease_token": "private"}
        self.cancel = False

    def call(self, endpoint, payload):
        self.calls.append((endpoint, payload))
        if endpoint == "/claim":
            return self.claim
        if endpoint == "/progress":
            return {"cancel_requested": self.cancel}
        return {"state": "succeeded" if endpoint == "/complete" else "failed"}


class WorkerTests(unittest.TestCase):
    def test_private_token_rejects_public_mode_and_symlink(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "token"
            path.write_text("a" * 64)
            path.chmod(0o600)
            self.assertEqual(private_token(path), "a" * 64)
            path.chmod(0o644)
            with self.assertRaises(WorkerFailure):
                private_token(path)
            link = Path(directory) / "link"
            link.symlink_to(path)
            with self.assertRaises(WorkerFailure):
                private_token(link)

    def test_progress_monotonic_and_cancellation(self):
        client = FakeClient()
        context = WorkerContext(client, {}, percent=50)
        context.progress(20, "verifying")
        self.assertEqual(client.calls[-1][1]["progress_percent"], 50)
        client.cancel = True
        with self.assertRaises(JobCancelled):
            context.progress(60, "verifying")

    def test_diagnostic_hash_is_real_and_payload_not_returned(self):
        client = FakeClient()
        context = WorkerContext(client, {"inputs": {"duration_seconds": 1, "payload": "original fixture"}})
        result = diagnostic(context)
        self.assertEqual(result, {"diagnostic": True,
            "sha256": hashlib.sha256(b"original fixture").hexdigest(), "bytes": 16})
        self.assertNotIn("payload", result)

    def test_duplicate_completion_skips_handler(self):
        client = FakeClient({"already_complete": True, "state": "succeeded"})
        with patch("studio_worker.entry.WorkerClient", return_value=client), \
             patch.dict(os.environ, {"WM_JOB_ID": str(uuid4())}), \
             patch("studio_worker.entry.diagnostic") as handler:
            self.assertEqual(execute(client.job_id, 1)["state"], "succeeded")
            handler.assert_not_called()

    def test_unknown_failure_is_sanitized(self):
        client = FakeClient()
        with patch("studio_worker.entry.WorkerClient", return_value=client), \
             patch.dict(os.environ, {"WM_JOB_ID": str(uuid4())}), \
             patch("studio_worker.entry.diagnostic", side_effect=ValueError("credential-secret")):
            self.assertEqual(execute(client.job_id, 1)["state"], "failed")
        self.assertNotIn("credential-secret", str(client.calls))
        self.assertEqual(client.calls[-1][1]["error_code"], "worker_failed")


if __name__ == "__main__":
    unittest.main()
