"""Next-track selection for a station: queue → jingles/station IDs → scheduled playlist.

Returns Liquidsoap `annotate:` URIs so metadata (title/artist/artwork/replaygain/track id)
travels with the request.
"""
from __future__ import annotations
import random
import time

from . import config, db, scheduler

_last_jingle_at: dict[str, float] = {}
_songs_since_jingle: dict[str, int] = {}
_last_hour_id: dict[str, int] = {}
_recent: dict[str, list[int]] = {}
# Operator requests handed to Liquidsoap but not yet on air (so a play-next can put them back).
SERVED: dict[str, list[int]] = {}


def _annotate(t: dict, extra: dict | None = None) -> str:
    def esc(v):
        return str(v).replace("\\", "\\\\").replace('"', '\\"')
    md = {
        "title": t.get("title") or t.get("filename"),
        "artist": t.get("artist") or "HUNGREE Goat",
        "album": t.get("album") or "",
        "genre": t.get("genre") or "",
        "hgc_track_id": t.get("id"),
        "hgc_source": "main",
        "hgc_artwork": t.get("resolved_artwork") or str(config.DEFAULT_ARTWORK),
    }
    if extra:
        md.update(extra)
    parts = ",".join(f'{k}="{esc(v)}"' for k, v in md.items() if v is not None and v != "")
    return f"annotate:{parts}:{t['path']}"


def _playlist_tracks(sid: str, slug: str) -> list[dict]:
    rows = db.q("SELECT t.*, pt.position, pt.weight FROM tracks t JOIN playlist_tracks pt ON pt.track_id=t.id "
                "JOIN playlists p ON p.id=pt.playlist_id WHERE p.station=? AND p.slug=? AND p.enabled=1 "
                "AND t.enabled=1 AND t.corrupt=0 ORDER BY pt.position, t.filename", (sid, slug))
    return db.rows(rows)


def _kind_tracks(sid: str, kind: str) -> list[dict]:
    return db.rows(db.q("SELECT t.* FROM tracks t JOIN playlist_tracks pt ON pt.track_id=t.id "
                        "JOIN playlists p ON p.id=pt.playlist_id WHERE p.station=? AND p.kind=? AND p.enabled=1 "
                        "AND t.enabled=1 AND t.corrupt=0", (sid, kind)))


def _pick(sid: str, tracks: list[dict], settings: dict) -> dict | None:
    if not tracks:
        return None
    if settings.get("sequential") and not settings.get("shuffle"):
        cur = int(settings.get("sequential_cursor") or 0) % len(tracks)
        db.set_setting(sid, "sequential_cursor", (cur + 1) % len(tracks))
        return tracks[cur]
    recent = _recent.setdefault(sid, [])
    # avoid repeating anything from the last ~40% of the library
    avoid = set(recent[-max(1, int(len(tracks) * 0.4)):]) if len(tracks) > 3 else set()
    pool = [t for t in tracks if t["id"] not in avoid] or tracks
    if settings.get("weighted_rotation"):
        now = time.time()
        weights = []
        for t in pool:
            w = float(t.get("weight") or 1)
            lp = t.get("last_played")
            if lp:
                hours = (now - lp) / 3600.0
                w *= min(3.0, 0.5 + hours / 12.0)   # tracks not heard for a while rise in weight
            weights.append(max(0.05, w))
        choice = random.choices(pool, weights=weights, k=1)[0]
    else:
        choice = random.choice(pool)
    recent.append(choice["id"])
    del recent[:-500]
    return choice


def _due_jingle(sid: str, settings: dict) -> dict | None:
    now = time.time()
    hour_id = int(now // 3600)
    ids = _kind_tracks(sid, "station_ids")
    jingles = _kind_tracks(sid, "jingles")
    if settings.get("jingle_top_of_hour") and ids and _last_hour_id.get(sid) != hour_id and (now % 3600) < 600:
        _last_hour_id[sid] = hour_id
        return random.choice(ids)
    every_min = int(settings.get("jingle_every_minutes") or 0)
    if every_min > 0 and jingles and now - _last_jingle_at.get(sid, 0) >= every_min * 60:
        return random.choice(jingles)
    every_songs = int(settings.get("jingle_every_songs") or 0)
    if every_songs > 0 and jingles and _songs_since_jingle.get(sid, 0) >= every_songs:
        return random.choice(jingles)
    return None


def next_uri(sid: str) -> tuple[str | None, dict]:
    """Return (annotate URI or None, info) for Liquidsoap's request.dynamic."""
    settings = db.get_settings(sid)
    info: dict = {"reason": None}
    # 1. jingles / station IDs when due
    j = _due_jingle(sid, settings)
    if j:
        _last_jingle_at[sid] = time.time()
        _songs_since_jingle[sid] = 0
        info["reason"] = "jingle"
        return _annotate(j, {"hgc_kind": "jingle"}), info
    # 2. operator queue
    if settings.get("request_queue_enabled", True):
        row = db.q1("SELECT q.id qid, q.requested_by, t.* FROM queue q JOIN tracks t ON t.id=q.track_id "
                    "WHERE q.station=? AND t.corrupt=0 ORDER BY q.position LIMIT 1", (sid,))
        if row:
            t = dict(row)
            with db.tx() as c:
                c.execute("DELETE FROM queue WHERE id=?", (t["qid"],))
            info["reason"] = "queue"
            SERVED.setdefault(sid, []).append(t["id"])
            del SERVED[sid][:-10]
            db.log_event("info", "queue", f"Queued request handed to Liquidsoap: {t['title']}", sid)
            _songs_since_jingle[sid] = _songs_since_jingle.get(sid, 0) + 1
            return _annotate(t, {"hgc_kind": "request"}), info
    # 3. scheduled playlist
    sched = scheduler.evaluate(sid)
    slug = sched["playlist_slug"]
    tracks = _playlist_tracks(sid, slug)
    if not tracks and slug != "all":
        db.log_event("warning", "schedule", f"Scheduled playlist '{slug}' is empty, using full library", sid)
        tracks = _playlist_tracks(sid, "all")
    t = _pick(sid, tracks, settings)
    if not t:
        info["reason"] = "empty"
        return None, info
    _songs_since_jingle[sid] = _songs_since_jingle.get(sid, 0) + 1
    info["reason"] = f"playlist:{slug}"
    extra = {"hgc_kind": "music", "hgc_playlist": slug}
    if settings.get("normalization") and t.get("replaygain_db") is not None:
        extra["replaygain_track_gain"] = f"{t['replaygain_db']:+.2f} dB"
    xf = float(settings.get("crossfade_sec") or 0)
    extra["liq_fade_in"] = f"{min(xf, 5.0):.1f}"
    return _annotate(t, extra), info


def upcoming(sid: str, n: int = 50) -> list[dict]:
    """Operator queue in play order. (The single request Liquidsoap has already
    prepared is reported separately by `prepared()`; play-next drops it.)"""
    rows = db.rows(db.q("SELECT q.id qid, q.requested_by, q.added_at, t.id, t.title, t.artist, t.album, t.duration, "
                        "t.resolved_artwork, t.filename FROM queue q JOIN tracks t ON t.id=q.track_id "
                        "WHERE q.station=? ORDER BY q.position LIMIT ?", (sid, n)))
    return rows


def prepared(sid: str) -> list[dict]:
    from . import liq
    out = []
    for p in liq.upcoming_prepared(sid):
        if p["track_id"]:
            t = db.q1("SELECT id,title,artist,album,duration,resolved_artwork FROM tracks WHERE id=?", (p["track_id"],))
            if t:
                out.append({**dict(t), "prepared": True})
        else:
            out.append({"id": None, "title": p["uri"].rsplit("/", 1)[-1], "artist": "", "duration": None, "prepared": True})
    return out
