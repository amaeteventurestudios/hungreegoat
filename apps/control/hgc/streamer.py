"""Stream supervisor: runs one FFmpeg video pipeline for a station.

  background visual, looping (see BgFeeder — a small helper FFmpeg decodes+loops
    whichever clip Broadcast Visuals says is current, this process relays its raw
    frames into a FIFO the main FFmpeg reads as input 0; swapping the background for
    a new song only restarts the small helper, never the main process or the RTMPS
    connection)
  + overlay band (yuva420p frames piped from this process, updated on track change)
  + Liquidsoap AAC audio from the local harbor (stream-copied, no re-encode)
  → H.264 (hardware h264_v4l2m2m) + AAC → RTMPS (YouTube) | local FLV file | null

Also writes run/stream-<station>.json with real metrics parsed from FFmpeg's
-progress output (fps, bitrate, frames, uptime), captures FFmpeg's log, restarts
with backoff, and writes a periodic preview JPEG for the dashboard.
"""
from __future__ import annotations
import json
import os
import signal
import subprocess
import sys
import threading
import time
from pathlib import Path

from . import config, overlay

W, H = config.OVERLAY_W, config.OVERLAY_H
FRAME_BYTES = W * H * 3 // 2 + W * H  # yuva420p: Y + U/4 + V/4 + A
BG_FRAME_BYTES = config.VIDEO_W * config.VIDEO_H * 3 // 2  # yuv420p, no alpha


def _write_all(fd: int, data: bytes) -> None:
    """os.write() on a pipe/FIFO is not guaranteed to write the whole buffer in one call
    — for anything bigger than the kernel pipe buffer (a background frame is ~1.3 MB;
    the default pipe buffer is 64 KB) it can do a short write and silently return however
    many bytes it actually accepted, leaving the rest for the caller to retry. Ignoring
    that (as an early version of this code did) desyncs the raw-video byte stream after
    the first oversized write — every frame boundary after that is wrong. Found this by
    running the exact same background-swap test twice and getting a correct video once
    and a stalled/corrupt one the next time; a short write explains the inconsistency
    (kernel pipe buffer state is timing-dependent) that a version-number bug wouldn't."""
    mv = memoryview(data)
    while mv:
        n = os.write(fd, mv)
        mv = mv[n:]


class BgFeeder:
    """Owns the background-visual FIFO for one station: relays raw video frames from a
    small, freely-restartable helper FFmpeg (decoding+looping whichever clip is
    currently selected) into a FIFO the main FFmpeg process reads as a plain rawvideo
    input. The FIFO's write end is opened once and held open for the whole lifetime of
    the main FFmpeg process — only the helper is ever killed/respawned, so the main
    process's input never sees EOF and the RTMPS connection is never touched by a
    background-visual change.

    Track-change detection (see hgc/broadcast.py::advance_if_track_changed) is polled
    at most once a second — no per-frame DB/JSON work."""

    def __init__(self, sid: str, log_path: Path):
        self.sid = sid
        self.log_path = log_path
        self.stop_flag = False
        self._helper: subprocess.Popen | None = None
        self._helper_path: Path | None = None
        self._last_frame: bytes | None = None
        self._consecutive_failures = 0

    def fifo_path(self) -> Path:
        return config.RUN_DIR / f"bg-{self.sid}.fifo"

    def ensure_fifo(self) -> None:
        config.RUN_DIR.mkdir(parents=True, exist_ok=True)
        p = self.fifo_path()
        if not p.exists():
            os.mkfifo(str(p))

    def _spawn_helper(self, path: Path) -> subprocess.Popen:
        cmd = [
            "ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "warning", "-nostats",
            "-re", "-stream_loop", "-1", "-i", str(path),
            "-vf", f"scale={config.VIDEO_W}:{config.VIDEO_H}:force_original_aspect_ratio=increase,"
                   f"crop={config.VIDEO_W}:{config.VIDEO_H},fps={config.VIDEO_FPS}",
            "-f", "rawvideo", "-pix_fmt", "yuv420p", "pipe:1",
        ]
        return subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)

    def _kill_helper(self, proc: subprocess.Popen) -> None:
        try:
            proc.kill()
            proc.wait(timeout=3)
        except Exception:
            pass

    def _log(self, msg: str) -> None:
        try:
            with open(self.log_path, "ab") as lf:
                lf.write(f"[bg] {msg}\n".encode())
        except OSError:
            pass

    def run(self, is_alive) -> None:
        """is_alive: callable, True while the owning main FFmpeg process is still the
        current one — this thread exits as soon as it isn't, same contract as the
        overlay feeder.

        Never blocks waiting on the helper: a freshly (re)spawned FFmpeg needs real wall
        time to start producing frames (codec probe, decode warmup — tens to a couple
        hundred ms), and blocking on its first read for that long, every single time the
        background changes, would stall the FIFO and make the whole pipeline fall behind
        real time. Proven by a stress test that forced a switch every ~1s (vastly more
        often than a real track change) and made the encode run at roughly half speed
        until fixed. Real usage switches once per song — minutes apart — so this only
        ever matters as a safety margin, not a normal-path optimization."""
        import select
        from . import broadcast
        fifo_fd = os.open(str(self.fifo_path()), os.O_WRONLY)  # blocks until FFmpeg opens it to read
        last_check = 0.0
        current_path: Path | None = None
        partial = b""
        try:
            while not self.stop_flag and is_alive():
                now = time.time()
                if now - last_check > 1.0:
                    last_check = now
                    try:
                        path, _visual = broadcast.advance_if_track_changed(self.sid)
                    except Exception as e:
                        path = None
                        self._log(f"broadcast selection error: {e}")
                    if path and path != current_path:
                        old = self._helper
                        self._helper = self._spawn_helper(path)
                        current_path = path
                        partial = b""
                        self._consecutive_failures = 0
                        if old:
                            threading.Thread(target=self._kill_helper, args=(old,), daemon=True).start()

                if self._helper is None or self._helper.poll() is not None:
                    if self._helper is not None:
                        self._consecutive_failures += 1
                        self._log(f"background helper exited unexpectedly (failure #{self._consecutive_failures}) for {current_path}")
                    fallback = current_path if self._consecutive_failures < 3 else (
                        config.LOOP_720 if config.LOOP_720.exists() else config.LOOP_SOURCE)
                    self._helper = self._spawn_helper(fallback) if fallback else None
                    current_path = fallback
                    partial = b""
                    if self._last_frame:
                        _write_all(fifo_fd, self._last_frame)
                    time.sleep(0.03)
                    continue

                ready, _, _ = select.select([self._helper.stdout], [], [], 0.05)
                if ready:
                    chunk = self._helper.stdout.read(BG_FRAME_BYTES - len(partial))
                    if not chunk:
                        self._kill_helper(self._helper)
                        self._helper = None
                        continue
                    partial += chunk
                    if len(partial) < BG_FRAME_BYTES:
                        continue   # still assembling this frame — not a failure, just early
                    self._last_frame = partial
                    partial = b""
                    self._consecutive_failures = 0
                    _write_all(fifo_fd, self._last_frame)
                elif self._last_frame:
                    _write_all(fifo_fd, self._last_frame)
        except (BrokenPipeError, OSError) as e:
            self._log(f"feeder stopped: {e}")
        finally:
            if self._helper:
                self._kill_helper(self._helper)
            try:
                os.close(fifo_fd)
            except OSError:
                pass


def read_env_file(p: Path) -> dict:
    out = {}
    if p.exists():
        for line in p.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                out[k.strip()] = v.strip().strip('"').strip("'")
    return out


class Streamer:
    def __init__(self, sid: str):
        self.sid = sid
        self.st = config.station(sid)
        self.status_path = config.RUN_DIR / f"stream-{sid}.json"
        self.log_path = config.LOG_DIR / f"ffmpeg-{sid}.log"
        self.preview_path = config.RUN_DIR / f"preview-{sid}.jpg"
        self.proc: subprocess.Popen | None = None
        self.stop_flag = False
        self.frame = b""
        self.frame_mtime = 0.0
        self.state = {"station": sid, "state": "starting", "target": None, "started_at": None,
                      "restarts": 0, "last_error": None}
        self.progress = {}
        self._lock = threading.Lock()
        self._status_lock = threading.Lock()

    # ---- configuration ---------------------------------------------------
    def target(self) -> tuple[str, list[str], dict]:
        """Decide output from the station settings + secret file."""
        from . import db
        mode = db.get_setting(self.sid, "output_target", "youtube")
        sec = read_env_file(Path(self.st["youtube_secret"]))
        info = {"mode": mode, "youtube_configured": bool(sec.get("YOUTUBE_STREAM_KEY"))}
        if mode == "youtube":
            key = sec.get("YOUTUBE_STREAM_KEY", "")
            url = sec.get("YOUTUBE_RTMPS_URL", "rtmps://a.rtmps.youtube.com:443/live2")
            if not key:
                info["error"] = "no stream key configured"
                return "none", ["-f", "null", "-"], info
            return "youtube", ["-f", "flv", "-flvflags", "no_duration_filesize", f"{url.rstrip('/')}/{key}"], info
        if mode == "local":
            out = config.RUN_DIR / f"local-{self.sid}.flv"
            # bounded: FFmpeg stops at 300 MB, the supervisor restarts and overwrites (-y)
            return "local", ["-fs", "300M", "-f", "flv", str(out)], info
        return "none", ["-f", "null", "-"], info

    def ffmpeg_cmd(self, out_args: list[str], bg_fifo: Path) -> list[str]:
        vb = self.st["video_bitrate_k"]
        audio_url = f"http://127.0.0.1:{self.st['harbor_port']}/{self.sid}.aac"
        return [
            "ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "warning", "-nostats",
            "-progress", "pipe:1",
            # background visual — raw frames relayed from BgFeeder (see module docstring);
            # a full song's worth of the same clip, looping, until the next track change
            "-f", "rawvideo", "-pix_fmt", "yuv420p", "-s", f"{config.VIDEO_W}x{config.VIDEO_H}",
            "-framerate", str(config.VIDEO_FPS), "-thread_queue_size", "64", "-i", str(bg_fifo),
            # overlay frames from stdin (this process)
            "-f", "rawvideo", "-pix_fmt", "yuva420p", "-s", f"{W}x{H}", "-framerate", str(config.VIDEO_FPS),
            "-thread_queue_size", "64", "-i", "pipe:0",
            # Liquidsoap audio
            "-thread_queue_size", "1024", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
            "-i", audio_url,
            "-filter_complex",
            f"[0:v][1:v]overlay=0:{config.OVERLAY_Y}:format=yuv420:eof_action=repeat,format=yuv420p[v]",
            "-map", "[v]", "-map", "2:a:0",
            "-c:v", "h264_v4l2m2m", "-b:v", f"{vb}k", "-maxrate", f"{vb}k", "-bufsize", f"{vb*2}k",
            "-g", str(config.VIDEO_FPS * 2), "-r", str(config.VIDEO_FPS), "-pix_fmt", "yuv420p",
            "-c:a", "copy", "-max_muxing_queue_size", "1024",
            "-y", *out_args,
        ]

    # ---- overlay feed ----------------------------------------------------
    def load_frame(self) -> None:
        p = overlay.overlay_path(self.sid)
        if not p.exists():
            overlay.render_idle(self.sid)
        m = p.stat().st_mtime
        if m == self.frame_mtime and self.frame:
            return
        conv = subprocess.run(["ffmpeg", "-v", "error", "-i", str(p), "-f", "rawvideo", "-pix_fmt", "yuva420p", "-"],
                              capture_output=True, timeout=30)
        if conv.returncode == 0 and len(conv.stdout) == FRAME_BYTES:
            self.frame = conv.stdout
            self.frame_mtime = m

    def feeder(self, stdin) -> None:
        last_check = 0.0
        try:
            while not self.stop_flag and self.proc and self.proc.poll() is None:
                now = time.time()
                if now - last_check > 1.0:
                    try:
                        self.load_frame()
                    except Exception as e:
                        self.state["last_error"] = f"overlay: {e}"
                    last_check = now
                stdin.write(self.frame)   # blocks on back-pressure; FFmpeg paces via -re on the loop
        except (BrokenPipeError, OSError):
            pass
        finally:
            try:
                stdin.close()
            except Exception:
                pass

    def stderr_reader(self, stderr, lf, secret: str | None) -> None:
        """FFmpeg echoes the full output URL in its errors; the stream key must never reach the log."""
        for raw in iter(stderr.readline, b""):
            line = raw.decode(errors="replace")
            if secret and len(secret) > 4:
                line = line.replace(secret, "<redacted>")
            try:
                lf.write(line.encode()); lf.flush()
            except ValueError:
                break

    # ---- progress / status ------------------------------------------------
    def progress_reader(self, stdout) -> None:
        cur = {}
        for raw in iter(stdout.readline, b""):
            line = raw.decode(errors="replace").strip()
            if "=" not in line:
                continue
            k, v = line.split("=", 1)
            cur[k] = v
            if k == "progress":
                with self._lock:
                    self.progress = dict(cur)
                    self.progress["ts"] = time.time()
                self.write_status()
                cur = {}

    def write_status(self) -> None:
        with self._lock:
            p = dict(self.progress)
        st = dict(self.state)
        st.update({
            "pid": self.proc.pid if self.proc else None,
            "fps": float(p.get("fps") or 0) if p else None,
            "bitrate_kbps": _kbps(p.get("bitrate")) if p else None,
            "frame": int(p.get("frame") or 0) if p else None,
            "out_time_sec": _sec(p.get("out_time_us")) if p else None,
            "speed": p.get("speed"),
            "drop_frames": int(p.get("drop_frames") or 0) if p else None,
            "dup_frames": int(p.get("dup_frames") or 0) if p else None,
            "progress_ts": p.get("ts"),
            "uptime_sec": int(time.time() - self.state["started_at"]) if self.state.get("started_at") else 0,
            "preview": str(self.preview_path) if self.preview_path.exists() else None,
            "preview_kind": "composited",
            "encoder": "h264_v4l2m2m", "resolution": f"{config.VIDEO_W}x{config.VIDEO_H}", "fps_target": config.VIDEO_FPS,
            "video_bitrate_k": self.st["video_bitrate_k"], "audio_bitrate_k": self.st["audio_bitrate_k"],
        })
        with self._status_lock:
            tmp = self.status_path.with_suffix(f".{threading.get_ident()}.tmp")
            tmp.write_text(json.dumps(st))
            tmp.replace(self.status_path)
            self._maybe_preview()

    def _maybe_preview(self) -> None:
        """Composited preview (a loop frame + the live overlay band) every 20 s. This is a
        faithful rendering of what the pipeline composes, not a capture of the encoded output."""
        now = time.time()
        if now - getattr(self, "_preview_ts", 0) < 20 or self.state.get("state") != "running":
            return
        self._preview_ts = now
        try:
            from PIL import Image
            base = config.RUN_DIR / "loop-frame.jpg"
            if not base.exists():
                loop = config.LOOP_720 if config.LOOP_720.exists() else config.LOOP_SOURCE
                subprocess.run(["ffmpeg", "-v", "error", "-y", "-ss", "3", "-i", str(loop), "-frames:v", "1",
                                "-vf", "scale=1280:720", "-q:v", "3", str(base)], timeout=30)
            im = Image.open(base).convert("RGBA")
            ov = Image.open(overlay.overlay_path(self.sid)).convert("RGBA")
            im.alpha_composite(ov, (0, config.OVERLAY_Y))
            im = im.convert("RGB").resize((640, 360), Image.BILINEAR)
            tmp = self.preview_path.with_suffix(".tmp.jpg")
            im.save(tmp, "JPEG", quality=82)
            tmp.replace(self.preview_path)
        except Exception as e:
            self.state["last_error"] = f"preview: {e}"

    # ---- main loop -------------------------------------------------------
    def run(self) -> None:
        signal.signal(signal.SIGTERM, self._on_term)
        signal.signal(signal.SIGINT, self._on_term)
        backoff = 3
        while not self.stop_flag:
            mode, out_args, info = self.target()
            self.state.update(target=mode, target_info=info)
            if mode == "none" and info.get("error"):
                self.state.update(state="waiting", last_error=info["error"], started_at=None)
                self.write_status()
                for _ in range(20):
                    if self.stop_flag:
                        break
                    time.sleep(0.5)
                continue
            try:
                self.load_frame()
                if not (config.LOOP_720.exists() or config.LOOP_SOURCE.exists()):
                    raise OSError("animation loop not readable")
            except OSError as e:
                self.state.update(state="waiting", last_error=f"media drive: {e}", started_at=None)
                self.write_status(); time.sleep(15); continue
            bg = BgFeeder(self.sid, self.log_path)
            bg.ensure_fifo()
            cmd = self.ffmpeg_cmd(out_args, bg.fifo_path())
            with open(self.log_path, "ab") as lf:
                lf.write(f"\n=== {time.strftime('%Y-%m-%d %H:%M:%S')} starting ffmpeg target={mode}\n".encode())
                lf.write((" ".join(_redact(a) for a in cmd) + "\n").encode())
                lf.flush()
                self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
                proc = self.proc   # captured for this cycle's threads, independent of the next restart's reassignment
                secret = next((a.rsplit("/", 1)[-1] for a in out_args if a.startswith("rtmp")), None)
                threading.Thread(target=self.stderr_reader, args=(self.proc.stderr, lf, secret), daemon=True).start()
                self.state.update(state="running", started_at=time.time(), last_error=None)
                self.progress = {}
                self.write_status()
                t_feed = threading.Thread(target=self.feeder, args=(self.proc.stdin,), daemon=True)
                t_prog = threading.Thread(target=self.progress_reader, args=(self.proc.stdout,), daemon=True)
                t_bg = threading.Thread(target=bg.run, args=(lambda: proc.poll() is None,), daemon=True)
                t_feed.start(); t_prog.start(); t_bg.start()
                start = time.time()
                while self.proc.poll() is None and not self.stop_flag:
                    time.sleep(2)
                    self.write_status()
                    # stall detection: no progress update for 30s → restart
                    ts = self.progress.get("ts")
                    if ts and time.time() - ts > 30:
                        lf.write(b"\n[supervisor] no progress for 30s, restarting ffmpeg\n")
                        self._kill()
                        break
                rc = self.proc.poll()
            if self.stop_flag:
                break
            ran = time.time() - start
            self.state.update(state="restarting", restarts=self.state["restarts"] + 1,
                              last_error=f"ffmpeg exited rc={rc} after {int(ran)}s")
            self.write_status()
            backoff = 3 if ran > 120 else min(60, backoff * 2)
            for _ in range(int(backoff * 2)):      # interruptible so a stop lands immediately
                if self.stop_flag:
                    break
                time.sleep(0.5)
        self._kill()
        self.state.update(state="stopped")
        self.write_status()

    def _kill(self) -> None:
        if self.proc and self.proc.poll() is None:
            try:
                self.proc.terminate()
                self.proc.wait(timeout=8)
            except Exception:
                self.proc.kill()

    def _on_term(self, *_):
        self.stop_flag = True
        self._kill()
        self.state.update(state="stopped")
        try:
            self.write_status()
        except Exception:
            pass


def _kbps(v) -> float | None:
    if not v or v == "N/A":
        return None
    try:
        return round(float(v.replace("kbits/s", "")), 1)
    except ValueError:
        return None


def _sec(v) -> float | None:
    try:
        return round(int(v) / 1e6, 1)
    except (TypeError, ValueError):
        return None


def _redact(a: str) -> str:
    if a.startswith("rtmp"):
        return a.rsplit("/", 1)[0] + "/<redacted>"
    return a


def main(sid: str) -> None:
    config.ensure_dirs()
    Streamer(sid).run()


if __name__ == "__main__":
    main(sys.argv[1])
