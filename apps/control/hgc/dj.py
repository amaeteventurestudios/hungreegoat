"""HUNGREE Goat DJ Studio: Auto-DJ, Workout Profiles, Mastering and Mixes.

Architecture (kept deliberately distinct — see docs/dj-studio.md):

  LIBRARY   = hgc/catalog.py's existing `tracks` table. Untouched, read-only from here.
  PLAYLISTS = hgc/main.py's existing `playlists`/`playlist_tracks` tables. A playlist with
              kind='workout' is just an ordinary playlist — same tables, same CRUD, one new
              allowed `kind` value. Eligible track pool only; never copied/duplicated.
  WORKOUT PROFILE = `workout_profiles` — HOW the Auto-DJ engine should use a playlist's pool
              (energy curve, transition character, double-time policy, mastering preset).
  DJ ENGINE = the vendored Aurdour app (apps/dj-studio) — FlowMode/AutoTransition/Recorder.
              This module's `manifest()` is the only bridge: it hands Aurdour a track list
              shaped the way its own Library.js already expects (id/title/artist/bpm/key/
              duration/genre/streamUrl), pointing streamUrl at the *existing* public
              track-audio endpoint (public_api.track_audio) — no second copy of any file.
  MASTERING = the vendored noisyloop/mastering DSP (apps/dj-studio/vendor/mastering-dsp),
              driven offline (not real-time) by dj_orchestrator.py after a mix is recorded.
  MIXES     = `mixes` / `mix_tracks` — brand-new recordings. Never enter `tracks`/Library.
              Stored under config.MIXES_DIR, outside the library scan tree entirely.

This module never touches source audio files: it only reads track metadata and writes new
rows/files under MIXES_DIR.
"""
from __future__ import annotations
import json
import re
import time
from pathlib import Path

from . import config, db

WORKOUT_TYPES = ("general", "strength", "treadmill", "cycling", "rowing", "hiit")
INTENSITIES = ("easy", "moderate", "high", "intense")
MIX_STATUSES = ("creating", "recording", "mastering", "saving", "ready", "failed")
ENGINE_VERSION = "hungree-goat-dj/1"


def ensure_dirs() -> None:
    config.MIXES_DIR.mkdir(parents=True, exist_ok=True)
    config.MIXES_RAW_DIR.mkdir(parents=True, exist_ok=True)


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:60] or "item"


# ---------------------------------------------------------------------------
# DJ manifest — the sole HUNGREE-Goat-Library <-> Aurdour bridge
def manifest(sid: str, playlist_slug: str) -> dict:
    pl = db.q1("SELECT id, name FROM playlists WHERE station=? AND slug=?", (sid, playlist_slug))
    if not pl:
        raise KeyError(playlist_slug)
    rows = db.q(
        "SELECT t.id, t.title, t.artist, t.album, t.genre, t.duration, t.dj_bpm, t.dj_key, "
        "t.dj_energy, t.dj_analyzed_at, t.loudness_i "
        "FROM playlist_tracks pt JOIN tracks t ON t.id = pt.track_id "
        "WHERE pt.playlist_id=? AND t.corrupt=0 AND t.enabled=1 ORDER BY pt.position", (pl["id"],))
    tracks = []
    for r in rows:
        tracks.append({
            "id": str(r["id"]),
            "title": r["title"] or "Untitled",
            "artist": r["artist"] or "",
            "genre": r["genre"] or "",
            "duration": round(r["duration"] or 0, 1),
            "bpm": r["dj_bpm"],
            "key": r["dj_key"],
            "energy": r["dj_energy"],
            "analyzed": bool(r["dj_analyzed_at"]),
            "loudness_i": r["loudness_i"],
            "artwork": f"/v1/artwork/{r['id']}.jpg",
            # The exact existing public, range-request-capable, id-mapped audio endpoint —
            # see public_api.track_audio. Nothing new is exposed; Explore mode already
            # serves every enabled track this way.
            "streamUrl": f"/v1/tracks/{r['id']}/audio.mp3",
            "source": "hungreegoat",
        })
    return {"playlist": {"id": pl["id"], "slug": playlist_slug, "name": pl["name"]}, "tracks": tracks}


def analysis_pending(sid: str, playlist_slug: str) -> list[dict]:
    """Tracks in this playlist that still need BPM/key analysis."""
    m = manifest(sid, playlist_slug)
    return [t for t in m["tracks"] if not t["analyzed"]]


def save_analysis(track_id: int, bpm: float | None, key: str | None, energy: float | None) -> None:
    with db.tx() as c:
        c.execute("UPDATE tracks SET dj_bpm=?, dj_key=?, dj_energy=?, dj_analyzed_at=?, dj_analysis_version=? WHERE id=?",
                  (bpm, key, energy, time.time(), ENGINE_VERSION, track_id))


# ---------------------------------------------------------------------------
# Workout profiles
def profile_list() -> list[dict]:
    return db.rows(db.q("SELECT * FROM workout_profiles ORDER BY workout_type, name"))


def profile_get(pid: int) -> dict | None:
    r = db.q1("SELECT * FROM workout_profiles WHERE id=?", (pid,))
    return dict(r) if r else None


def profile_upsert(data: dict, pid: int | None = None) -> dict:
    if data.get("workout_type") and data["workout_type"] not in WORKOUT_TYPES:
        raise ValueError(f"workout_type must be one of {WORKOUT_TYPES}")
    if data.get("default_intensity") and data["default_intensity"] not in INTENSITIES:
        raise ValueError(f"default_intensity must be one of {INTENSITIES}")
    now = time.time()
    fields = ("name", "workout_type", "default_duration_sec", "default_intensity", "double_time",
              "max_tempo_adjust_pct", "transition_duration_sec", "transition_type", "energy_curve",
              "artist_repeat_gap", "recent_history_window", "mastering_preset", "enabled")
    if pid:
        cur = profile_get(pid)
        if not cur:
            raise KeyError(pid)
        sets = {k: data[k] for k in fields if k in data and data[k] is not None}
        if sets:
            with db.tx() as c:
                c.execute(f"UPDATE workout_profiles SET {','.join(f'{k}=?' for k in sets)}, updated_at=? WHERE id=?",
                          (*sets.values(), now, pid))
        return profile_get(pid)
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO workout_profiles(name,workout_type,default_duration_sec,default_intensity,double_time,"
            "max_tempo_adjust_pct,transition_duration_sec,transition_type,energy_curve,artist_repeat_gap,"
            "recent_history_window,mastering_preset,enabled,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
            (data.get("name", "Workout"), data.get("workout_type", "general"), data.get("default_duration_sec", 1800),
             data.get("default_intensity", "moderate"), int(data.get("double_time", True)),
             data.get("max_tempo_adjust_pct", 6), data.get("transition_duration_sec", 8),
             data.get("transition_type", "blend"), data.get("energy_curve", "warmup,build,peak,cooldown"),
             data.get("artist_repeat_gap", 3), data.get("recent_history_window", 20),
             data.get("mastering_preset", "workout_streaming"), int(data.get("enabled", True)), now, now))
    return profile_get(cur.lastrowid)


def profile_delete(pid: int) -> None:
    if not profile_get(pid):
        raise KeyError(pid)
    with db.tx() as c:
        c.execute("DELETE FROM workout_profiles WHERE id=?", (pid,))


def ensure_default_profiles() -> None:
    """Seed one profile per workout type on first run — editable afterward, never re-seeded
    once the table has any rows (mirrors skins.ensure_seeded's don't-resurrect-deletes rule)."""
    if db.q1("SELECT 1 FROM workout_profiles LIMIT 1"):
        return
    seeds = [
        ("General Workout", "general", 1800, "moderate", 6, "blend"),
        ("Strength", "strength", 3600, "high", 4, "blend"),
        ("Treadmill / Run", "treadmill", 1800, "high", 8, "blend"),
        ("Cycling", "cycling", 2700, "high", 8, "blend"),
        ("Rowing", "rowing", 1800, "high", 6, "blend"),
        ("HIIT", "hiit", 1200, "intense", 5, "cut"),
    ]
    now = time.time()
    with db.tx() as c:
        for name, wt, dur, intensity, tempo, ttype in seeds:
            c.execute(
                "INSERT INTO workout_profiles(name,workout_type,default_duration_sec,default_intensity,double_time,"
                "max_tempo_adjust_pct,transition_duration_sec,transition_type,energy_curve,artist_repeat_gap,"
                "recent_history_window,mastering_preset,enabled,created_at,updated_at) "
                "VALUES(?,?,?,?,1,?,8,?,?,3,20,'workout_streaming',1,?,?)",
                (name, wt, dur, intensity, tempo, ttype, "warmup,build,peak,cooldown", now, now))


# ---------------------------------------------------------------------------
# Mixes
def mix_list(station: str | None = None) -> list[dict]:
    if station:
        rows = db.q("SELECT * FROM mixes WHERE station=? ORDER BY created_at DESC", (station,))
    else:
        rows = db.q("SELECT * FROM mixes ORDER BY created_at DESC")
    return db.rows(rows)


def mix_get(mid: int) -> dict | None:
    r = db.q1("SELECT * FROM mixes WHERE id=?", (mid,))
    return dict(r) if r else None


def mix_recipe(mid: int) -> list[dict]:
    rows = db.q(
        "SELECT mt.*, t.title, t.artist FROM mix_tracks mt JOIN tracks t ON t.id=mt.track_id "
        "WHERE mt.mix_id=? ORDER BY mt.position", (mid,))
    return db.rows(rows)


def mix_create(*, station: str, title: str, playlist_id: int | None, profile_id: int | None,
               workout_type: str | None, intensity: str | None, target_duration_sec: float,
               mastering_preset: str | None) -> dict:
    now = time.time()
    with db.tx() as c:
        cur = c.execute(
            "INSERT INTO mixes(title,station,playlist_id,profile_id,workout_type,intensity,target_duration_sec,"
            "mastering_preset,status,engine_version,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
            (title, station, playlist_id, profile_id, workout_type, intensity, target_duration_sec,
             mastering_preset, "creating", ENGINE_VERSION, now, now))
    return mix_get(cur.lastrowid)


def mix_set_status(mid: int, status: str, **fields) -> dict:
    if status not in MIX_STATUSES:
        raise ValueError(f"bad status {status!r}")
    sets = {"status": status, "updated_at": time.time(), **fields}
    with db.tx() as c:
        c.execute(f"UPDATE mixes SET {','.join(f'{k}=?' for k in sets)} WHERE id=?", (*sets.values(), mid))
    return mix_get(mid)


def mix_set_recipe(mid: int, tracks: list[dict]) -> None:
    """tracks: [{track_id, deck, source_bpm, effective_bpm, tempo_adjust_pct, source_key,
    start_offset_sec, end_offset_sec, transition_in_sec, transition_duration_sec}, ...]
    in final playback order."""
    with db.tx() as c:
        c.execute("DELETE FROM mix_tracks WHERE mix_id=?", (mid,))
        for i, t in enumerate(tracks):
            c.execute(
                "INSERT INTO mix_tracks(mix_id,position,track_id,deck,source_bpm,effective_bpm,tempo_adjust_pct,"
                "source_key,start_offset_sec,end_offset_sec,transition_in_sec,transition_duration_sec) "
                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
                (mid, i, t["track_id"], t.get("deck"), t.get("source_bpm"), t.get("effective_bpm"),
                 t.get("tempo_adjust_pct"), t.get("source_key"), t.get("start_offset_sec", 0),
                 t.get("end_offset_sec"), t.get("transition_in_sec"), t.get("transition_duration_sec")))


def mix_delete(mid: int) -> None:
    m = mix_get(mid)
    if not m:
        raise KeyError(mid)
    for f in (m.get("filename"), ):
        if f:
            (config.MIXES_DIR / f).unlink(missing_ok=True)
    if m.get("raw_filename"):
        (config.MIXES_RAW_DIR / m["raw_filename"]).unlink(missing_ok=True)
    with db.tx() as c:
        c.execute("DELETE FROM mixes WHERE id=?", (mid,))


def mix_title(workout_type: str, intensity: str, duration_sec: float) -> str:
    label = {"general": "General Workout", "strength": "Strength", "treadmill": "Treadmill / Run",
              "cycling": "Cycling", "rowing": "Rowing", "hiit": "HIIT"}.get(workout_type, workout_type.title())
    mins = round(duration_sec / 60)
    n = (db.q1("SELECT COUNT(*) n FROM mixes WHERE workout_type=?", (workout_type,)) or {"n": 0})["n"] + 1
    return f"{label} — {intensity.title()} — {mins}m — {n:03d}"


def safe_download_filename(mix: dict) -> str:
    import datetime as _dt
    d = _dt.datetime.fromtimestamp(mix["created_at"]).strftime("%Y-%m-%d")
    wt = slug(mix.get("workout_type") or "mix")
    it = slug(mix.get("intensity") or "auto")
    mins = round((mix.get("actual_duration_sec") or mix.get("target_duration_sec") or 0) / 60)
    return f"hungree-goat-{wt}-{it}-{mins}min-{d}.wav"
