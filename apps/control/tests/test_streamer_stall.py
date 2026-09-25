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


class TestWavInputIgnoresDeclaredLength(unittest.TestCase):
    """Root cause of the ~22,865 s live-lock (2026-09-21..25): Liquidsoap's endless WAV mount
    declares a fixed 4,026,531,803-byte data chunk (22,826 s at 44.1 kHz s16 stereo); without
    -ignore_length FFmpeg's wav demuxer stops delivering audio there and the encode freezes.
    See docs/streaming/FFMPEG_STALL_INVESTIGATION.md."""

    def _cmd(self, backend: str) -> list[str]:
        from hgc import config, streamer
        s = streamer.Streamer.__new__(streamer.Streamer)
        s.sid = "lofi"
        s.st = {"video_bitrate_k": 3000, "audio_bitrate_k": 192, "harbor_port": 8100}
        old = config.HW_BACKEND
        config.HW_BACKEND = backend
        try:
            return s.ffmpeg_cmd(["-f", "null", "-"], Path("/tmp/bg.fifo"))
        finally:
            config.HW_BACKEND = old

    def test_wav_input_ignores_declared_length(self):
        for backend in ("vaapi", "v4l2m2m", "software"):
            cmd = self._cmd(backend)
            url = cmd.index("http://127.0.0.1:8100/lofi.wav")
            wav = max(i for i in range(url) if cmd[i:i + 2] == ["-f", "wav"])
            opts = cmd[wav:url]
            self.assertIn("-ignore_length", opts, backend)
            self.assertEqual(opts[opts.index("-ignore_length") + 1], "1", backend)


class TestProcSnapshot(unittest.TestCase):
    def test_snapshot_of_self_lists_threads_and_io(self):
        from hgc.streamer import proc_snapshot
        snap = proc_snapshot(os.getpid())
        self.assertIn("rchar=", snap)
        self.assertIn("threads=[", snap)

    def test_snapshot_of_missing_pid_does_not_raise(self):
        from hgc.streamer import proc_snapshot
        self.assertIn("unavailable", proc_snapshot(2**22 + 12345))
