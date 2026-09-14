"""SQLite persistence: media catalog, playlists, queue, schedule, settings, events."""
from __future__ import annotations
import json
import sqlite3
import threading
import time
from contextlib import contextmanager
from typing import Any, Iterator

from . import config

_lock = threading.RLock()
_conn: sqlite3.Connection | None = None

SCHEMA = """
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY,
  path TEXT UNIQUE NOT NULL,
  filename TEXT NOT NULL,
  station TEXT NOT NULL,
  title TEXT, artist TEXT, album TEXT, genre TEXT,
  duration REAL, codec TEXT, format TEXT, bitrate INTEGER, sample_rate INTEGER, channels INTEGER,
  size INTEGER, mtime REAL,
  external_artwork TEXT, embedded_artwork INTEGER DEFAULT 0, resolved_artwork TEXT, artwork_source TEXT,
  loudness_i REAL, replaygain_db REAL,
  enabled INTEGER DEFAULT 1, corrupt INTEGER DEFAULT 0, error TEXT,
  play_count INTEGER DEFAULT 0, last_played REAL,
  added_at REAL, updated_at REAL, sha256 TEXT
);
CREATE INDEX IF NOT EXISTS idx_tracks_station ON tracks(station);

CREATE TABLE IF NOT EXISTS playlists (
  id INTEGER PRIMARY KEY,
  station TEXT NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  kind TEXT DEFAULT 'music',          -- music | jingles | station_ids | fallback
  mode TEXT DEFAULT 'shuffle',        -- shuffle | sequential | weighted
  weight INTEGER DEFAULT 1,
  enabled INTEGER DEFAULT 1,
  UNIQUE(station, slug)
);
CREATE TABLE IF NOT EXISTS playlist_tracks (
  playlist_id INTEGER NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position INTEGER DEFAULT 0,
  weight INTEGER DEFAULT 1,
  PRIMARY KEY(playlist_id, track_id)
);

CREATE TABLE IF NOT EXISTS queue (
  id INTEGER PRIMARY KEY,
  station TEXT NOT NULL,
  track_id INTEGER NOT NULL REFERENCES tracks(id) ON DELETE CASCADE,
  position REAL NOT NULL,
  requested_by TEXT DEFAULT 'operator',
  added_at REAL
);

CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY,
  station TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  playlist_slug TEXT NOT NULL,
  start_time TEXT NOT NULL,   -- HH:MM
  end_time TEXT NOT NULL,     -- HH:MM (may wrap past midnight)
  days TEXT NOT NULL DEFAULT '0,1,2,3,4,5,6',  -- 0=Mon .. 6=Sun
  priority INTEGER DEFAULT 10,
  enabled INTEGER DEFAULT 1,
  date_from TEXT, date_to TEXT   -- optional special schedule window (YYYY-MM-DD)
);

CREATE TABLE IF NOT EXISTS settings (
  station TEXT NOT NULL,
  key TEXT NOT NULL,
  value TEXT,
  PRIMARY KEY(station, key)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  ts REAL NOT NULL,
  station TEXT,
  severity TEXT NOT NULL,   -- info | warning | error | critical
  category TEXT NOT NULL,   -- track | schedule | fallback | queue | stream | silence | system | auth | api | media | usb
  message TEXT NOT NULL,
  detail TEXT
);
CREATE INDEX IF NOT EXISTS idx_events_ts ON events(ts);

CREATE TABLE IF NOT EXISTS alerts (
  id INTEGER PRIMARY KEY,
  ts REAL NOT NULL, updated_at REAL,
  station TEXT, severity TEXT NOT NULL, category TEXT NOT NULL,
  title TEXT NOT NULL, message TEXT,
  state TEXT NOT NULL DEFAULT 'open',   -- open | acknowledged | resolved | cleared
  read INTEGER DEFAULT 0, count INTEGER DEFAULT 1,
  resolved_at REAL, event_id INTEGER
);
CREATE INDEX IF NOT EXISTS idx_alerts_state ON alerts(state);

CREATE TABLE IF NOT EXISTS play_history (
  id INTEGER PRIMARY KEY,
  station TEXT NOT NULL,
  track_id INTEGER,
  title TEXT, artist TEXT, filename TEXT,
  started_at REAL NOT NULL,
  source TEXT
);
CREATE INDEX IF NOT EXISTS idx_history_station ON play_history(station, started_at);
"""


def connect() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            config.ensure_dirs()
            _conn = sqlite3.connect(str(config.DB_PATH), check_same_thread=False, timeout=10)
            _conn.row_factory = sqlite3.Row
            _conn.execute("PRAGMA journal_mode=WAL")
            _conn.execute("PRAGMA foreign_keys=ON")
            _conn.execute("PRAGMA synchronous=NORMAL")
            _conn.executescript(SCHEMA)
            cols = {r[1] for r in _conn.execute("PRAGMA table_info(tracks)")}
            if "sha256" not in cols:
                _conn.execute("ALTER TABLE tracks ADD COLUMN sha256 TEXT")
        return _conn


@contextmanager
def tx() -> Iterator[sqlite3.Connection]:
    c = connect()
    with _lock:
        try:
            yield c
            c.commit()
        except Exception:
            c.rollback()
            raise


def q(sql: str, params: tuple | dict = ()) -> list[sqlite3.Row]:
    c = connect()
    with _lock:
        return c.execute(sql, params).fetchall()


def q1(sql: str, params: tuple | dict = ()) -> sqlite3.Row | None:
    rows = q(sql, params)
    return rows[0] if rows else None


def rows(rs) -> list[dict]:
    return [dict(r) for r in rs]


# ---- settings -----------------------------------------------------------
DEFAULT_SETTINGS: dict[str, Any] = {
    "shuffle": True,
    "sequential": False,
    "crossfade_sec": 5,
    "normalization": True,
    "silence_guard": True,
    "cue_points": False,
    "weighted_rotation": True,
    "request_queue_enabled": True,
    "jingle_top_of_hour": False,
    "jingle_every_minutes": 0,
    "jingle_every_songs": 0,
    "artwork_sync": True,
    "metadata_rewrite": True,
    "send_now_playing": True,
    "live_mic_enabled": False,
    "live_remote_enabled": False,
    "live_remote_url": "",
    "force_fallback": False,
    "output_target": "youtube",   # youtube | local | none
    "sequential_cursor": 0,
    "schedule_override": None,     # {"playlist_slug":..., "until": ts, "name":...}
    "youtube_meta": {},            # operator reference: title/description/category/latency (Requires YouTube Studio)
}


def get_setting(station: str, key: str, default: Any = None) -> Any:
    r = q1("SELECT value FROM settings WHERE station=? AND key=?", (station, key))
    if r is None:
        return DEFAULT_SETTINGS.get(key, default)
    try:
        return json.loads(r["value"])
    except Exception:
        return r["value"]


def get_settings(station: str) -> dict[str, Any]:
    out = dict(DEFAULT_SETTINGS)
    for r in q("SELECT key, value FROM settings WHERE station=?", (station,)):
        try:
            out[r["key"]] = json.loads(r["value"])
        except Exception:
            out[r["key"]] = r["value"]
    return out


def set_setting(station: str, key: str, value: Any) -> None:
    with tx() as c:
        c.execute("INSERT INTO settings(station,key,value) VALUES(?,?,?) "
                  "ON CONFLICT(station,key) DO UPDATE SET value=excluded.value",
                  (station, key, json.dumps(value)))


# ---- events ---------------------------------------------------------------
SEVERITIES = ("info", "warning", "error", "critical")


def log_event(severity: str, category: str, message: str, station: str | None = None, detail: Any = None) -> None:
    if severity not in SEVERITIES:
        severity = "info"
    with tx() as c:
        c.execute("INSERT INTO events(ts,station,severity,category,message,detail) VALUES(?,?,?,?,?,?)",
                  (time.time(), station, severity, category, message,
                   json.dumps(detail) if detail is not None and not isinstance(detail, str) else detail))
        eid = c.execute("SELECT MAX(id) FROM events").fetchone()[0]
        # keep the table bounded
        c.execute("DELETE FROM events WHERE id < (SELECT COALESCE(MAX(id),0) FROM events) - 20000")
        if severity in ("warning", "error", "critical"):
            _raise_alert(c, eid, severity, category, message, station)


ALERT_TITLES = {
    "usb": "Media drive", "silence": "Silence guard", "fallback": "Fallback", "stream": "Stream",
    "media": "Media", "auth": "Authentication", "system": "System", "schedule": "Schedule", "queue": "Queue", "api": "API",
}


def _raise_alert(c, event_id, severity, category, message, station):
    """Alerts are the operator-facing view of noteworthy events. Repeats of the same
    open alert are counted, not duplicated. Clearing alerts never touches events."""
    title = ALERT_TITLES.get(category, category.title())
    row = c.execute("SELECT id FROM alerts WHERE state IN ('open','acknowledged') AND category=? AND "
                    "COALESCE(station,'')=COALESCE(?,'') AND message=? ORDER BY id DESC LIMIT 1",
                    (category, station, message)).fetchone()
    if row:
        c.execute("UPDATE alerts SET count=count+1, updated_at=?, read=0, severity=? WHERE id=?", (time.time(), severity, row[0]))
    else:
        c.execute("INSERT INTO alerts(ts,updated_at,station,severity,category,title,message,event_id) VALUES(?,?,?,?,?,?,?,?)",
                  (time.time(), time.time(), station, severity, category, title, message, event_id))


def resolve_alerts(category: str, station: str | None = None, note: str | None = None) -> int:
    """Mark open alerts of a category resolved (the underlying condition cleared)."""
    with tx() as c:
        q_ = "UPDATE alerts SET state='resolved', resolved_at=?, updated_at=? WHERE state IN ('open','acknowledged') AND category=?"
        params: list = [time.time(), time.time(), category]
        if station:
            q_ += " AND station=?"; params.append(station)
        return c.execute(q_, params).rowcount
