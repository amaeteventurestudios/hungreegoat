"""Regression coverage for hgc.youtube_oauth.legal_transitions().

This is the backend-authoritative state machine that fixed a real UI-safety bug found during
the 2026-09-20/21 incident: the dashboard could show enabled Start Testing / Go Live buttons
on a `complete` (terminal) broadcast, both of which the real YouTube API correctly rejected
with `invalidTransition`. These tests pin down that a `complete`/`revoked` lifecycle always
returns no legal transitions, and the other documented lifecycle rules from
docs/youtube-oauth.md.

Run: cd apps/control && python -m unittest tests.test_youtube_legal_transitions -v
(uses the real production venv's interpreter, e.g. ~/hungree-goat/venv/bin/python)
"""
from __future__ import annotations
import os
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
os.environ.setdefault("HGC_HOME", str(Path.home() / "hungree-goat"))
os.environ.setdefault("HGC_MEDIA", "/media/hungree-goat")

from hgc.youtube_oauth import legal_transitions  # noqa: E402


class TestTerminalLifecycle(unittest.TestCase):
    """The exact bug: a terminal lifecycle must never offer any transition, regardless of
    ingest/monitor state."""

    def test_complete_is_always_terminal(self):
        for stream_status in ("active", "inactive", None):
            for monitor in (True, False):
                self.assertEqual(legal_transitions("complete", stream_status, monitor), [])

    def test_revoked_is_always_terminal(self):
        self.assertEqual(legal_transitions("revoked", "active", True), [])

    def test_unknown_lifecycle_offers_nothing(self):
        self.assertEqual(legal_transitions(None, "active", True), [])


class TestLiveLifecycle(unittest.TestCase):
    def test_live_only_allows_complete(self):
        self.assertEqual(legal_transitions("live", "active", True), ["complete"])
        self.assertEqual(legal_transitions("live", "inactive", False), ["complete"])


class TestTestingLifecycle(unittest.TestCase):
    def test_testing_allows_live_only_when_ingest_active(self):
        self.assertEqual(sorted(legal_transitions("testing", "active", True)), ["complete", "live"])

    def test_testing_without_active_ingest_only_allows_complete(self):
        self.assertEqual(legal_transitions("testing", "inactive", True), ["complete"])
        self.assertEqual(legal_transitions("testing", None, True), ["complete"])


class TestReadyLifecycle(unittest.TestCase):
    """Ready requires active ingest before offering anything, and the offered transition
    depends on whether monitorStream is enabled — see docs/youtube-oauth.md."""

    def test_ready_without_active_ingest_offers_nothing(self):
        self.assertEqual(legal_transitions("ready", "inactive", True), [])
        self.assertEqual(legal_transitions("ready", None, False), [])

    def test_ready_with_monitor_enabled_requires_testing_first(self):
        self.assertEqual(legal_transitions("ready", "active", True), ["testing"])

    def test_ready_with_monitor_disabled_allows_live_directly(self):
        self.assertEqual(legal_transitions("ready", "active", False), ["live"])

    def test_created_behaves_like_ready(self):
        self.assertEqual(legal_transitions("created", "active", False), ["live"])
        self.assertEqual(legal_transitions("created", "active", True), ["testing"])


if __name__ == "__main__":
    unittest.main()
