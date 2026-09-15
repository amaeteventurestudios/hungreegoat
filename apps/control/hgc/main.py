"""HUNGREE Goat Control — FastAPI backend.

Everything the browser can do goes through explicit, validated endpoints; there is
no shell passthrough and the Liquidsoap socket is only reachable from this process.
"""
from __future__ import annotations
import json
import os
import re
import threading
import time
from pathlib import Path
from typing import Any

import hashlib
import shutil
import subprocess
import urllib.request

from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.exceptions import RequestValidationError
from fastapi.responses import FileResponse, HTMLResponse, JSONResponse, PlainTextResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from . import auth, catalog, config, db, liq, metrics, overlay, scheduler, selector, services

app = FastAPI(title="HUNGREE Goat Control", docs_url=None, redoc_url=None, openapi_url=None)


@app.exception_handler(RequestValidationError)
async def _friendly_validation_error(request: Request, exc: RequestValidationError):
    """The operator UI shows `detail` verbatim in a toast — never leak raw Pydantic
    error objects (field locations, type names) to that surface."""
    first = exc.errors()[0] if exc.errors() else {}
    field = ".".join(str(p) for p in first.get("loc", []) if p not in ("body", "path", "query")) or "request"
    return JSONResponse(status_code=422, content={"detail": f"Invalid {field}: {first.get('msg', 'value not accepted')}"})

# ---------------------------------------------------------------------------
# Runtime state (per station): now playing + last-known health. Persisted history in DB.
NOW: dict[str, dict] = {s: {"title": None, "artist": None, "started_at": None, "track_id": None,
                            "source": None, "kind": None, "filename": None, "duration": None,
                            "artwork": None, "album": None, "genre": None} for s in config.STATION_IDS}
LAST_SILENCE: dict[str, float] = {}
STARTED = time.time()


@app.on_event("startup")
def _startup() -> None:
    config.ensure_dirs()
    db.connect()
    auth.bootstrap()
    for sid in config.STATION_IDS:
        scheduler.ensure_defaults(sid)
        try:
            catalog.ensure_default_playlists(sid)
            catalog.write_liquidsoap_playlists(sid)
        except OSError as e:   # media drive unusable — keep the control panel up regardless
            db.log_event("critical", "usb", f"Media drive error during startup: {e}", sid)
        if not overlay.overlay_path(sid).exists():
            try:
                overlay.render_idle(sid)
            except Exception as e:
                db.log_event("error", "system", f"overlay render failed: {e}", sid)
    _sync_default_artwork()
    db.log_event("info", "system", "HUNGREE Goat Control backend started")
    threading.Thread(target=_watchdog, daemon=True).start()


def _sync_default_artwork() -> None:
    """The branded default cover ships with the app; keep the media-drive copy (used in
    Liquidsoap annotations and the video overlay) identical to it."""
    try:
        b = config.DEFAULT_ARTWORK_BUNDLED
        d = config.DEFAULT_ARTWORK
        if b.exists() and (not d.exists() or d.stat().st_size != b.stat().st_size):
            if d.exists() and not (config.ARTWORK_DIR / "default-legacy.jpg").exists():
                shutil.copy2(d, config.ARTWORK_DIR / "default-legacy.jpg")
            shutil.copy2(b, d)
            db.log_event("info", "media", "Default track artwork updated to the branded HUNGREE Goat cover")
    except OSError as e:
        db.log_event("warning", "media", f"Could not sync default artwork: {e}")


def _watchdog() -> None:
    """Background: push runtime switches to Liquidsoap when it (re)starts, log schedule
    switches and USB problems. Runs every 15s."""
    last_sched: dict[str, Any] = {}
    last_usb = True
    last_repair = 0.0
    synced: dict[str, bool] = {}
    stall: dict[str, list] = {}   # sid -> [last_elapsed, unchanged_since]
    silent_since: dict[str, float] = {}
    while True:
        try:
            u = metrics.usb()
            usb_ok = u["mounted"] and u.get("writable", False) and not u.get("fs_shutdown")
            if not usb_ok and time.time() - last_repair > 600 and services.usb_repair_available():
                last_repair = time.time()
                db.log_event("warning", "usb", "Drive unusable — running automatic repair (fsck + remount)")
                r = services.usb_repair()
                db.log_event("info" if r["ok"] else "error", "usb", "Automatic repair " + ("started" if r["ok"] else "could not start"), detail=r.get("output"))
            if usb_ok != last_usb:
                if usb_ok:
                    db.log_event("info", "usb", "HUNGREE-GOAT drive mounted and writable")
                    db.resolve_alerts("usb")
                else:
                    db.log_event("critical", "usb", "HUNGREE-GOAT drive unusable: " + (
                        "filesystem in shutdown state after I/O errors — run sudo ~/hungree-goat/bin/hgc-usb-repair.sh"
                        if u.get("fs_shutdown") else u.get("error", "not mounted")))
                last_usb = usb_ok
            for sid in config.STATION_IDS:
                lp = config.RUN_DIR / f"liq-{sid}.log"
                try:
                    if lp.exists() and lp.stat().st_size > 20_000_000:
                        tail = lp.read_bytes()[-2_000_000:]
                        lp.write_bytes(tail)   # Liquidsoap appends; keep the last ~2 MB
                except OSError:
                    pass
                ev = scheduler.evaluate(sid)
                cur = ev["current"]["id"] if ev["current"] else None
                if sid in last_sched and last_sched[sid] != cur:
                    name = ev["current"]["name"] if ev["current"] else "default rotation"
                    db.log_event("info", "schedule", f"Switched to {name}", sid)
                last_sched[sid] = cur
                alive = liq.alive(sid)
                if alive:
                    db.resolve_alerts("stream", sid) if _stream_status(sid).get("state") == "running" else None
                    # Stall guard: audio position must advance while a track is on air.
                    pos = liq.position(sid).get("elapsed")
                    prev = stall.get(sid)
                    if pos is None or prev is None or pos != prev[0]:
                        stall[sid] = [pos, time.time()]
                    elif time.time() - prev[1] > 90 and db.q1("SELECT 1 FROM tracks WHERE station=? AND corrupt=0 LIMIT 1", (sid,)):
                        stall[sid] = [pos, time.time()]
                        db.log_event("critical", "stream", "Audio engine stalled (position frozen 90 s) — restarting Liquidsoap", sid)
                        services.action("liquidsoap", "restart", sid)
                        synced[sid] = False
                        continue
                if alive:
                    # Output-silence guard: a track is on air but the encoder input is dead silent.
                    rms = liq.rms(sid)
                    if rms is not None and rms < 0.0005 and db.q1("SELECT 1 FROM tracks WHERE station=? AND corrupt=0 LIMIT 1", (sid,)):
                        silent_since.setdefault(sid, time.time())
                        if time.time() - silent_since[sid] > 90:
                            silent_since[sid] = time.time()
                            db.log_event("critical", "silence", "Station output has been silent for 90 s while a track is on air — restarting the audio engine", sid)
                            services.action("liquidsoap", "restart", sid)
                            synced[sid] = False
                            continue
                    else:
                        silent_since.pop(sid, None)
                if alive and not synced.get(sid):
                    _push_settings(sid)
                    synced[sid] = True
                elif not alive:
                    synced[sid] = False
        except Exception as e:
            db.log_event("warning", "system", f"watchdog: {e}")
        time.sleep(15)


def _push_settings(sid: str) -> None:
    s = db.get_settings(sid)
    for var, key in (("force_fallback", "force_fallback"), ("silence_guard", "silence_guard"),
                     ("live_enabled", "live_mic_enabled"), ("remote_enabled", "live_remote_enabled")):
        try:
            liq.set_var(sid, var, bool(s.get(key)))
        except liq.LiqError:
            pass
    try:
        url = str(s.get("live_remote_url") or "")
        if s.get("live_remote_enabled") and url.startswith(("http://", "https://")):
            liq.command(sid, f"remote.url {url}")
            liq.command(sid, "remote.start")
        else:
            liq.command(sid, "remote.stop")
    except liq.LiqError:
        pass


# ---------------------------------------------------------------------------
# Auth
def current_user(request: Request) -> str:
    user = auth.check(request.cookies.get(auth.COOKIE))
    if not user:
        raise HTTPException(401, "not authenticated")
    return user


def internal_only(request: Request) -> None:
    if request.client and request.client.host not in ("127.0.0.1", "::1"):
        raise HTTPException(403, "internal endpoint")
    if request.headers.get("X-HGC-Token") != auth.internal_token():
        db.log_event("warning", "auth", "internal endpoint called with bad token")
        raise HTTPException(403, "bad token")


class Login(BaseModel):
    username: str
    password: str


@app.post("/api/login")
def login(body: Login, request: Request, response: Response):
    ip = request.client.host if request.client else "?"
    if not auth.verify(body.username.strip(), body.password):
        db.log_event("warning", "auth", f"Failed login for '{body.username[:32]}' from {ip}")
        time.sleep(0.8)
        raise HTTPException(401, "invalid credentials")
    secure = request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https"
    response.set_cookie(auth.COOKIE, auth.issue(body.username), httponly=True, samesite="lax", secure=secure,
                        max_age=auth.SESSION_TTL, path="/")
    db.log_event("info", "auth", f"Operator signed in from {ip}")
    return {"ok": True, "user": body.username}


@app.post("/api/logout")
def logout(response: Response, user: str = Depends(current_user)):
    response.delete_cookie(auth.COOKIE)
    db.log_event("info", "auth", "Operator signed out")
    return {"ok": True}


@app.get("/api/health")
def health():
    """Unauthenticated liveness probe (used by systemd ordering); reveals nothing."""
    return {"ok": True}


@app.get("/api/me")
def me(user: str = Depends(current_user)):
    return {"user": user}


class PasswordChange(BaseModel):
    current: str
    new: str


@app.post("/api/password")
def change_password(body: PasswordChange, user: str = Depends(current_user)):
    if not auth.verify(user, body.current):
        raise HTTPException(400, "Current password is incorrect")
    if len(body.new) < 9:
        raise HTTPException(400, "New password must be at least 9 characters")
    if body.new == body.current:
        raise HTTPException(400, "New password must be different from your current password")
    auth.set_password(user, body.new)
    try:
        auth.PASSWORD_FILE.unlink()
    except OSError:
        pass
    db.log_event("info", "auth", "Operator password changed")
    return {"ok": True}


# ---------------------------------------------------------------------------
# Internal endpoints used by Liquidsoap (loopback + token only)
@app.get("/api/internal/next", response_class=PlainTextResponse)
def internal_next(station: str, request: Request):
    internal_only(request)
    uri, info = selector.next_uri(station)
    if uri is None:
        return ""
    return uri


class NowPlaying(BaseModel):
    station: str
    filename: str = ""
    title: str = ""
    artist: str = ""
    source: str = "unknown"
    rid: str = ""
    track_id: str = ""
    on_air: str = ""


@app.post("/api/internal/now-playing")
def internal_now_playing(body: NowPlaying, request: Request):
    internal_only(request)
    sid = body.station
    if sid not in config.STATIONS:
        raise HTTPException(400, "unknown station")
    t = None
    if body.track_id.isdigit():
        r = db.q1("SELECT * FROM tracks WHERE id=?", (int(body.track_id),))
        t = dict(r) if r else None
    elif body.filename:
        r = db.q1("SELECT * FROM tracks WHERE path=?", (body.filename,))
        t = dict(r) if r else None
    if body.source == "unknown":   # live/remote inputs carry no annotation
        ls = liq.status(sid)
        body.source = "live" if ls.get("live") == "true" else ("remote" if ls.get("remote") == "true" else "unknown")
    prev = NOW[sid]
    # Replayed metadata (switch resuming a track) or crossfade duplicates: same file and
    # source as what we already have → nothing new happened.
    if prev.get("filename") == body.filename and prev.get("source") == body.source and body.filename:
        return {"ok": True, "duplicate": True}
    now = {
        "title": body.title or (t and t["title"]) or Path(body.filename).stem or "Unknown",
        "artist": body.artist or (t and t["artist"]) or "HUNGREE Goat",
        "album": t["album"] if t else "",
        "genre": t["genre"] if t else config.station(sid)["genre"],
        "filename": body.filename, "track_id": t["id"] if t else None,
        "duration": t["duration"] if t else None, "source": body.source,
        "artwork": (t and t["resolved_artwork"]) or str(config.DEFAULT_ARTWORK),
        "kind": "music", "started_at": time.time(),
    }
    NOW[sid] = now
    if now["track_id"] in selector.SERVED.get(sid, []):
        selector.SERVED[sid].remove(now["track_id"])
    with db.tx() as c:
        c.execute("INSERT INTO play_history(station,track_id,title,artist,filename,started_at,source) VALUES(?,?,?,?,?,?,?)",
                  (sid, now["track_id"], now["title"], now["artist"], body.filename, now["started_at"], body.source))
        if t:
            c.execute("UPDATE tracks SET play_count=play_count+1, last_played=? WHERE id=?", (now["started_at"], t["id"]))
        c.execute("DELETE FROM play_history WHERE id < (SELECT COALESCE(MAX(id),0) FROM play_history) - 5000")
    src_label = {"main": "", "backup": " [backup playlist]", "emergency": " [emergency loop]",
                 "live": " [LIVE INPUT]", "remote": " [remote input]"}.get(body.source, f" [{body.source}]")
    db.log_event("info", "track", f"Now playing: {now['title']} — {now['artist']}{src_label}", sid)
    if prev.get("source") != body.source and prev.get("source") is not None:
        sev = "warning" if body.source in ("backup", "emergency") else "info"
        db.log_event(sev, "fallback", f"Source changed: {prev.get('source')} → {body.source}", sid)
    if db.get_setting(sid, "artwork_sync", True):
        try:
            overlay.render(sid, now["title"], now["artist"], now["album"] or "", now["artwork"])
        except Exception as e:
            db.log_event("error", "system", f"overlay render failed: {e}", sid)
    return {"ok": True}


class InternalEvent(BaseModel):
    station: str
    severity: str = "info"
    category: str = "system"
    message: str


@app.post("/api/internal/event")
def internal_event(body: InternalEvent, request: Request):
    internal_only(request)
    if body.category == "silence":
        # debounce: blank.detect can fire repeatedly
        if time.time() - LAST_SILENCE.get(body.station, 0) < 60:
            return {"ok": True, "debounced": True}
        LAST_SILENCE[body.station] = time.time()
    db.log_event(body.severity, body.category, body.message[:500], body.station)
    return {"ok": True}


# ---------------------------------------------------------------------------
# Status assembly
def _stream_status(sid: str) -> dict:
    p = config.RUN_DIR / f"stream-{sid}.json"
    try:
        d = json.loads(p.read_text())
        # stale if the supervisor hasn't written for a while
        d["stale"] = (time.time() - p.stat().st_mtime) > 20
        if d.get("state") != "stopped" and not services.state("stream", sid)["active"]:
            d["state"] = "stopped"; d["stale"] = False   # unit is down: the file is history
        if d.get("state") == "running" and d.get("target") == "youtube" and not d["stale"] and (d.get("uptime_sec") or 0) > 20:
            last = db.get_setting(sid, "youtube_last_connected")
            if not last or time.time() - last > 60:
                db.set_setting(sid, "youtube_last_connected", time.time())
        return d
    except Exception:
        return {"state": "stopped", "stale": True}


def _youtube_configured(sid: str) -> bool:
    p = Path(config.station(sid)["youtube_secret"])
    if not p.exists():
        return False
    for line in p.read_text().splitlines():
        if line.strip().startswith("YOUTUBE_STREAM_KEY=") and len(line.split("=", 1)[1].strip()) > 4:
            return True
    return False


def _sync_now_from_liq(sid: str) -> None:
    """After a backend restart, rebuild now-playing from what Liquidsoap says is on air."""
    md = liq.on_air_metadata(sid)
    if not md:
        return
    tid = md.get("hgc_track_id")
    t = db.q1("SELECT * FROM tracks WHERE id=?", (int(tid),)) if tid and tid.isdigit() else None
    NOW[sid] = {
        "title": md.get("title") or (t and t["title"]) or Path(md.get("filename", "")).stem or "Unknown",
        "artist": md.get("artist") or (t and t["artist"]) or "HUNGREE Goat",
        "album": (t and t["album"]) or md.get("album", ""), "genre": (t and t["genre"]) or config.station(sid)["genre"],
        "filename": md.get("filename"), "track_id": t["id"] if t else None, "duration": t["duration"] if t else None,
        "source": md.get("hgc_source", "unknown"), "artwork": (t and t["resolved_artwork"]) or str(config.DEFAULT_ARTWORK),
        "kind": "music", "started_at": None,
    }
    if db.get_setting(sid, "artwork_sync", True):
        try:
            overlay.render(sid, NOW[sid]["title"], NOW[sid]["artist"], NOW[sid]["album"] or "", NOW[sid]["artwork"])
        except Exception:
            pass


def _reconcile_now(sid: str, state: dict) -> None:
    """The on_metadata callback can be swallowed during a switch transition; the engine's
    actual current request is authoritative. Rebuild NOW when they disagree."""
    src = state.get("on_air_source") or NOW[sid].get("source")
    if state.get("live") is True:      # a live input is connected and has priority: no track metadata exists
        if NOW[sid].get("source") != "live":
            prev_src = NOW[sid].get("source")
            NOW[sid] = {"title": "Live from this device", "artist": "HUNGREE Goat DJ", "album": "", "genre": config.station(sid)["genre"],
                        "filename": None, "track_id": None, "duration": None, "source": "live", "artwork": str(config.DEFAULT_ARTWORK),
                        "kind": "live", "started_at": time.time()}
            db.log_event("warning", "fallback", f"Source changed: {prev_src} → live (DJ input on air)", sid)
            try:
                overlay.render(sid, "Live", "HUNGREE Goat DJ", "Live from the studio", None, kind="live")
            except Exception:
                pass
        return
    if NOW[sid].get("source") == "live":
        NOW[sid]["source"] = None   # live ended: fall through and rebuild from the engine's current request
    cur = state.get("main_current") if src == "main" else state.get("backup_current") if src == "backup" else None
    if cur and str(cur).isdigit() and NOW[sid].get("track_id") != int(cur):
        t = db.q1("SELECT * FROM tracks WHERE id=?", (int(cur),))
        if t:
            internal_now_playing(NowPlaying(station=sid, filename=t["path"], title=t["title"], artist=t["artist"], source=src,
                                            track_id=str(t["id"])), _LocalRequest())
    elif NOW[sid].get("title") is None:
        _sync_now_from_liq(sid)


class _LocalRequest:
    """Minimal stand-in so the internal handler's loopback/token check passes for in-process calls."""
    client = type("c", (), {"host": "127.0.0.1"})()
    headers = {}

    def __init__(self):
        self.headers = {"X-HGC-Token": auth.internal_token()}


def station_status(sid: str) -> dict:
    st = config.station(sid)
    ls = liq.status(sid)
    liq_alive = "uptime" in ls
    if liq_alive:
        _reconcile_now(sid, ls_full := liq.state(sid))
    now = dict(NOW[sid])
    pos = liq.position(sid) if liq_alive else {}
    remaining = pos.get("remaining")
    elapsed = pos.get("elapsed")
    if elapsed is None and now.get("started_at"):
        elapsed = time.time() - now["started_at"]
    if now.get("duration") and elapsed is not None:
        elapsed = min(elapsed, now["duration"])
        remaining = max(0.0, now["duration"] - elapsed)
    stream = _stream_status(sid)
    svc_liq = services.state("liquidsoap", sid)
    svc_str = services.state("stream", sid)
    settings = db.get_settings(sid)
    sched = scheduler.evaluate(sid)
    queue = selector.upcoming(sid)
    prepared = selector.prepared(sid) if liq_alive else []
    lib = db.q1("SELECT COUNT(*) n, COALESCE(SUM(duration),0) d, COALESCE(SUM(size),0) b FROM tracks WHERE station=? AND corrupt=0", (sid,))
    source = now.get("source") if liq_alive else None
    source_label = {"main": "Scheduled playlist", "backup": "Backup playlist", "emergency": "Emergency loop",
                    "live": "Live input", "remote": "Remote input"}.get(source or "", "—")
    on_air = liq_alive and stream.get("state") == "running" and stream.get("target") == "youtube" and not stream.get("stale")
    fallback_state = {
        "forced": bool(settings.get("force_fallback")),
        "primary": {"name": "Scheduled playlist", "state": "active" if source == "main" else ("ready" if ls.get("main") == "true" else "unavailable")},
        "backup": {"name": "Chill Fallback Mix", "state": "active" if source == "backup" else ("ready" if ls.get("backup") == "true" else "unavailable")},
        "emergency": {"name": "Emergency loop (/fallback)", "state": "active" if source == "emergency" else ("ready" if ls.get("emergency") == "true" else "empty")},
        "silence": {"name": "Silence failover", "state": "enabled" if settings.get("silence_guard") else "disabled",
                    "detail": "Skip after 12 s of silence"},
    }
    return {
        "id": sid, "name": st["name"], "short": st["short"], "genre": st["genre"], "tags": st["tags"],
        "liquidsoap": {"alive": liq_alive, **ls, "service": svc_liq},
        "stream": {**stream, "service": svc_str, "youtube_configured": _youtube_configured(sid),
                   "output_target": settings.get("output_target")},
        "on_air": on_air,
        "audio_running": liq_alive,
        "now_playing": {**now, "elapsed": elapsed, "remaining": remaining, "source_label": source_label},
        "schedule": sched, "queue": queue, "queue_depth": len(queue), "prepared": prepared, "planned": selector.planned(sid),
        "settings": settings, "fallback": fallback_state,
        "library": {"tracks": lib["n"], "duration": lib["d"], "bytes": lib["b"], "empty": lib["n"] == 0},
        "live": {"mic_enabled": settings.get("live_mic_enabled"), "remote_enabled": settings.get("live_remote_enabled"),
                 "remote_url": settings.get("live_remote_url"), "mic_ready": ls.get("live") == "true",
                 "remote_ready": ls.get("remote") == "true", "live_port": st["live_port"]},
    }


@app.get("/api/overview")
def overview(user: str = Depends(current_user)):
    sys_ = metrics.snapshot()
    stations = {sid: station_status(sid) for sid in config.STATION_IDS}
    events = db.rows(db.q("SELECT * FROM events ORDER BY id DESC LIMIT 40"))
    ctrl = services.state("control")
    health = _health(sys_, stations)
    return {"ts": time.time(), "system": sys_, "stations": stations, "events": events, "health": health,
            "control": {"uptime_sec": int(time.time() - STARTED), "service": ctrl}}


def _health(sys_: dict, stations: dict) -> dict:
    checks = []
    def add(name, ok, detail, level="warning"):
        checks.append({"name": name, "ok": bool(ok), "detail": detail, "level": "ok" if ok else level})
    u = sys_["usb"]
    add("USB drive", u["mounted"] and u.get("writable") and not u.get("fs_shutdown"),
        ("I/O ERROR — needs repair" if u.get("fs_shutdown") or u.get("error") else config.MEDIA.as_posix()), "critical")
    add("CPU", sys_["cpu_percent"] < 85, f"{sys_['cpu_percent']:.0f}% load {sys_['load'][0]}")
    add("Memory", sys_["ram"]["percent"] < 90, f"{sys_['ram']['percent']:.0f}% used")
    add("Temperature", (sys_["temp_c"] or 0) < 75, f"{sys_['temp_c']:.1f} °C" if sys_["temp_c"] else "n/a")
    add("Power/throttle", sys_["throttle"].get("ok", True), sys_["throttle"].get("raw") or "n/a")
    add("Disk (HUNGREE-GOAT)", sys_["usb"].get("percent", 0) < 92, f"{sys_['usb'].get('percent', 0)}% used")
    for sid, s in stations.items():
        if s["library"]["empty"]:
            continue  # a station waiting for media is not a fault
        add(f"{s['short']} audio", s["liquidsoap"]["alive"], "Liquidsoap " + ("running" if s["liquidsoap"]["alive"] else "down"), "error")
        stream = s["stream"]
        if stream.get("output_target") in ("youtube", "local"):
            ok = stream.get("state") == "running" and not stream.get("stale")
            add(f"{s['short']} video", ok, f"FFmpeg {stream.get('state', 'stopped')}"
                + (f", {stream.get('fps', 0):.0f} fps" if ok and stream.get('fps') else ""), "error")
    nominal = all(c["ok"] for c in checks)
    return {"nominal": nominal, "checks": checks, "usb_repair_available": services.usb_repair_available()}


@app.get("/api/system")
def system(user: str = Depends(current_user)):
    return metrics.snapshot()


@app.post("/api/system/usb-repair")
def usb_repair(user: str = Depends(current_user)):
    if not services.usb_repair_available():
        raise HTTPException(409, "repair helper not installed — run sudo ~/hungree-goat/bin/hgc-usb-repair.sh on the Pi")
    db.log_event("warning", "usb", "Operator requested USB drive repair (runs detached; playback stops during fsck)")
    r = services.usb_repair()
    if not r["ok"]:
        db.log_event("error", "usb", "USB repair could not be started", detail=r.get("output"))
    return r


@app.get("/api/system/usb-repair")
def usb_repair_status(user: str = Depends(current_user)):
    return {"running": services.repair_running(), "log": services.repair_log(60)}


@app.get("/api/stations")
def stations(user: str = Depends(current_user)):
    return {sid: station_status(sid) for sid in config.STATION_IDS}


@app.get("/api/stations/{sid}")
def station_one(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    return station_status(sid)


def _safe_playlists(sid: str) -> None:
    try:
        catalog.write_liquidsoap_playlists(sid)
    except OSError as e:
        db.log_event("error", "usb", f"Could not write fallback playlist: {e}", sid)


def _sid(sid: str) -> str:
    if sid not in config.STATIONS:
        raise HTTPException(404, "unknown station")
    return sid


# ---------------------------------------------------------------------------
# Playback controls
@app.get("/api/stations/{sid}/meter")
def meter(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    v = liq.rms(sid)
    return {"rms": v, "db": (20 * __import__("math").log10(v) if v and v > 0 else None)}


@app.post("/api/stations/{sid}/skip")
def skip(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    try:
        if liq.queue_len(sid) == 0:
            liq.wait_ready(sid, 2.0)   # never skip into an empty queue (that would trigger the fallback)
        r = liq.skip(sid)
    except liq.LiqError as e:
        raise HTTPException(503, f"Liquidsoap unavailable: {e}")
    db.log_event("info", "track", "Operator skipped track", sid)
    return {"ok": True, "result": r}


class FallbackBody(BaseModel):
    force: bool


@app.post("/api/stations/{sid}/fallback")
def set_fallback(sid: str, body: FallbackBody, user: str = Depends(current_user)):
    _sid(sid)
    db.set_setting(sid, "force_fallback", body.force)
    try:
        liq.set_var(sid, "force_fallback", body.force)
    except liq.LiqError as e:
        db.log_event("warning", "fallback", f"Fallback toggle stored but Liquidsoap unreachable: {e}", sid)
    db.log_event("warning" if body.force else "info", "fallback",
                 "Operator forced fallback source" if body.force else "Operator released fallback; automation resumed", sid)
    return {"ok": True, "force": body.force}


class SettingsBody(BaseModel):
    settings: dict[str, Any]


SETTING_KEYS = set(db.DEFAULT_SETTINGS)


@app.post("/api/stations/{sid}/settings")
def set_settings(sid: str, body: SettingsBody, user: str = Depends(current_user)):
    _sid(sid)
    changed = []
    for k, v in body.settings.items():
        if k not in SETTING_KEYS or k == "sequential_cursor":
            raise HTTPException(400, f"unknown setting {k}")
        if k == "crossfade_sec":
            v = max(0.0, min(15.0, float(v)))
        if k in ("shuffle", "sequential"):
            v = bool(v)
        if k == "output_target" and v not in ("youtube", "local", "none"):
            raise HTTPException(400, "bad output target")
        if k == "public_up_next_count":
            v = int(v)
            if v not in (3, 5, 10):
                raise HTTPException(400, "Public Up Next Count must be 3, 5 or 10")
        db.set_setting(sid, k, v)
        changed.append(k)
        if k == "shuffle" and v:
            db.set_setting(sid, "sequential", False)
        if k == "sequential" and v:
            db.set_setting(sid, "shuffle", False)
    _push_settings(sid)
    db.log_event("info", "system", "Playback rules updated: " + ", ".join(changed), sid)
    return {"ok": True, "settings": db.get_settings(sid)}


# ---------------------------------------------------------------------------
# Services / streams
@app.post("/api/stations/{sid}/stream/{act}")
def stream_action(sid: str, act: str, user: str = Depends(current_user)):
    _sid(sid)
    if act not in services.ALLOWED_ACTIONS:
        raise HTTPException(400, "bad action")
    if act == "start" and db.q1("SELECT 1 FROM tracks WHERE station=? AND corrupt=0 LIMIT 1", (sid,)) is None:
        raise HTTPException(409, "station library is empty — add media before streaming")
    r = services.action("stream", act, sid)
    db.log_event("info" if r["ok"] else "error", "stream", f"Operator {act} video stream" + ("" if r["ok"] else f" FAILED: {r['stderr']}"), sid)
    return r


@app.post("/api/stations/{sid}/liquidsoap/{act}")
def liq_action(sid: str, act: str, user: str = Depends(current_user)):
    _sid(sid)
    r = services.action("liquidsoap", act, sid)
    db.log_event("info" if r["ok"] else "error", "stream", f"Operator {act} audio engine" + ("" if r["ok"] else f" FAILED: {r['stderr']}"), sid)
    return r


@app.post("/api/stations/{sid}/restart-all")
def restart_all(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    a = services.action("liquidsoap", "restart", sid)
    b = services.action("stream", "restart", sid)
    db.log_event("info", "stream", "Operator restarted audio engine and video stream", sid)
    return {"liquidsoap": a, "stream": b}


@app.get("/api/stations/{sid}/preview.jpg")
def preview(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    p = config.RUN_DIR / f"preview-{sid}.jpg"
    if not p.exists():
        raise HTTPException(404, "no preview yet")
    return FileResponse(p, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.get("/api/stations/{sid}/overlay.png")
def overlay_png(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    p = overlay.overlay_path(sid)
    if not p.exists():
        raise HTTPException(404)
    return FileResponse(p, media_type="image/png", headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------------------
# Queue
class QueueAdd(BaseModel):
    track_id: int
    play_next: bool = False


@app.get("/api/stations/{sid}/queue")
def get_queue(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    return selector.upcoming(sid, 50)


@app.post("/api/stations/{sid}/queue")
def add_queue(sid: str, body: QueueAdd, user: str = Depends(current_user)):
    _sid(sid)
    t = db.q1("SELECT * FROM tracks WHERE id=? AND station=? AND corrupt=0", (body.track_id, sid))
    if not t:
        raise HTTPException(404, "track not found in this station")
    if body.play_next:
        m = db.q1("SELECT MIN(position) p FROM queue WHERE station=?", (sid,))
        pos = (m["p"] - 1) if m and m["p"] is not None else 0
    else:
        m = db.q1("SELECT MAX(position) p FROM queue WHERE station=?", (sid,))
        pos = (m["p"] + 1) if m and m["p"] is not None else 0
    with db.tx() as c:
        c.execute("INSERT INTO queue(station,track_id,position,requested_by,added_at) VALUES(?,?,?,?,?)",
                  (sid, body.track_id, pos, user, time.time()))
    if body.play_next:
        try:
            # Drop the prefetched requests so this one is genuinely next; anything that was an
            # operator request goes straight back to the head of the queue behind it.
            dropped = liq.requeue(sid)
            served = selector.SERVED.get(sid, [])
            with db.tx() as c:
                for i, d in enumerate(d for d in dropped if d in served and d != body.track_id):
                    c.execute("INSERT INTO queue(station,track_id,position,requested_by,added_at) VALUES(?,?,?,?,?)",
                              (sid, d, pos + 0.5 + i * 0.01, "requeued", time.time()))
                    served.remove(d)
            liq.wait_ready(sid)   # the replacement request must be resolved before any skip
        except liq.LiqError as e:
            db.log_event("warning", "queue", f"Play-next queued but Liquidsoap unreachable: {e}", sid)
    db.log_event("info", "queue", ("Play next: " if body.play_next else "Queued: ") + t["title"], sid)
    return {"ok": True, "queue": selector.upcoming(sid, 50)}


@app.delete("/api/stations/{sid}/queue/{qid}")
def del_queue(sid: str, qid: int, user: str = Depends(current_user)):
    _sid(sid)
    with db.tx() as c:
        c.execute("DELETE FROM queue WHERE id=? AND station=?", (qid, sid))
    return {"ok": True, "queue": selector.upcoming(sid, 50)}


@app.post("/api/stations/{sid}/queue/clear")
def clear_queue(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    with db.tx() as c:
        n = c.execute("DELETE FROM queue WHERE station=?", (sid,)).rowcount
    db.log_event("info", "queue", f"Queue cleared ({n} items)", sid)
    return {"ok": True, "removed": n}


class QueueMove(BaseModel):
    order: list[int]


@app.post("/api/stations/{sid}/queue/reorder")
def reorder_queue(sid: str, body: QueueMove, user: str = Depends(current_user)):
    _sid(sid)
    with db.tx() as c:
        for i, qid in enumerate(body.order):
            c.execute("UPDATE queue SET position=? WHERE id=? AND station=?", (i, qid, sid))
    return {"ok": True, "queue": selector.upcoming(sid, 50)}


# ---------------------------------------------------------------------------
# Library
@app.get("/api/library")
def library(station: str | None = None, q: str = "", page: int = 1, per_page: int = 60, sort: str = "title",
            user: str = Depends(current_user)):
    where, params = ["1=1"], []
    if station:
        where.append("station=?"); params.append(_sid(station))
    if q:
        where.append("(title LIKE ? OR artist LIKE ? OR album LIKE ? OR filename LIKE ?)")
        params += [f"%{q}%"] * 4
    order = {"title": "title COLLATE NOCASE", "artist": "artist COLLATE NOCASE", "duration": "duration DESC",
             "plays": "play_count DESC", "recent": "last_played DESC"}.get(sort, "title COLLATE NOCASE")
    total = db.q1(f"SELECT COUNT(*) n FROM tracks WHERE {' AND '.join(where)}", tuple(params))["n"]
    rows = db.rows(db.q(f"SELECT id,station,filename,title,artist,album,genre,duration,codec,format,bitrate,sample_rate,"
                        f"channels,size,artwork_source,embedded_artwork,external_artwork,loudness_i,replaygain_db,enabled,corrupt,"
                        f"play_count,last_played FROM tracks WHERE {' AND '.join(where)} ORDER BY {order} LIMIT ? OFFSET ?",
                        tuple(params) + (per_page, (page - 1) * per_page)))
    return {"total": total, "page": page, "per_page": per_page, "tracks": rows}


class TrackPatch(BaseModel):
    enabled: bool | None = None
    title: str | None = None
    artist: str | None = None
    album: str | None = None
    genre: str | None = None


@app.patch("/api/library/{tid}")
def patch_track(tid: int, body: TrackPatch, user: str = Depends(current_user)):
    t = db.q1("SELECT * FROM tracks WHERE id=?", (tid,))
    if not t:
        raise HTTPException(404)
    sets, params = [], []
    for k in ("enabled", "title", "artist", "album", "genre"):
        v = getattr(body, k)
        if v is not None:
            sets.append(f"{k}=?"); params.append(int(v) if k == "enabled" else v.strip()[:200])
    if sets:
        with db.tx() as c:
            c.execute(f"UPDATE tracks SET {', '.join(sets)}, updated_at=? WHERE id=?", tuple(params) + (time.time(), tid))
        db.log_event("info", "media", f"Track updated: {t['title']} ({', '.join(sets)})", t["station"])
        _safe_playlists(t["station"])
    return dict(db.q1("SELECT * FROM tracks WHERE id=?", (tid,)))


def _safe_image(p: Path | None):
    """Serve an image from the media drive; on any I/O problem fall back to the bundled mark."""
    for cand in (p, config.DEFAULT_ARTWORK):
        try:
            if cand and cand.is_file():
                return FileResponse(cand, headers={"Cache-Control": "max-age=3600"})
        except OSError:
            continue
    return FileResponse(config.STATIC_DIR / "assets" / "img" / "logo-placeholder.svg", media_type="image/svg+xml")


@app.get("/api/library/{tid}/artwork")
def track_artwork(tid: int, user: str = Depends(current_user)):
    t = db.q1("SELECT resolved_artwork FROM tracks WHERE id=?", (tid,))
    return _safe_image(Path(t["resolved_artwork"]) if t and t["resolved_artwork"] else None)


@app.get("/api/artwork/default")
def default_artwork(user: str = Depends(current_user)):
    return _safe_image(None)


_scan_lock = threading.Lock()
SCAN_STATE = {"running": False, "result": None, "started": None}


@app.post("/api/library/rescan")
def rescan(user: str = Depends(current_user)):
    if not _scan_lock.acquire(blocking=False):
        return {"ok": False, "running": True}

    def run():
        try:
            SCAN_STATE.update(running=True, started=time.time())
            res = {}
            for sid in config.STATION_IDS:
                res[sid] = catalog.scan_station(sid, loudness=True)
                catalog.ensure_default_playlists(sid)
                catalog.write_liquidsoap_playlists(sid)
            SCAN_STATE["result"] = res
            db.log_event("info", "media", "Library rescan complete: " + ", ".join(f"{k}: {v['scanned']} files" for k, v in res.items()))
        except Exception as e:
            db.log_event("error", "media", f"Library rescan failed: {e}")
        finally:
            SCAN_STATE["running"] = False
            _scan_lock.release()
    threading.Thread(target=run, daemon=True).start()
    db.log_event("info", "media", "Library rescan started")
    return {"ok": True, "running": True}


@app.get("/api/library/rescan")
def rescan_status(user: str = Depends(current_user)):
    return SCAN_STATE


@app.get("/api/media/summary")
def media_summary(user: str = Depends(current_user)):
    out = {}
    for sid in config.STATION_IDS:
        r = db.q1("SELECT COUNT(*) n, COALESCE(SUM(size),0) b, COALESCE(SUM(duration),0) d, "
                  "SUM(artwork_source='external') ext, SUM(artwork_source='embedded') emb, SUM(artwork_source='default') def_, "
                  "SUM(corrupt) corrupt, SUM(enabled=0) disabled FROM tracks WHERE station=?", (sid,))
        fmts = db.rows(db.q("SELECT format, codec, sample_rate, COUNT(*) n FROM tracks WHERE station=? GROUP BY 1,2,3", (sid,)))
        out[sid] = {**dict(r), "formats": fmts}
    out["animation"] = catalog.probe_video(config.LOOP_SOURCE)
    out["animation_720"] = catalog.probe_video(config.LOOP_720)
    out["default_artwork"] = config.DEFAULT_ARTWORK.exists()
    return out


# ---------------------------------------------------------------------------
# Playlists
@app.get("/api/stations/{sid}/playlists")
def playlists(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    rows = db.rows(db.q("SELECT p.*, (SELECT COUNT(*) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id "
                        "WHERE pt.playlist_id=p.id AND t.corrupt=0) AS track_count, "
                        "(SELECT COALESCE(SUM(t.duration),0) FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id "
                        "WHERE pt.playlist_id=p.id) AS duration FROM playlists p WHERE p.station=? ORDER BY p.kind='music' DESC, p.id", (sid,)))
    return rows


class PlaylistBody(BaseModel):
    name: str
    description: str = ""
    mode: str = "shuffle"
    kind: str = "music"
    enabled: bool = True


def _slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "playlist"


@app.post("/api/stations/{sid}/playlists")
def create_playlist(sid: str, body: PlaylistBody, user: str = Depends(current_user)):
    _sid(sid)
    if body.kind not in ("music", "jingles", "station_ids", "fallback"):
        raise HTTPException(400, "bad kind")
    slug = _slug(body.name)
    if db.q1("SELECT 1 FROM playlists WHERE station=? AND slug=?", (sid, slug)):
        raise HTTPException(409, "a playlist with that name exists")
    with db.tx() as c:
        c.execute("INSERT INTO playlists(station,slug,name,description,kind,mode,enabled) VALUES(?,?,?,?,?,?,?)",
                  (sid, slug, body.name.strip()[:80], body.description[:300], body.kind, body.mode, int(body.enabled)))
    db.log_event("info", "media", f"Playlist created: {body.name}", sid)
    return playlists(sid, user)


@app.put("/api/stations/{sid}/playlists/{pid}")
def update_playlist(sid: str, pid: int, body: PlaylistBody, user: str = Depends(current_user)):
    _sid(sid)
    with db.tx() as c:
        c.execute("UPDATE playlists SET name=?, description=?, mode=?, enabled=? WHERE id=? AND station=?",
                  (body.name.strip()[:80], body.description[:300], body.mode, int(body.enabled), pid, sid))
    return playlists(sid, user)


@app.delete("/api/stations/{sid}/playlists/{pid}")
def delete_playlist(sid: str, pid: int, user: str = Depends(current_user)):
    _sid(sid)
    p = db.q1("SELECT * FROM playlists WHERE id=? AND station=?", (pid, sid))
    if not p:
        raise HTTPException(404)
    if p["slug"] in ("all", "fallback", "jingles", "station-ids"):
        raise HTTPException(400, "core playlists cannot be deleted")
    with db.tx() as c:
        c.execute("DELETE FROM playlists WHERE id=?", (pid,))
    db.log_event("info", "media", f"Playlist deleted: {p['name']}", sid)
    return playlists(sid, user)


@app.get("/api/stations/{sid}/playlists/{pid}/tracks")
def playlist_tracks(sid: str, pid: int, user: str = Depends(current_user)):
    _sid(sid)
    return db.rows(db.q("SELECT t.id,t.title,t.artist,t.album,t.duration,t.artwork_source,t.enabled,pt.position,pt.weight "
                        "FROM playlist_tracks pt JOIN tracks t ON t.id=pt.track_id WHERE pt.playlist_id=? "
                        "ORDER BY pt.position, t.title", (pid,)))


class PlaylistTracks(BaseModel):
    track_ids: list[int]


@app.post("/api/stations/{sid}/playlists/{pid}/tracks")
def playlist_add(sid: str, pid: int, body: PlaylistTracks, user: str = Depends(current_user)):
    _sid(sid)
    m = db.q1("SELECT COALESCE(MAX(position),-1) p FROM playlist_tracks WHERE playlist_id=?", (pid,))
    pos = m["p"] + 1
    with db.tx() as c:
        for tid in body.track_ids:
            if db.q1("SELECT 1 FROM tracks WHERE id=? AND station=?", (tid, sid)):
                c.execute("INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)", (pid, tid, pos))
                pos += 1
    _safe_playlists(sid)
    return playlist_tracks(sid, pid, user)


@app.delete("/api/stations/{sid}/playlists/{pid}/tracks/{tid}")
def playlist_remove(sid: str, pid: int, tid: int, user: str = Depends(current_user)):
    _sid(sid)
    with db.tx() as c:
        c.execute("DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id=?", (pid, tid))
    _safe_playlists(sid)
    return playlist_tracks(sid, pid, user)


# ---------------------------------------------------------------------------
# Schedules
class ScheduleBody(BaseModel):
    name: str
    description: str = ""
    playlist_slug: str
    start_time: str
    end_time: str
    days: str = "0,1,2,3,4,5,6"
    priority: int = 10
    enabled: bool = True
    date_from: str | None = None
    date_to: str | None = None


def _validate_schedule(sid: str, b: ScheduleBody) -> None:
    for t in (b.start_time, b.end_time):
        if not re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", t):
            raise HTTPException(400, f"bad time {t}")
    if not re.fullmatch(r"[0-6](,[0-6])*", b.days):
        raise HTTPException(400, "bad days")
    if not db.q1("SELECT 1 FROM playlists WHERE station=? AND slug=?", (sid, b.playlist_slug)):
        raise HTTPException(400, "unknown playlist")
    for d in (b.date_from, b.date_to):
        if d and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", d):
            raise HTTPException(400, "bad date")


@app.get("/api/stations/{sid}/schedules")
def schedules(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    return {"entries": scheduler.entries(sid), "today": scheduler.today(sid), "evaluation": scheduler.evaluate(sid)}


@app.post("/api/stations/{sid}/schedules")
def add_schedule(sid: str, body: ScheduleBody, user: str = Depends(current_user)):
    _sid(sid); _validate_schedule(sid, body)
    with db.tx() as c:
        c.execute("INSERT INTO schedules(station,name,description,playlist_slug,start_time,end_time,days,priority,enabled,date_from,date_to) "
                  "VALUES(?,?,?,?,?,?,?,?,?,?,?)", (sid, body.name[:80], body.description[:200], body.playlist_slug, body.start_time,
                                                    body.end_time, body.days, body.priority, int(body.enabled), body.date_from, body.date_to))
    db.log_event("info", "schedule", f"Schedule added: {body.name} {body.start_time}–{body.end_time}", sid)
    return schedules(sid, user)


@app.put("/api/stations/{sid}/schedules/{eid}")
def update_schedule(sid: str, eid: int, body: ScheduleBody, user: str = Depends(current_user)):
    _sid(sid); _validate_schedule(sid, body)
    with db.tx() as c:
        c.execute("UPDATE schedules SET name=?,description=?,playlist_slug=?,start_time=?,end_time=?,days=?,priority=?,enabled=?,date_from=?,date_to=? "
                  "WHERE id=? AND station=?", (body.name[:80], body.description[:200], body.playlist_slug, body.start_time, body.end_time,
                                               body.days, body.priority, int(body.enabled), body.date_from, body.date_to, eid, sid))
    db.log_event("info", "schedule", f"Schedule updated: {body.name}", sid)
    return schedules(sid, user)


@app.delete("/api/stations/{sid}/schedules/{eid}")
def delete_schedule(sid: str, eid: int, user: str = Depends(current_user)):
    _sid(sid)
    with db.tx() as c:
        c.execute("DELETE FROM schedules WHERE id=? AND station=?", (eid, sid))
    db.log_event("info", "schedule", "Schedule entry deleted", sid)
    return schedules(sid, user)


# ---------------------------------------------------------------------------
# Outputs (YouTube configuration state — never returns secrets)
@app.get("/api/stations/{sid}/outputs")
def outputs(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    st = config.station(sid)
    sec = Path(st["youtube_secret"])
    stream = _stream_status(sid)
    url = "rtmps://a.rtmps.youtube.com:443/live2"
    if sec.exists():
        for line in sec.read_text().splitlines():
            if line.startswith("YOUTUBE_RTMPS_URL="):
                url = line.split("=", 1)[1].strip()
    return {
        "youtube": {"configured": _youtube_configured(sid), "rtmps_url": url, "secret_file": str(sec),
                    "state": stream.get("state"), "target": stream.get("target"), "bitrate_kbps": stream.get("bitrate_kbps"),
                    "fps": stream.get("fps"), "uptime_sec": stream.get("uptime_sec"), "restarts": stream.get("restarts"),
                    "last_error": stream.get("last_error")},
        "local_test": {"path": str(config.RUN_DIR / f"local-{sid}.flv")},
        "harbor": {"url": f"http://127.0.0.1:{st['harbor_port']}/{sid}.aac", "note": "Liquidsoap AAC feed for FFmpeg (loopback only)"},
        "output_target": db.get_setting(sid, "output_target"),
        "encoder": {"video": "h264_v4l2m2m (Raspberry Pi hardware)", "resolution": f"{config.VIDEO_W}x{config.VIDEO_H}",
                    "fps": config.VIDEO_FPS, "video_kbps": st["video_bitrate_k"], "audio": f"AAC-LC {st['audio_bitrate_k']} kbps 48 kHz stereo"},
    }


# ---------------------------------------------------------------------------
# Events & logs
@app.get("/api/events")
def events(limit: int = 200, severity: str | None = None, station: str | None = None, category: str | None = None,
           user: str = Depends(current_user)):
    where, params = ["1=1"], []
    if severity:
        where.append("severity=?"); params.append(severity)
    if station:
        where.append("station=?"); params.append(station)
    if category:
        where.append("category=?"); params.append(category)
    return db.rows(db.q(f"SELECT * FROM events WHERE {' AND '.join(where)} ORDER BY id DESC LIMIT ?", tuple(params) + (min(limit, 1000),)))


@app.get("/api/logs/{source}")
def logs(source: str, station: str = "lofi", lines: int = 200, user: str = Depends(current_user)):
    _sid(station)
    lines = min(lines, 1000)
    if source == "liquidsoap":
        p = config.RUN_DIR / f"liq-{station}.log"
        out = p.read_text(errors="replace").splitlines()[-lines * 6:] if p.exists() else []
        out = [l for l in out if "[server:3]" not in l][-lines:]
        return {"lines": out or services.journal(services.unit("liquidsoap", station), lines)}
    if source == "stream":
        return {"lines": services.journal(services.unit("stream", station), lines)}
    if source == "ffmpeg":
        p = config.LOG_DIR / f"ffmpeg-{station}.log"
        return {"lines": p.read_text(errors="replace").splitlines()[-lines:] if p.exists() else []}
    if source == "control":
        return {"lines": services.journal(services.unit("control"), lines)}
    if source == "kernel":
        import subprocess
        r = subprocess.run(["dmesg", "--time-format", "iso"], capture_output=True, text=True)
        out = r.stdout.splitlines() if r.returncode == 0 else ["dmesg not readable by this user"]
        return {"lines": [l for l in out if re.search(r"usb|sd[a-z]|EXT4|error|fail|throttl|voltage", l, re.I)][-lines:]}
    raise HTTPException(404)


@app.get("/api/history")
def history(station: str = "lofi", limit: int = 50, user: str = Depends(current_user)):
    _sid(station)
    return db.rows(db.q("SELECT * FROM play_history WHERE station=? ORDER BY id DESC LIMIT ?", (station, min(limit, 500))))


# ---------------------------------------------------------------------------
# Alerts (operator-facing; clearing never touches the event log)
@app.get("/api/alerts")
def alerts(state: str = "active", limit: int = 200, user: str = Depends(current_user)):
    if state == "active":
        rows = db.q("SELECT * FROM alerts WHERE state IN ('open','acknowledged') ORDER BY updated_at DESC LIMIT ?", (limit,))
    elif state == "resolved":
        rows = db.q("SELECT * FROM alerts WHERE state='resolved' ORDER BY updated_at DESC LIMIT ?", (limit,))
    else:
        rows = db.q("SELECT * FROM alerts WHERE state!='cleared' ORDER BY updated_at DESC LIMIT ?", (limit,))
    counts = db.q1("SELECT SUM(state IN ('open','acknowledged') AND severity='critical') crit, "
                   "SUM(state IN ('open','acknowledged') AND severity='error') err, "
                   "SUM(state IN ('open','acknowledged') AND severity='warning') warn, "
                   "SUM(state IN ('open','acknowledged') AND read=0) unread, SUM(state='resolved') resolved FROM alerts")
    return {"alerts": db.rows(rows), "counts": {k: (counts[k] or 0) for k in counts.keys()}}


# NOTE: this route MUST be registered before /api/alerts/{aid}/{act} — FastAPI/Starlette
# matches routes in registration order, and {aid} is an untyped path segment that would
# otherwise swallow "bulk" and fail int-parsing it (the bug behind the old "bulk" 422s).
@app.post("/api/alerts/bulk/{act}")
def alerts_bulk(act: str, user: str = Depends(current_user)):
    if act not in ("read-all", "clear-resolved", "clear-all"):
        raise HTTPException(400, "unknown bulk action")
    with db.tx() as c:
        if act == "read-all":
            n = c.execute("UPDATE alerts SET read=1 WHERE state IN ('open','acknowledged')").rowcount
        elif act == "clear-resolved":
            n = c.execute("UPDATE alerts SET state='cleared' WHERE state='resolved'").rowcount
        else:
            n = c.execute("UPDATE alerts SET state='cleared' WHERE state!='cleared'").rowcount
    return {"ok": True, "count": n}


@app.post("/api/alerts/{aid}/{act}")
def alert_action(aid: int, act: str, user: str = Depends(current_user)):
    if act not in ("ack", "read", "clear", "resolve"):
        raise HTTPException(400)
    with db.tx() as c:
        if act == "ack":
            c.execute("UPDATE alerts SET state='acknowledged', read=1, updated_at=? WHERE id=? AND state='open'", (time.time(), aid))
        elif act == "read":
            c.execute("UPDATE alerts SET read=1 WHERE id=?", (aid,))
        elif act == "resolve":
            c.execute("UPDATE alerts SET state='resolved', resolved_at=?, updated_at=?, read=1 WHERE id=?", (time.time(), time.time(), aid))
        else:
            c.execute("UPDATE alerts SET state='cleared', updated_at=? WHERE id=?", (time.time(), aid))
    return {"ok": True}


# ---------------------------------------------------------------------------
# Library uploads (single or bulk: one request per file, the browser reports progress)
def _safe_name(name: str) -> str:
    name = Path(name).name.replace("\\", "_")
    name = re.sub(r"[^\w .,'()&+\-]", "_", name).strip(" .")
    return name[:180] or "track"


@app.post("/api/library/upload")
async def upload_track(request: Request, station: str = Form(...), file: UploadFile = File(...),
                       title: str = Form(""), artist: str = Form(""), album: str = Form(""), genre: str = Form(""),
                       user: str = Depends(current_user)):
    _sid(station)
    ext = Path(file.filename or "").suffix.lower()
    if ext not in config.AUDIO_EXTS:
        return {"ok": False, "status": "unsupported", "filename": file.filename, "reason": f"{ext or 'no extension'} is not an accepted audio format"}
    music_dir = Path(config.station(station)["music_dir"])
    music_dir.mkdir(parents=True, exist_ok=True)
    name = _safe_name(file.filename)
    tmp = music_dir / f".upload-{secrets_token()}{ext}"
    h = hashlib.sha256(); size = 0
    try:
        with open(tmp, "wb") as out:
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                h.update(chunk); size += len(chunk); out.write(chunk)
    except OSError as e:
        tmp.unlink(missing_ok=True)
        raise HTTPException(507, f"could not write to media drive: {e}")
    digest = h.hexdigest()
    # duplicate detection: same content hash already catalogued, or same filename
    dup = db.q1("SELECT id,title,filename FROM tracks WHERE station=? AND (sha256=? OR filename=?)", (station, digest, name))
    if dup:
        tmp.unlink(missing_ok=True)
        return {"ok": False, "status": "duplicate", "filename": name, "existing": dict(dup)}
    dest = music_dir / name
    tmp.replace(dest)
    rec = catalog.scan_one(station, dest, loudness=False)
    if not rec or rec.get("corrupt"):
        dest.unlink(missing_ok=True)
        with db.tx() as c:
            c.execute("DELETE FROM tracks WHERE path=?", (str(dest),))
        return {"ok": False, "status": "unreadable", "filename": name, "reason": "FFmpeg could not decode this file"}
    sets = {"sha256": digest}
    for k, v in (("title", title), ("artist", artist), ("album", album), ("genre", genre)):
        if v.strip():
            sets[k] = v.strip()[:200]
    with db.tx() as c:
        c.execute("UPDATE tracks SET " + ",".join(f"{k}=?" for k in sets) + " WHERE id=?", (*sets.values(), rec["id"]))
    catalog.ensure_default_playlists(station)
    _safe_playlists(station)
    threading.Thread(target=_loudness_bg, args=(rec["id"], dest), daemon=True).start()
    db.log_event("info", "media", f"Uploaded: {name} ({size // 1024} KB)", station)
    return {"ok": True, "status": "accepted", "track": dict(db.q1("SELECT * FROM tracks WHERE id=?", (rec["id"],)))}


def secrets_token() -> str:
    import secrets as _s
    return _s.token_hex(6)


def _loudness_bg(tid: int, path: Path) -> None:
    li = catalog.measure_loudness(path)
    if li is not None:
        with db.tx() as c:
            c.execute("UPDATE tracks SET loudness_i=?, replaygain_db=? WHERE id=?", (li, round(-18.0 - li, 2), tid))


@app.delete("/api/library/{tid}")
def delete_track(tid: int, user: str = Depends(current_user)):
    t = db.q1("SELECT * FROM tracks WHERE id=?", (tid,))
    if not t:
        raise HTTPException(404)
    p = Path(t["path"])
    trash = p.parent / ".trash"
    try:
        trash.mkdir(exist_ok=True)
        if p.exists():
            p.replace(trash / p.name)   # never hard-delete: moved to .trash on the drive
    except OSError as e:
        raise HTTPException(500, f"could not move file: {e}")
    with db.tx() as c:
        c.execute("DELETE FROM tracks WHERE id=?", (tid,))
    _safe_playlists(t["station"])
    db.log_event("warning", "media", f"Track removed from library (moved to .trash): {t['filename']}", t["station"])
    return {"ok": True}


# ---------------------------------------------------------------------------
# Artwork management
@app.post("/api/library/{tid}/artwork")
async def upload_artwork(tid: int, file: UploadFile = File(...), user: str = Depends(current_user)):
    if Path(file.filename or "").suffix.lower() not in config.IMAGE_EXTS:
        raise HTTPException(400, "image must be JPG, PNG or WEBP")
    data = await file.read()
    if len(data) > 25 * 1024 * 1024:
        raise HTTPException(413, "image too large")
    try:
        r = catalog.resolve_artwork_for(tid, "upload", data)
    except KeyError:
        raise HTTPException(404)
    t = db.q1("SELECT title,station FROM tracks WHERE id=?", (tid,))
    db.log_event("info", "media", f"Cover uploaded for {t['title']}", t["station"])
    _refresh_overlay_if_playing(tid)
    return r


@app.post("/api/library/{tid}/artwork/{mode}")
def artwork_mode(tid: int, mode: str, user: str = Depends(current_user)):
    if mode not in ("default", "auto"):
        raise HTTPException(400)
    try:
        r = catalog.resolve_artwork_for(tid, mode)
    except KeyError:
        raise HTTPException(404)
    _refresh_overlay_if_playing(tid)
    return r


def _refresh_overlay_if_playing(tid: int) -> None:
    for sid, now in NOW.items():
        if now.get("track_id") == tid:
            t = db.q1("SELECT * FROM tracks WHERE id=?", (tid,))
            NOW[sid]["artwork"] = t["resolved_artwork"]
            try:
                overlay.render(sid, now["title"], now["artist"], now.get("album") or "", t["resolved_artwork"])
            except Exception:
                pass


@app.post("/api/artwork/bulk")
async def bulk_artwork(request: Request, station: str = Form(...), file: UploadFile = File(...), user: str = Depends(current_user)):
    """Bulk cover upload: the image is stored in the artwork folder under its own name and
    matched to tracks by the same tolerant rules as the scanner."""
    _sid(station)
    if Path(file.filename or "").suffix.lower() not in config.IMAGE_EXTS:
        return {"ok": False, "status": "unsupported", "filename": file.filename}
    name = _safe_name(file.filename)
    dest = config.ARTWORK_DIR / name
    data = await file.read()
    dest.write_bytes(data)
    idx = catalog.index_external_artwork()
    key = catalog.norm_key(name)
    matched = []
    for t in db.q("SELECT id, filename FROM tracks WHERE station=?", (station,)):
        if catalog.norm_key(t["filename"]) == key or (catalog.fuzzy_match(t["filename"], {key: dest}, set()) is not None):
            catalog.resolve_artwork_for(t["id"], "auto")
            matched.append(t["id"])
    return {"ok": True, "status": "matched" if matched else "unmatched", "filename": name, "matched_tracks": matched}


@app.get("/api/library/{tid}/preview.mp3")
def track_preview(tid: int, user: str = Depends(current_user)):
    """30-second MP3 preview transcoded on the fly (operator pre-listen; not the broadcast)."""
    t = db.q1("SELECT path FROM tracks WHERE id=?", (tid,))
    if not t:
        raise HTTPException(404)
    proc = subprocess.Popen(["ffmpeg", "-v", "error", "-nostdin", "-i", t["path"], "-t", "45", "-vn", "-ac", "2", "-ar", "44100",
                             "-b:a", "96k", "-f", "mp3", "-"], stdout=subprocess.PIPE)
    def gen():
        try:
            while True:
                chunk = proc.stdout.read(16384)
                if not chunk:
                    break
                yield chunk
        finally:
            proc.kill()
    return StreamingResponse(gen(), media_type="audio/mpeg", headers={"Cache-Control": "no-store"})


# ---------------------------------------------------------------------------
# Listen Live: proxy the station's MP3 mount from the loopback harbor (auth required)
@app.get("/api/stations/{sid}/listen.mp3")
def listen_live(sid: str, request: Request, user: str = Depends(current_user)):
    _sid(sid)
    url = f"http://127.0.0.1:{config.station(sid)['harbor_port']}/{sid}-listen.mp3"
    try:
        upstream = urllib.request.urlopen(url, timeout=6)
    except Exception as e:
        raise HTTPException(503, f"station audio not available: {e}")
    def gen():
        try:
            while True:
                chunk = upstream.read(8192)
                if not chunk:
                    break
                yield chunk
        finally:
            upstream.close()
    return StreamingResponse(gen(), media_type="audio/mpeg",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no", "icy-name": config.station(sid)["name"]})


# ---------------------------------------------------------------------------
# Schedule: day views and manual override
@app.get("/api/stations/{sid}/schedules/day/{offset}")
def schedule_day(sid: str, offset: int, user: str = Depends(current_user)):
    _sid(sid)
    return {"offset": max(0, min(offset, 7)), "blocks": scheduler.day_view(sid, max(0, min(offset, 7)))}


class OverrideBody(BaseModel):
    playlist_slug: str
    minutes: int = 60
    name: str | None = None


@app.post("/api/stations/{sid}/schedule-override")
def set_override(sid: str, body: OverrideBody, user: str = Depends(current_user)):
    _sid(sid)
    if not db.q1("SELECT 1 FROM playlists WHERE station=? AND slug=?", (sid, body.playlist_slug)):
        raise HTTPException(400, "unknown playlist")
    m = max(5, min(body.minutes, 24 * 60))
    ov = {"playlist_slug": body.playlist_slug, "until": time.time() + m * 60, "since": time.time(), "name": body.name}
    db.set_setting(sid, "schedule_override", ov)
    db.log_event("warning", "schedule", f"Manual override: {body.playlist_slug} for {m} min", sid)
    return {"ok": True, "override": ov}


@app.delete("/api/stations/{sid}/schedule-override")
def clear_override(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    db.set_setting(sid, "schedule_override", None)
    db.log_event("info", "schedule", "Manual override cleared; schedule resumed", sid)
    return {"ok": True}


# ---------------------------------------------------------------------------
# YouTube setup (secrets stay on disk, masked to the browser)
def _yt_read(sid: str) -> dict:
    p = Path(config.station(sid)["youtube_secret"])
    d = {"YOUTUBE_RTMPS_URL": "rtmps://a.rtmps.youtube.com:443/live2", "YOUTUBE_STREAM_KEY": ""}
    if p.exists():
        for line in p.read_text().splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1); d[k.strip()] = v.strip()
    return d


def _yt_write(sid: str, url: str, key: str | None) -> None:
    p = Path(config.station(sid)["youtube_secret"])
    cur = _yt_read(sid)
    if key is not None:
        cur["YOUTUBE_STREAM_KEY"] = key
    cur["YOUTUBE_RTMPS_URL"] = url
    fd = os.open(str(p), os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    with os.fdopen(fd, "w") as f:
        f.write("# HUNGREE Goat — YouTube Live output secrets (managed by HUNGREE Goat Control)\n")
        f.write(f"YOUTUBE_RTMPS_URL={cur['YOUTUBE_RTMPS_URL']}\nYOUTUBE_STREAM_KEY={cur['YOUTUBE_STREAM_KEY']}\n")
        f.write(f"SAVED_AT={int(time.time())}\n")


@app.get("/api/stations/{sid}/youtube")
def youtube_get(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    d = _yt_read(sid)
    key = d.get("YOUTUBE_STREAM_KEY", "")
    stream = _stream_status(sid)
    st = db.get_settings(sid)
    return {
        "rtmps_url": d["YOUTUBE_RTMPS_URL"], "configured": len(key) > 4,
        "key_masked": ("•" * max(0, len(key) - 4) + key[-4:]) if len(key) > 4 else "",
        "saved_at": int(d.get("SAVED_AT") or 0) or None,
        "output_enabled": st.get("output_target") == "youtube",
        "state": stream.get("state"), "target": stream.get("target"), "bitrate_kbps": stream.get("bitrate_kbps"),
        "uptime_sec": stream.get("uptime_sec"), "last_error": stream.get("last_error"),
        "last_connected": db.get_setting(sid, "youtube_last_connected"),
        "meta": st.get("youtube_meta") or {},
        "encoder": {"resolution": f"{config.VIDEO_W}x{config.VIDEO_H}", "fps": config.VIDEO_FPS,
                    "video_kbps": config.station(sid)["video_bitrate_k"], "audio_kbps": config.station(sid)["audio_bitrate_k"]},
    }


class YouTubeBody(BaseModel):
    rtmps_url: str = "rtmps://a.rtmps.youtube.com:443/live2"
    stream_key: str | None = None   # None = keep existing
    clear_key: bool = False
    output_enabled: bool | None = None
    meta: dict | None = None


@app.post("/api/stations/{sid}/youtube")
def youtube_save(sid: str, body: YouTubeBody, user: str = Depends(current_user)):
    _sid(sid)
    url = body.rtmps_url.strip()
    if not re.fullmatch(r"rtmps?://[\w.\-]+(:\d+)?/[\w/\-]*", url):
        raise HTTPException(400, "RTMPS URL looks wrong")
    key = body.stream_key.strip() if body.stream_key is not None else None
    if key is not None and key != "" and not re.fullmatch(r"[\w\-]{8,80}", key):
        raise HTTPException(400, "stream key format not recognised")
    if body.clear_key:
        _yt_write(sid, url, "")
        db.log_event("warning", "stream", "YouTube stream key removed", sid)
        services.action("stream", "restart", sid)
    else:
        _yt_write(sid, url, key if key else None)
    if body.output_enabled is not None:
        db.set_setting(sid, "output_target", "youtube" if body.output_enabled else "none")
    if body.meta is not None:
        cur_meta = db.get_setting(sid, "youtube_meta") or {}
        allowed = dict(cur_meta)   # partial saves never blank fields that were not submitted
        allowed.update({k: str(v)[:2000] for k, v in body.meta.items() if k in ("title", "description", "category", "latency", "visibility", "channel", "public_url", "public_description")})
        if allowed.get("public_url") and not re.fullmatch(r"https://(www\.)?(youtube\.com|youtu\.be)/\S+", allowed["public_url"]):
            raise HTTPException(400, "public URL must be a youtube.com / youtu.be link")
        db.set_setting(sid, "youtube_meta", allowed)
    db.log_event("info", "stream", "YouTube settings saved" + (" (new stream key)" if key else ""), sid)
    if key:
        services.action("stream", "restart", sid)
    return youtube_get(sid, user)


@app.post("/api/stations/{sid}/youtube/test")
def youtube_test(sid: str, user: str = Depends(current_user)):
    """Network test of the RTMPS ingest endpoint (DNS + TCP + TLS). The key itself can only be
    validated by publishing, which is what Start Output does."""
    import socket, ssl
    from urllib.parse import urlparse
    _sid(sid)
    u = urlparse(_yt_read(sid)["YOUTUBE_RTMPS_URL"])
    host, port = u.hostname, u.port or (443 if u.scheme == "rtmps" else 1935)
    t0 = time.time()
    try:
        ip = socket.gethostbyname(host)
        with socket.create_connection((host, port), timeout=6) as sock:
            if u.scheme == "rtmps":
                ctx = ssl.create_default_context()
                with ctx.wrap_socket(sock, server_hostname=host) as tls:
                    cert = tls.getpeercert(); proto = tls.version()
            else:
                cert, proto = None, "plain"
        ms = int((time.time() - t0) * 1000)
        return {"ok": True, "host": host, "ip": ip, "port": port, "tls": proto, "ms": ms,
                "cert_subject": dict(x[0] for x in cert["subject"]) if cert else None,
                "note": "Endpoint reachable. The stream key is only verified when the output publishes."}
    except Exception as e:
        return {"ok": False, "host": host, "port": port, "error": str(e)}


@app.get("/api/version")
def version():
    return {"assets": _asset_version()}


def _asset_version() -> str:
    try:
        parts = [str(int((config.STATIC_DIR / f).stat().st_mtime)) for f in ("app.js", "app.css", "pages.js")]
    except OSError:
        parts = [str(int(time.time()))]
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:10]


# ---------------------------------------------------------------------------
# Go Live From This Device: authenticated WebSocket carrying raw PCM from the browser's
# microphone → FFmpeg (MP3) → Liquidsoap's live harbor mount. Only the control backend
# talks to the harbor; the browser never sees ports, passwords or the control socket.
DJ_SESSIONS: dict[str, dict] = {}


@app.websocket("/api/stations/{sid}/dj/ws")
async def dj_ws(websocket: WebSocket, sid: str):
    user = auth.check(websocket.cookies.get(auth.COOKIE))
    if not user or sid not in config.STATIONS:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    st = config.station(sid)
    rate = int(websocket.query_params.get("rate", "48000")); ch = int(websocket.query_params.get("channels", "1"))
    rate = rate if rate in (44100, 48000) else 48000; ch = 1 if ch != 2 else 2
    pw = (config.SECRETS_DIR / f"live-{sid}.password").read_text().strip()
    cmd = ["ffmpeg", "-v", "error", "-nostdin", "-f", "s16le", "-ar", str(rate), "-ac", str(ch), "-i", "pipe:0",
           "-ac", "2", "-ar", "48000", "-c:a", "libmp3lame", "-b:a", "192k", "-content_type", "audio/mpeg", "-ice_name", "HUNGREE Goat DJ",
           "-f", "mp3", f"icecast://source:{pw}@127.0.0.1:{st['live_port']}/live"]
    proc = await __import__("asyncio").create_subprocess_exec(*cmd, stdin=__import__("asyncio").subprocess.PIPE, stderr=__import__("asyncio").subprocess.PIPE)
    DJ_SESSIONS[sid] = {"user": user, "since": time.time(), "bytes": 0}
    db.log_event("info", "stream", f"DJ session opened from the browser by {user}", sid)
    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if data:
                DJ_SESSIONS[sid]["bytes"] += len(data)
                try:
                    proc.stdin.write(data); await proc.stdin.drain()
                except (BrokenPipeError, ConnectionResetError):
                    err = (await proc.stderr.read()).decode(errors="replace")[-300:]
                    db.log_event("error", "stream", f"DJ audio pipe closed: {err.strip() or 'ffmpeg exited'}", sid)
                    await websocket.send_text(json.dumps({"error": "encoder stopped"}))
                    break
            elif msg.get("text"):
                t = msg["text"]
                if t == "ping":
                    await websocket.send_text(json.dumps({"ok": True, "bytes": DJ_SESSIONS[sid]["bytes"], "live": liq.state(sid).get("live")}))
    except WebSocketDisconnect:
        pass
    finally:
        DJ_SESSIONS.pop(sid, None)
        try:
            proc.stdin.close()
        except Exception:
            pass
        try:
            await __import__("asyncio").wait_for(proc.wait(), 3)
        except Exception:
            proc.kill()
        db.log_event("info", "stream", "DJ session closed", sid)


class DjBody(BaseModel):
    live: bool


@app.post("/api/stations/{sid}/dj/take")
def dj_take(sid: str, body: DjBody, user: str = Depends(current_user)):
    """Take Live = let the live input take priority; Return = hand back to scheduled music."""
    _sid(sid)
    db.set_setting(sid, "live_mic_enabled", body.live)
    try:
        liq.set_var(sid, "live_enabled", body.live)
    except liq.LiqError as e:
        raise HTTPException(503, f"audio engine unavailable: {e}")
    db.log_event("warning" if body.live else "info", "fallback", ("Operator took the station LIVE from the browser" if body.live else "Returned to scheduled music"), sid)
    return {"ok": True, "live": body.live, "session": DJ_SESSIONS.get(sid)}


@app.get("/api/stations/{sid}/dj/status")
def dj_status(sid: str, user: str = Depends(current_user)):
    _sid(sid)
    st = liq.state(sid)
    return {"session": DJ_SESSIONS.get(sid), "harbor_connected": st.get("live") is True, "on_air": st.get("on_air_source") == "live",
            "enabled": bool(db.get_setting(sid, "live_mic_enabled")), "secure_context_required": True}


# ---------------------------------------------------------------------------
# Player skins (private management)
from . import skins as skins_mod  # noqa: E402


@app.get("/api/skins")
def skins_list(user: str = Depends(current_user)):
    d = skins_mod.load()
    all_skins = skins_mod.public_list(include_disabled=True)
    return {"skins": all_skins, "default": d.get("default"),
            "built_in_count": len(skins_mod.BUILT_IN), "custom_count": sum(1 for s in all_skins if s["source"] == "custom"),
            "ambience_options": [{"key": k, "label": v} for k, v in skins_mod.AMBIENCE_LABELS.items()]}


class SkinBody(BaseModel):
    name: str
    description: str = ""
    enabled: bool = True
    accent: str | None = None
    ambience: dict | None = None
    order: int | None = None
    time_mode: str = "always"
    time_variants: dict | None = None


@app.post("/api/skins")
def skins_create(body: SkinBody, user: str = Depends(current_user)):
    s = skins_mod.upsert(body.model_dump())
    db.log_event("info", "system", f"Player skin created: {body.name}")
    return s


@app.put("/api/skins/{skin_id}")
def skins_update(skin_id: str, body: SkinBody, user: str = Depends(current_user)):
    try:
        return skins_mod.upsert(body.model_dump(), skin_id)
    except KeyError:
        raise HTTPException(404)


@app.delete("/api/skins/{skin_id}")
def skins_delete(skin_id: str, user: str = Depends(current_user)):
    try:
        skins_mod.delete(skin_id)
    except KeyError:
        raise HTTPException(404)
    db.log_event("info", "system", f"Player skin deleted: {skin_id}")
    return {"ok": True}


@app.post("/api/skins/{skin_id}/default")
def skins_default(skin_id: str, user: str = Depends(current_user)):
    skins_mod.set_default(None if skin_id == "none" else skin_id)
    return {"ok": True}


class SkinOrder(BaseModel):
    order: list[str]


@app.post("/api/skins/reorder")
def skins_reorder(body: SkinOrder, user: str = Depends(current_user)):
    skins_mod.reorder(body.order)
    return {"ok": True}


@app.post("/api/skins/{skin_id}/asset/{kind}")
async def skins_asset(skin_id: str, kind: str, time_key: str | None = None, file: UploadFile = File(...), user: str = Depends(current_user)):
    if kind not in ("video", "image", "thumbnail"):
        raise HTTPException(400)
    if time_key is not None and time_key not in skins_mod.TIMES:
        raise HTTPException(400, "bad time_key")
    data = await file.read()
    if len(data) > 120 * 1024 * 1024:
        raise HTTPException(413, "asset too large (120 MB max)")
    try:
        name = skins_mod.store_asset(skin_id, kind, file.filename or "asset", data, time_key)
        probe = skins_mod.probe_asset(name) if kind != "thumbnail" else None
    except ValueError as e:
        raise HTTPException(400, str(e))
    except KeyError:
        raise HTTPException(404)
    db.log_event("info", "system", f"Player skin asset uploaded: {skin_id} ({kind}{' '+time_key if time_key else ''})")
    return {"ok": True, "file": name, "probe": probe}


@app.post("/api/skins/{skin_id}/thumbnail/generate")
def skins_thumb_generate(skin_id: str, source: str, user: str = Depends(current_user)):
    """'Generate from visual': still frame from the video, or a resized copy of the image."""
    try:
        name = skins_mod.generate_thumbnail(skin_id, source)
    except KeyError:
        raise HTTPException(404, "source asset not found")
    except RuntimeError as e:
        raise HTTPException(400, str(e))
    return {"ok": True, "file": name}


@app.post("/api/library/prepare-mp3")
def prepare_mp3(user: str = Depends(current_user)):
    """Pre-transcode the whole catalog for Explore mode (runs in the background)."""
    from . import public_api
    def run():
        n = 0
        for r in db.q("SELECT id FROM tracks WHERE corrupt=0 AND enabled=1"):
            if public_api.ensure_mp3(r["id"]):
                n += 1
        db.log_event("info", "media", f"Explore-mode MP3 cache ready: {n} tracks")
    threading.Thread(target=run, daemon=True).start()
    return {"ok": True}


# ---------------------------------------------------------------------------
# Public read-only API (api.hungreegoat.com) — registered before the SPA catch-all
from . import public_api  # noqa: E402
app.include_router(public_api.router)


# ---------------------------------------------------------------------------
# Static frontend
app.mount("/assets", StaticFiles(directory=str(config.STATIC_DIR / "assets")), name="assets")


def _index() -> HTMLResponse:
    html = (config.STATIC_DIR / "index.html").read_text().replace("__V__", _asset_version())
    return HTMLResponse(html, headers={"Cache-Control": "no-cache, must-revalidate"})


@app.get("/")
def index():
    return _index()


@app.get("/{path:path}")
def spa(path: str):
    p = config.STATIC_DIR / path
    if p.is_file() and not path.startswith("api/"):
        # app code must never be served stale after an update
        hdr = {"Cache-Control": "no-cache, must-revalidate"} if p.suffix in (".js", ".css", ".html") else {}
        return FileResponse(p, headers=hdr)
    return _index()
