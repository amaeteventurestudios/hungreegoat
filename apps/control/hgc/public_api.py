"""Public, read-only listener API (mounted at /v1).

Serves ONLY listener-safe information: station names, live state, now playing,
up next, schedule, public YouTube links, artwork by opaque id, and the audio
stream. Nothing here touches control functions, secrets, paths, hosts or metrics.
Intended to be published as api.hungreegoat.com through the gateway.
"""
from __future__ import annotations
import datetime as dt
import time
import urllib.request
from pathlib import Path

from fastapi import APIRouter, HTTPException, Request, Response
from fastapi.responses import FileResponse, StreamingResponse

from . import config, db, liq, scheduler, selector, skins as skins_mod

router = APIRouter(prefix="/v1", tags=["public"])
_cache: dict[str, tuple[float, object]] = {}
PUBLIC_HEADERS = {"Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=3", "X-Robots-Tag": "noindex"}


def _cached(key: str, ttl: float, fn):
    c = _cache.get(key)
    if c and time.time() - c[0] < ttl:
        return c[1]
    v = fn()
    _cache[key] = (time.time(), v)
    return v


def _now_state(sid: str) -> dict:
    """Import lazily to avoid a circular import with main (which owns NOW)."""
    from . import main as m
    return m.NOW.get(sid, {})


def _stream_live(sid: str) -> bool:
    from . import main as m
    s = m._stream_status(sid)
    return s.get("state") == "running" and s.get("target") == "youtube" and not s.get("stale")


def _station_public(sid: str) -> dict:
    st = config.station(sid)
    lib = db.q1("SELECT COUNT(*) n FROM tracks WHERE station=? AND corrupt=0 AND enabled=1", (sid,))
    audio_live = liq.alive(sid)
    meta = db.get_setting(sid, "youtube_meta") or {}
    has_media = (lib["n"] or 0) > 0
    return {
        "id": sid, "name": st["name"], "short": st["short"], "genre": st["genre"], "tags": st["tags"],
        "status": "live" if (audio_live and has_media) else ("coming_soon" if not has_media else "offline"),
        "live": bool(audio_live and has_media), "youtube_live": _stream_live(sid),
        "stream_url": f"/v1/listen/{sid}.mp3", "youtube_url": meta.get("public_url") or None,
        "description": meta.get("public_description") or (
            "Smooth lo-fi versions of Afrobeats. Perfect for work, study, relaxation and creative flow." if sid == "lofi"
            else "Pure energy. Always African. Coming soon."),
    }


def _now_public(sid: str) -> dict:
    now = _now_state(sid)
    st = _station_public(sid)
    pos = liq.position(sid) if st["live"] else {}
    elapsed = pos.get("elapsed")
    if now.get("duration") and elapsed is not None:
        elapsed = min(elapsed, now["duration"])
    started = (time.time() - elapsed) if elapsed is not None else now.get("started_at")
    return {
        "station": st["short"], "station_id": sid, "live": st["live"], "youtube_live": st["youtube_live"],
        "title": now.get("title") if st["live"] else None, "artist": now.get("artist") if st["live"] else None,
        "album": now.get("album") if st["live"] else None, "tags": st["tags"],
        "artwork": (f"/v1/artwork/{now['track_id']}.jpg" if now.get("track_id") else "/v1/artwork/default.jpg"),
        "duration": now.get("duration"), "elapsed": round(elapsed, 1) if elapsed is not None else None,
        "started_at": dt.datetime.fromtimestamp(started, dt.timezone.utc).isoformat() if started else None,
        "youtube_url": st["youtube_url"], "stream_url": st["stream_url"], "server_time": dt.datetime.now(dt.timezone.utc).isoformat(),
    }


def _up_next(sid: str) -> list[dict]:
    if not liq.alive(sid):
        return []
    n = db.get_setting(sid, "public_up_next_count", 5)
    if n not in (3, 5, 10):
        n = 5
    out = []
    for t in selector.prepared(sid):
        if t.get("id"):
            out.append({"title": t["title"], "artist": t["artist"], "duration": t["duration"], "artwork": f"/v1/artwork/{t['id']}.jpg", "source": "engine"})
    for t in selector.upcoming(sid, 10):
        out.append({"title": t["title"], "artist": t["artist"], "duration": t["duration"], "artwork": f"/v1/artwork/{t['id']}.jpg", "source": "request"})
    for t in selector.planned(sid):
        out.append({"title": t["title"], "artist": t["artist"], "duration": t["duration"], "artwork": f"/v1/artwork/{t['id']}.jpg", "source": "planned"})
    return out[:n]


def _schedule_public(sid: str) -> dict:
    ev = scheduler.evaluate(sid)
    blocks = []
    for b in scheduler.day_view(sid, 0):
        blocks.append({"name": b["name"], "description": b["description"], "start": b["start_time"], "end": b["end_time"],
                       "on_now": b["on_now"], "next": b["is_next"], "days": b.get("day_names") or []})
    return {"station_id": sid, "timezone": time.strftime("%Z"), "now": ev["current"]["name"] if ev["current"] else None,
            "next_switch": ev["next_switch"], "today": blocks}


@router.get("/stations")
def stations():
    return Response(content=__import__("json").dumps({"stations": _cached("stations", 5, lambda: [_station_public(s) for s in config.STATION_IDS])}),
                    media_type="application/json", headers=PUBLIC_HEADERS)


@router.get("/now-playing")
def now_playing(station: str = "lofi"):
    if station not in config.STATIONS:
        raise HTTPException(404)
    return Response(content=__import__("json").dumps(_cached(f"np-{station}", 2, lambda: _now_public(station))), media_type="application/json", headers=PUBLIC_HEADERS)


@router.get("/up-next")
def up_next(station: str = "lofi"):
    if station not in config.STATIONS:
        raise HTTPException(404)
    return Response(content=__import__("json").dumps({"station_id": station, "items": _cached(f"un-{station}", 4, lambda: _up_next(station))}), media_type="application/json", headers=PUBLIC_HEADERS)


@router.get("/schedule")
def schedule(station: str = "lofi"):
    if station not in config.STATIONS:
        raise HTTPException(404)
    return Response(content=__import__("json").dumps(_cached(f"sch-{station}", 15, lambda: _schedule_public(station))), media_type="application/json", headers=PUBLIC_HEADERS)


@router.get("/live")
def live():
    d = _cached("live", 3, lambda: {s: {"live": _station_public(s)["live"], "youtube_live": _stream_live(s), "status": _station_public(s)["status"]} for s in config.STATION_IDS})
    return Response(content=__import__("json").dumps({"stations": d, "server_time": dt.datetime.now(dt.timezone.utc).isoformat()}), media_type="application/json", headers=PUBLIC_HEADERS)


@router.get("/artwork/{art}.jpg")
def artwork(art: str):
    hdr = {"Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400"}
    if art == "default":
        return FileResponse(config.DEFAULT_ARTWORK if config.DEFAULT_ARTWORK.exists() else config.DEFAULT_ARTWORK_BUNDLED, media_type="image/jpeg", headers=hdr)
    if not art.isdigit():
        raise HTTPException(404)
    t = db.q1("SELECT resolved_artwork FROM tracks WHERE id=?", (int(art),))
    p = Path(t["resolved_artwork"]) if t and t["resolved_artwork"] else config.DEFAULT_ARTWORK
    try:
        if not p.is_file():
            p = config.DEFAULT_ARTWORK_BUNDLED
    except OSError:
        p = config.DEFAULT_ARTWORK_BUNDLED
    return FileResponse(p, media_type="image/jpeg", headers=hdr)


@router.get("/listen/{sid}.mp3")
def listen(sid: str, request: Request):
    """Public audio stream (MP3 128 kbps) — listener's browser only; nothing here can affect the broadcast."""
    if sid not in config.STATIONS:
        raise HTTPException(404)
    url = f"http://127.0.0.1:{config.station(sid)['harbor_port']}/{sid}-listen.mp3"
    try:
        upstream = urllib.request.urlopen(url, timeout=6)
    except Exception:
        raise HTTPException(503, "station audio is not available right now")
    def gen():
        try:
            while True:
                chunk = upstream.read(8192)
                if not chunk:
                    break
                yield chunk
        finally:
            upstream.close()
    return StreamingResponse(gen(), media_type="audio/mpeg", headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no",
                             "Access-Control-Allow-Origin": "*", "icy-name": config.station(sid)["name"]})


# ---- Explore mode: public track catalog + per-track audio (cached MP3 transcodes) -------------
MP3_CACHE = config.MEDIA / ".cache" / "mp3"


def _tracks_public(sid: str) -> list[dict]:
    rows = db.q("SELECT id,title,artist,album,genre,duration FROM tracks WHERE station=? AND corrupt=0 AND enabled=1 "
                "ORDER BY title COLLATE NOCASE", (sid,))
    return [{"id": r["id"], "title": r["title"], "artist": r["artist"], "album": r["album"], "genre": r["genre"],
             "duration": round(r["duration"] or 0, 1), "artwork": f"/v1/artwork/{r['id']}.jpg", "audio": f"/v1/tracks/{r['id']}/audio.mp3"} for r in rows]


@router.get("/tracks")
def tracks(station: str = "lofi"):
    if station not in config.STATIONS:
        raise HTTPException(404)
    return Response(content=__import__("json").dumps({"station_id": station, "tracks": _cached(f"tr-{station}", 30, lambda: _tracks_public(station))}),
                    media_type="application/json", headers={**PUBLIC_HEADERS, "Cache-Control": "public, max-age=30"})


def ensure_mp3(track_id: int) -> Path | None:
    """Transcode once to MP3 128k on the media drive; subsequent plays are plain file serves.
    Same enabled=1 filter as _tracks_public()'s listing — a track an operator has disabled
    must not remain fetchable by ID once it's no longer listed; track IDs are sequential and
    trivially enumerable, so "just not linked" was never a real access boundary here."""
    import subprocess
    t = db.q1("SELECT path, mtime FROM tracks WHERE id=? AND corrupt=0 AND enabled=1", (track_id,))
    if not t:
        return None
    MP3_CACHE.mkdir(parents=True, exist_ok=True)
    out = MP3_CACHE / f"{track_id}.mp3"
    if out.exists() and out.stat().st_size > 1000 and out.stat().st_mtime >= (t["mtime"] or 0):
        return out
    tmp = out.with_suffix(".tmp.mp3")
    r = subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", t["path"], "-vn", "-ac", "2", "-ar", "44100", "-b:a", "128k",
                        "-f", "mp3", str(tmp)], capture_output=True, timeout=600)
    if r.returncode != 0 or not tmp.exists():
        return None
    tmp.replace(out)
    return out


@router.get("/tracks/{track_id}/audio.mp3")
def track_audio(track_id: int, request: Request):
    p = ensure_mp3(track_id)
    if not p:
        raise HTTPException(404)
    size = p.stat().st_size
    hdr = {"Accept-Ranges": "bytes", "Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=86400", "Content-Type": "audio/mpeg"}
    rng = request.headers.get("range")
    if rng and rng.startswith("bytes="):
        a, _, b = rng[6:].partition("-")
        start = int(a) if a else max(0, size - int(b or 0)); end = int(b) if (b and a) else size - 1
        end = min(end, size - 1)
        if start > end:
            raise HTTPException(416)
        def gen():
            with open(p, "rb") as f:
                f.seek(start); left = end - start + 1
                while left > 0:
                    chunk = f.read(min(65536, left)); left -= len(chunk)
                    if not chunk:
                        break
                    yield chunk
        hdr.update({"Content-Range": f"bytes {start}-{end}/{size}", "Content-Length": str(end - start + 1)})
        return StreamingResponse(gen(), status_code=206, headers=hdr)
    return FileResponse(p, media_type="audio/mpeg", headers=hdr)


# ---- Player skins ----------------------------------------------------------------------------
@router.get("/skins")
def skins():
    d = skins_mod.load()
    return Response(content=__import__("json").dumps({"skins": skins_mod.public_list(), "default": d.get("default"), "updated_at": d.get("updated_at")}),
                    media_type="application/json", headers={**PUBLIC_HEADERS, "Cache-Control": "public, max-age=30"})


@router.get("/skins/assets/{name}")
def skin_asset(name: str):
    if "/" in name or name.startswith("."):
        raise HTTPException(404)
    p = skins_mod.SKINS_DIR / name
    if not p.is_file():
        raise HTTPException(404)
    return FileResponse(p, headers={"Access-Control-Allow-Origin": "*", "Cache-Control": "public, max-age=604800"})


@router.options("/{rest:path}")
def preflight(rest: str):
    return Response(status_code=204, headers={"Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, OPTIONS",
                                              "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400"})
