"""Vertical (9:16, 720x1280) output — a second, independent pipeline from the main
16:9 broadcast in streamer.py. It never shares state with the horizontal stream: it
reads the same now-playing info via overlay.render_vertical() and encodes its own
full frame directly (there is no separate "animation loop" input to composite over —
see overlay.render_vertical for why).

Deliberately software-encoded (libx264) rather than the Pi's h264_v4l2m2m hardware
unit: that hardware encoder is a single shared resource and the horizontal stream
already depends on it for the live YouTube broadcast, so a vertical pipeline sharing
it could degrade or break the primary stream under load. libx264 costs CPU instead,
and only when this output is actually running.

This module is standalone and, unlike streamer.py, is not wired into a systemd unit
or the dashboard yet — see the correction-pass report for why the go-live steps
(a second YouTube stream key, a systemd template, an Outputs toggle) are left as a
follow-up rather than turned on unreviewed in the same pass that built the pipeline.
Run it manually to produce a local test file: `python -m hgc streamv <station>`.
"""
from __future__ import annotations
import json
import subprocess
import sys
import threading
import time
from pathlib import Path

from . import config, overlay

W, H = config.VERT_W, config.VERT_H
FRAME_BYTES = W * H * 3 // 2  # yuv420p, opaque (no alpha needed — this is the whole frame)


class VerticalStreamer:
    def __init__(self, sid: str, out_path: Path | None = None, duration_sec: int | None = None):
        self.sid = sid
        self.st = config.station(sid)
        self.status_path = config.RUN_DIR / f"stream-vert-{sid}.json"
        self.out_path = out_path or (config.RUN_DIR / f"local-vert-{sid}.mp4")
        self.duration_sec = duration_sec   # None = run until stopped; set for a bounded smoke test
        self.proc: subprocess.Popen | None = None
        self.frame = b""
        self.frame_mtime = 0.0
        self.stop_flag = False

    def load_frame(self) -> None:
        from . import main as m
        now = m.NOW.get(self.sid, {})
        p = overlay.vertical_overlay_path(self.sid)
        need_render = not p.exists() or (time.time() - self.frame_mtime > 2 and now.get("title"))
        if need_render:
            overlay.render_vertical(self.sid, now.get("title") or self.st["short"], now.get("artist") or "HUNGREE Goat",
                                    now.get("album") or "", now.get("artwork") or str(config.DEFAULT_ARTWORK),
                                    kind=now.get("kind", "music"))
        m_ = p.stat().st_mtime
        if m_ == self.frame_mtime and self.frame:
            return
        conv = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "rawvideo", "-pix_fmt", "yuv420p", "-"],
                              capture_output=True, timeout=30)
        if conv.returncode == 0 and len(conv.stdout) == FRAME_BYTES:
            self.frame = conv.stdout
            self.frame_mtime = m_

    def ffmpeg_cmd(self) -> list[str]:
        audio_url = f"http://127.0.0.1:{self.st['harbor_port']}/{self.sid}.wav"
        out_args = ["-t", str(self.duration_sec)] if self.duration_sec else []
        return [
            "ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "warning", "-nostats", "-progress", "pipe:1",
            "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{W}x{H}", "-framerate", str(config.VERT_FPS),
            "-thread_queue_size", "64", "-i", "pipe:0",
            "-f", "wav",
            "-thread_queue_size", "1024", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
            "-i", audio_url,
            "-map", "0:v", "-map", "1:a:0",
            "-c:v", "libx264", "-preset", "veryfast", "-b:v", "2000k", "-maxrate", "2000k", "-bufsize", "4000k",
            "-g", str(config.VERT_FPS * 2), "-r", str(config.VERT_FPS), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", "160k",
            *out_args, "-y", "-f", "mp4" if str(self.out_path).endswith(".mp4") else "flv", str(self.out_path),
        ]

    def feeder(self, stdin) -> None:
        last = 0.0
        try:
            while not self.stop_flag and self.proc and self.proc.poll() is None:
                now = time.time()
                if now - last > 1.0:
                    try:
                        self.load_frame()
                    except Exception:
                        pass
                    last = now
                stdin.write(self.frame)
        except (BrokenPipeError, OSError, ValueError):
            pass
        finally:
            try:
                stdin.close()
            except Exception:
                pass

    def run(self) -> None:
        self.load_frame()
        cmd = self.ffmpeg_cmd()
        self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        # feeder owns stdin; communicate() would race it for the same pipe, so read
        # stderr on its own thread (same pattern as the horizontal streamer) and just
        # wait for the process — never call communicate() here.
        err_chunks: list[bytes] = []
        def read_err():
            for chunk in iter(lambda: self.proc.stderr.read(4096), b""):
                err_chunks.append(chunk)
        te = threading.Thread(target=read_err, daemon=True); te.start()
        tf = threading.Thread(target=self.feeder, args=(self.proc.stdin,), daemon=True); tf.start()
        try:
            self.proc.wait(timeout=(self.duration_sec + 20) if self.duration_sec else None)
        except subprocess.TimeoutExpired:
            self.proc.kill(); self.proc.wait()
        self.stop_flag = True
        tf.join(timeout=3); te.join(timeout=3)
        return b"".join(err_chunks)


def main(sid: str, seconds: str = "12") -> None:
    """CLI smoke test: `python -m hgc streamv <station> [seconds]` renders a real local
    MP4 for manual/automated inspection. It touches no live service or secret."""
    config.ensure_dirs()
    from . import db
    db.connect()
    s = VerticalStreamer(sid, duration_sec=int(seconds))
    err = s.run()
    ok = s.out_path.exists() and s.out_path.stat().st_size > 0
    print(json.dumps({"ok": ok, "out": str(s.out_path), "bytes": s.out_path.stat().st_size if ok else 0,
                      "stderr_tail": (err or b"").decode(errors="replace")[-500:]}))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "lofi", sys.argv[2] if len(sys.argv) > 2 else "12")
