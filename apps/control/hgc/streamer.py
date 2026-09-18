"""Stream supervisor: runs one FFmpeg video pipeline for a station.

  background visual, looping (see BgFeeder — a small helper FFmpeg decodes+loops
    whichever clip Broadcast Visuals says is current, this process relays its raw
    frames into a FIFO the main FFmpeg reads as input 0; swapping the background for
    a new song only restarts the small helper, never the main process or the RTMPS
    connection)
  + overlay band (yuva420p frames piped from this process, updated on track change)
  + Liquidsoap PCM/WAV audio from the local harbor (encoded to AAC here)
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

# How long the main supervisor loop can go without proving it's still making forward
# progress (see Streamer._beat/_watchdog) before we conclude it is wedged and force this
# whole process to exit so systemd can start a clean one. Found via a real ~10-hour
# incident where the supervisor process stayed alive and never logged another restart
# attempt after a crash — "the wrapper is still running" turned out not to mean "the
# stream is still running." Every intentional bounded wait in run() (10s "no target",
# 15s "media drive unreadable", up to 60s restart backoff, 8s graceful-kill) already
# re-beats on each of its own sleep ticks, so none of them can trip this on their own;
# this is only for a genuinely stuck call we didn't (or can't) bound directly.
WATCHDOG_TIMEOUT_SEC = 60


def _ts() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


_LOG_LOCK = threading.Lock()


def log_line(log_path: Path, tag: str, msg: str) -> None:
    """Every supervisor/BgFeeder log line goes through here so an incident can be
    reconstructed from timestamps alone — the previous BgFeeder logging had none, so a
    `[bg] feeder stopped: ...` line could only be dated by whichever `starting ffmpeg`
    line happened to be nearest it above."""
    line = f"[{_ts()}] [{tag}] {msg}\n"
    try:
        with _LOG_LOCK, open(log_path, "ab") as lf:
            lf.write(line.encode())
    except OSError:
        pass


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
        self._codec_cache: dict[str, str | None] = {}

    def fifo_path(self) -> Path:
        return config.RUN_DIR / f"bg-{self.sid}.fifo"

    def ensure_fifo(self) -> None:
        config.RUN_DIR.mkdir(parents=True, exist_ok=True)
        p = self.fifo_path()
        if not p.exists():
            os.mkfifo(str(p))

    def _probe_codec(self, path: Path) -> str | None:
        """Cached per path (helpers restart on every track change but the same clip is
        looped for a whole song, and this file's codec never changes mid-song)."""
        key = str(path)
        if key in self._codec_cache:
            return self._codec_cache[key]
        try:
            r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0",
                                "-show_entries", "stream=codec_name", "-of", "csv=p=0", str(path)],
                               capture_output=True, text=True, timeout=10)
            codec = r.stdout.strip() or None
        except Exception:
            codec = None
        self._codec_cache[key] = codec
        return codec

    def _spawn_helper(self, path: Path) -> subprocess.Popen:
        # Hardware-decode h264 sources (every skin video today, including the migrated
        # loop) exactly like the original single-process pipeline did — proven necessary:
        # software-decoding a 720p30 h264 clip alone pegged a full CPU core on this Pi 4
        # and dragged the whole encode below realtime (~0.9x, climbing load average past
        # the box's 4 cores). Falls back to software decode for anything else (e.g. a
        # webm upload), which is correct but slower; that trade-off only matters if an
        # operator puts a non-h264 clip in broadcast rotation.
        decode_args = ["-c:v", "h264_v4l2m2m"] if self._probe_codec(path) == "h264" else []
        cmd = [
            "ffmpeg", "-hide_banner", "-nostdin", "-loglevel", "warning", "-nostats",
            *decode_args, "-re", "-stream_loop", "-1", "-i", str(path),
            "-vf", f"scale={config.VIDEO_W}:{config.VIDEO_H}:force_original_aspect_ratio=increase,"
                   f"crop={config.VIDEO_W}:{config.VIDEO_H},fps={config.VIDEO_FPS}",
            "-f", "rawvideo", "-pix_fmt", "yuv420p", "pipe:1",
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, bufsize=0)
        # Default Linux pipe capacity is 64 KB; a frame is ~1.3 MB, so the steady-state
        # read loop was doing ~21 small reads (and 21 select() calls) per frame — measured
        # burning most of a CPU core in the Python relay loop alone. Grow the pipe as far
        # as this box allows (1 MB here) so each frame needs only ~2 reads. This is why a
        # helper CPU fix alone (hardware decode) wasn't enough on its own — the *relay*
        # loop was the other half of the same regression.
        try:
            import fcntl
            fcntl.fcntl(proc.stdout.fileno(), fcntl.F_SETPIPE_SZ, 1024 * 1024)
        except (OSError, AttributeError):
            pass
        return proc

    def _kill_helper(self, proc: subprocess.Popen) -> None:
        try:
            proc.kill()
            proc.wait(timeout=3)
        except Exception:
            pass

    def _log(self, msg: str) -> None:
        log_line(self.log_path, "bg", msg)

    def _open_fifo_wonly(self, is_alive) -> int | None:
        """open(path, O_WRONLY) on a FIFO blocks in the kernel until some other process
        has it open for reading — normally that's the main FFmpeg opening its input 0,
        and the rendezvous resolves in well under a second. But a *plain* blocking open()
        here is exactly the kind of call this module's own docstring warns about: if the
        main FFmpeg process that's supposed to become the reader never gets that far
        (stuck/erroring on a different input, or simply never started), this call — on
        this thread, holding no lock the main supervisor loop depends on — would still
        wait forever with nothing to time it out or make it visible. Poll for a reader
        with a non-blocking open instead, so the wait is bounded, interruptible by
        is_alive()/stop_flag, and shows up in the log if it's taking unusually long."""
        path = str(self.fifo_path())
        start = time.time()
        warned = False
        while not self.stop_flag and is_alive():
            try:
                fd = os.open(path, os.O_WRONLY | os.O_NONBLOCK)
            except OSError as e:
                import errno
                if e.errno != errno.ENXIO:  # ENXIO: no reader yet, the expected/normal case
                    self._log(f"fifo open error (not ENXIO): {e}")
                    return None
                if not warned and time.time() - start > 5:
                    warned = True
                    self._log(f"fifo open still waiting for a reader after {time.time()-start:.1f}s")
                time.sleep(0.05)
                continue
            # Drop O_NONBLOCK now that a reader exists — the rest of this feeder's life
            # uses normal blocking writes (see _write_all's own reasoning for why a
            # short/non-blocking write here would desync the raw-video byte stream).
            import fcntl
            flags = fcntl.fcntl(fd, fcntl.F_GETFL)
            fcntl.fcntl(fd, fcntl.F_SETFL, flags & ~os.O_NONBLOCK)
            waited = time.time() - start
            if waited > 1.0:
                self._log(f"fifo reader rendezvous took {waited:.1f}s (usually <1s)")
            return fd
        return None

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
        self._log("BgFeeder starting, opening fifo for write")
        fifo_fd = self._open_fifo_wonly(is_alive)
        if fifo_fd is None:
            self._log("BgFeeder exiting before a reader ever appeared (stopped or owner died)")
            return
        self._log(f"BgFeeder fifo opened, fd={fifo_fd}")
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
        except Exception as e:
            import traceback
            self._log(f"feeder crashed with unexpected exception: {e}\n{traceback.format_exc()}")
        finally:
            if self._helper:
                self._kill_helper(self._helper)
            try:
                os.close(fifo_fd)
            except OSError:
                pass
            self._log(f"BgFeeder exiting (stop_flag={self.stop_flag}, is_alive={is_alive()})")


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
        self._heartbeat = time.time()
        self._watchdog_stop = threading.Event()

    def _log(self, tag: str, msg: str) -> None:
        log_line(self.log_path, tag, msg)

    def _beat(self) -> None:
        """Called from the main thread at every point in run() that isn't itself
        individually time-bounded (or, inside a bounded wait, on every sleep tick) —
        proof that the supervisor's own control flow is still actually advancing, not
        just that the Python process happens to still exist. See _watchdog()."""
        self._heartbeat = time.time()

    def _watchdog(self) -> None:
        """Runs on its own daemon thread for the life of the process. This is the actual
        fix for the failure mode this incident exposed: "the supervisor process is alive"
        was being treated as equivalent to "the stream is being supervised", and there
        was no code path that ever checked whether that was still true. A daemon thread
        keeps running (CPython releases the GIL around blocking syscalls like the
        blocking os.write()/os.open() calls elsewhere in this module) even while the main
        thread is wedged inside one of them, which is exactly the scenario this needs to
        catch — a Python-level exception can't fix a stuck call on another thread, but
        os._exit() from over here can still end the whole process immediately, without
        waiting on or depending on whatever the main thread is stuck in. That's also why
        this must be os._exit(), not sys.exit() or raising: sys.exit() only works by
        raising SystemExit on the calling (watchdog) thread, which would just end *this*
        thread and leave the real, wedged main thread running exactly as before.
        systemd (Restart=always, RestartSec=8) does the rest."""
        while not self._watchdog_stop.wait(5):
            idle = time.time() - self._heartbeat
            if idle > WATCHDOG_TIMEOUT_SEC:
                self._log("watchdog", f"CRITICAL: no supervisor heartbeat for {idle:.1f}s "
                          f"(limit {WATCHDOG_TIMEOUT_SEC}s) — state={self.state} — "
                          f"forcing process exit so systemd restarts a clean one")
                try:
                    self.write_status()
                except Exception:
                    pass
                os._exit(1)

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
        ab = self.st["audio_bitrate_k"]
        audio_url = f"http://127.0.0.1:{self.st['harbor_port']}/{self.sid}.wav"
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
            # Liquidsoap audio — raw PCM/WAV over the loopback harbor (see station.liq).
            # Previously ADTS AAC: Liquidsoap's AAC encoder periodically emitted frames
            # with multiple RDBs per ADTS frame, which BOTH FFmpeg's aac_adtstoasc
            # bitstream filter (needed for -c:a copy into FLV) AND FFmpeg's native aac
            # decoder (tried when re-encoding instead) treat as a hard, unrecoverable
            # error ("More than one AAC RDB per ADTS frame is not implemented") — no
            # available alternative decoder (no libfdk_aac in this build) could parse
            # it either way, killing the whole process outright, not just dropping a
            # frame. Confirmed as the dominant cause of a real ~1-crash-per-40min
            # pattern in production (2026-09-18: 10 crashes across a 7-hour window).
            # Fixed at the source: station.liq now emits WAV on this internal,
            # loopback-only leg (127.0.0.1, never exposed externally) instead of AAC,
            # which has no such parsing edge case. The real AAC encode for actual
            # YouTube delivery still happens right here, just fed clean PCM instead.
            "-f", "wav",
            "-thread_queue_size", "1024", "-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_delay_max", "5",
            "-i", audio_url,
            "-filter_complex",
            f"[0:v][1:v]overlay=0:{config.OVERLAY_Y}:format=yuv420:eof_action=repeat,format=yuv420p[v]",
            "-map", "[v]", "-map", "2:a:0",
            "-c:v", "h264_v4l2m2m", "-b:v", f"{vb}k", "-maxrate", f"{vb}k", "-bufsize", f"{vb*2}k",
            "-g", str(config.VIDEO_FPS * 2), "-r", str(config.VIDEO_FPS), "-pix_fmt", "yuv420p",
            "-c:a", "aac", "-b:a", f"{ab}k", "-ar", "48000", "-ac", "2",
            "-max_muxing_queue_size", "1024",
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
        self._beat()   # called from the main loop constantly during normal operation, and
                        # from progress_reader() on its own thread too — either is fine
                        # proof of life, so this is the one place every path shares.
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
        self._log("supervisor", f"supervisor loop starting, pid={os.getpid()}")
        threading.Thread(target=self._watchdog, daemon=True).start()
        backoff = 3
        while not self.stop_flag:
            self._beat()
            mode, out_args, info = self.target()
            self.state.update(target=mode, target_info=info)
            if mode == "none" and info.get("error"):
                self.state.update(state="waiting", last_error=info["error"], started_at=None)
                self.write_status()
                for _ in range(20):
                    if self.stop_flag:
                        break
                    self._beat()
                    time.sleep(0.5)
                continue
            try:
                self.load_frame()
                if not (config.LOOP_720.exists() or config.LOOP_SOURCE.exists()):
                    raise OSError("animation loop not readable")
            except OSError as e:
                self.state.update(state="waiting", last_error=f"media drive: {e}", started_at=None)
                self.write_status()
                for _ in range(30):
                    if self.stop_flag:
                        break
                    self._beat()
                    time.sleep(0.5)
                continue
            bg = BgFeeder(self.sid, self.log_path)
            bg.ensure_fifo()
            cmd = self.ffmpeg_cmd(out_args, bg.fifo_path())
            self._log("supervisor", f"main ffmpeg starting, target={mode}")
            with open(self.log_path, "ab") as lf:
                lf.write(f"\n=== {_ts()} starting ffmpeg target={mode}\n".encode())
                lf.write((" ".join(_redact(a) for a in cmd) + "\n").encode())
                lf.flush()
                self.proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, bufsize=0)
                proc = self.proc   # captured for this cycle's threads, independent of the next restart's reassignment
                self._log("supervisor", f"main ffmpeg started, pid={self.proc.pid}")
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
                stalled = False
                got_first_progress = False
                while self.proc.poll() is None and not self.stop_flag:
                    self._beat()
                    time.sleep(2)
                    self.write_status()
                    ts = self.progress.get("ts")
                    if ts:
                        got_first_progress = True
                    # Stall detection has two distinct cases, not one: (a) it *was*
                    # producing progress and stopped (ts is stale), and (b) it never
                    # produced a first progress line at all (ts is still None). The
                    # original check only covered (a) — `if ts and ...` — so a process
                    # that started but hung before ever emitting one `-progress` line
                    # (stuck negotiating an input, e.g.) was invisible to this loop
                    # forever: not dead (poll() stays None), not "stalled" by the old
                    # check either, since a still-None ts made the condition False. This
                    # is the most likely explanation for the prior 10-hour incident: the
                    # process itself never actually exited, so nothing downstream of that
                    # (the exit-code branch, the backoff, the next restart) ever ran.
                    if ts and time.time() - ts > 30:
                        self._log("supervisor", f"stall detected: no progress update for {time.time()-ts:.0f}s, restarting ffmpeg")
                        stalled = True
                    elif not got_first_progress and time.time() - start > 20:
                        self._log("supervisor", f"stall detected: no progress line at all {time.time()-start:.0f}s after start, restarting ffmpeg")
                        stalled = True
                    if stalled:
                        if not self._kill():
                            # _kill() couldn't confirm death — spawning a replacement
                            # anyway would leave the old, still-alive process (quite
                            # possibly still holding the hardware encoder device) an
                            # orphan competing with the new one for the same resource,
                            # which is how one wedge turns into a wedge-on-every-attempt.
                            # Don't hand this back to the retry/backoff path at all —
                            # exit now so systemd tears down the whole cgroup (killing
                            # the orphan too) and starts genuinely clean, rather than
                            # waiting out the full watchdog timeout for a failure we
                            # already know happened.
                            self._log("supervisor", "CRITICAL: giving up on killing the wedged process — exiting immediately for systemd to recover")
                            self.write_status()
                            os._exit(1)
                        break
                rc = self.proc.poll()
                self._log("supervisor", f"main ffmpeg exited, pid={proc.pid} rc={rc} ran_for={time.time()-start:.1f}s"
                          + (" (forced: stalled)" if stalled else ""))
            if self.stop_flag:
                break
            ran = time.time() - start
            self.state.update(state="restarting", restarts=self.state["restarts"] + 1,
                              last_error=f"ffmpeg exited rc={rc} after {int(ran)}s")
            self.write_status()
            backoff = 3 if ran > 120 else min(60, backoff * 2)
            self._log("supervisor", f"retry attempt #{self.state['restarts']}, delay={backoff:.0f}s")
            for _ in range(int(backoff * 2)):      # interruptible so a stop lands immediately
                if self.stop_flag:
                    break
                self._beat()
                time.sleep(0.5)
        self._kill()
        self._watchdog_stop.set()
        self.state.update(state="stopped")
        self.write_status()
        self._log("supervisor", "supervisor loop exiting cleanly (stop requested)")

    def _kill(self) -> bool:
        """Returns True once the process is confirmed actually gone. SIGKILL cannot be
        blocked or ignored by a normal process, but it also isn't a promise of *instant*
        death, and — for a process wedged in an uninterruptible kernel wait (e.g. stuck
        on a hardware V4L2 M2M ioctl, a known class of issue on this Pi's encoder under
        resource pressure) — it can do nothing at all until that syscall returns on its
        own. The previous version fired kill() and returned immediately either way, with
        nothing checking whether it actually worked; if it hadn't, every following
        assumption (poll() will show it as exited, the next Popen() call is safe to
        make, another attempt on the same hardware device won't just fail again) was
        silently wrong. This can't force a truly wedged process to die — nothing in
        userspace can — but it can tell the difference and say so loudly, and the
        watchdog is what actually recovers from that case by taking the whole supervisor
        process down for systemd to replace."""
        if not self.proc or self.proc.poll() is not None:
            return True
        pid = self.proc.pid
        try:
            self.proc.terminate()
            self.proc.wait(timeout=8)
            self._log("supervisor", f"main ffmpeg pid={pid} terminated gracefully")
            return True
        except Exception:
            pass
        try:
            self.proc.kill()
            self.proc.wait(timeout=5)
            self._log("supervisor", f"main ffmpeg pid={pid} required SIGKILL")
            return True
        except Exception as e:
            self._log("supervisor", f"CRITICAL: main ffmpeg pid={pid} would not die after SIGKILL ({e}) "
                      "— likely wedged in an uninterruptible kernel wait; relying on the watchdog")
            return False

    def _on_term(self, *_):
        self.stop_flag = True
        self._kill()
        self._watchdog_stop.set()
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
