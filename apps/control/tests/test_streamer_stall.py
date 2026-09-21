"""Regression coverage for hgc.streamer.StallDetector.

Root incident (2026-09-20/21): a bound YouTube stream went inactive and the broadcast
auto-completed while the local FFmpeg process was still "running" and its container had never
restarted. The actual cause: FFmpeg kept emitting a fresh `-progress` block on schedule (so the
old `ts`-recency check never saw a stale heartbeat) while the block's own `frame`/`out_time_us`
values stopped changing — a live-locked encode producing no real output. This file pins down
that exact scenario, plus the two stall modes the watchdog already covered, as unit tests
against the extracted, pure StallDetector class (no subprocess/ffmpeg needed).

Run: cd apps/control && python -m unittest tests.test_streamer_stall -v
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

from hgc.streamer import StallDetector  # noqa: E402


class TestForwardProgressStall(unittest.TestCase):
    """The exact bug: heartbeat (`ts`) keeps advancing every tick, frame/out_time frozen."""

    def test_frozen_frame_with_live_heartbeat_is_a_stall(self):
        start = 0.0
        d = StallDetector(start)
        t = start
        # First real progress line: heartbeat healthy, frame moving normally for a while.
        for i in range(5):
            t += 2.0
            reason = d.check({"ts": t, "frame": i, "out_time_us": i * 1_000_000}, t)
            self.assertIsNone(reason, f"should not stall while frame is advancing (i={i})")
        # Now the encode live-locks: ts keeps ticking every 2s (heartbeat alive) but frame and
        # out_time_us stay pinned at their last real values — this must NOT look healthy just
        # because ts is fresh.
        frozen_frame, frozen_out = 4, 4_000_000
        for _ in range(20):  # 20 * 2s = 40s of frozen output, past the 30s threshold
            t += 2.0
            reason = d.check({"ts": t, "frame": frozen_frame, "out_time_us": frozen_out}, t)
            if reason is not None:
                break
        else:
            self.fail("frozen frame/out_time with a live heartbeat was never flagged as a stall")
        self.assertIn("live-locked", reason)
        self.assertIn("frame/out_time hasn't advanced", reason)

    def test_slow_but_real_progress_is_not_a_stall(self):
        """A slower-than-realtime encode (speed < 1x) still advances frame/out_time on every
        tick — must never be flagged, even though it's "behind"; that's a different, legitimate
        dashboard concept (Streaming Speed), not a stall."""
        start = 0.0
        d = StallDetector(start)
        t = start
        for i in range(30):
            t += 2.0
            reason = d.check({"ts": t, "frame": i, "out_time_us": i * 500_000}, t)
            self.assertIsNone(reason)


class TestHeartbeatStall(unittest.TestCase):
    """Pre-existing case (a): progress *was* arriving and then the pipe went stale."""

    def test_stale_heartbeat_is_a_stall(self):
        start = 0.0
        d = StallDetector(start)
        self.assertIsNone(d.check({"ts": 2.0, "frame": 1, "out_time_us": 1_000_000}, 2.0))
        # No new progress line arrives at all for 31s — ts stays at 2.0 while now moves on.
        reason = d.check({"ts": 2.0, "frame": 1, "out_time_us": 1_000_000}, 2.0 + 31)
        self.assertIsNotNone(reason)
        self.assertIn("no progress update", reason)

    def test_fresh_heartbeat_under_threshold_is_fine(self):
        d = StallDetector(0.0)
        self.assertIsNone(d.check({"ts": 2.0, "frame": 1, "out_time_us": 1_000_000}, 2.0))
        self.assertIsNone(d.check({"ts": 2.0, "frame": 1, "out_time_us": 1_000_000}, 2.0 + 29))


class TestNoFirstProgressStall(unittest.TestCase):
    """Pre-existing case (b): the process never emits even one `-progress` line."""

    def test_never_starting_is_a_stall_after_20s(self):
        d = StallDetector(0.0)
        self.assertIsNone(d.check({}, 19.9))
        reason = d.check({}, 20.1)
        self.assertIsNotNone(reason)
        self.assertIn("no progress line at all", reason)

    def test_never_starting_under_threshold_is_fine(self):
        d = StallDetector(0.0)
        self.assertIsNone(d.check({}, 5.0))


if __name__ == "__main__":
    unittest.main()
