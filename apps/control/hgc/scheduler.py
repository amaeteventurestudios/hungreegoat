"""Schedule evaluation: which playlist should be on air now, and when it switches next.

Schedules are rows in the `schedules` table (per station) with a HH:MM window,
a day-of-week mask, priority and optional date window (special schedules).
The highest priority matching entry wins; when nothing matches the station's
'all' playlist is used.
"""
from __future__ import annotations
import datetime as dt
from typing import Any

from . import db

DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]


def _hm(s: str) -> int:
    h, m = s.split(":")
    return int(h) * 60 + int(m)


def _matches(row, now: dt.datetime) -> bool:
    if not row["enabled"]:
        return False
    if row["date_from"] and now.date().isoformat() < row["date_from"]:
        return False
    if row["date_to"] and now.date().isoformat() > row["date_to"]:
        return False
    days = {int(d) for d in str(row["days"]).split(",") if d.strip() != ""}
    start, end = _hm(row["start_time"]), _hm(row["end_time"])
    cur = now.hour * 60 + now.minute
    wd = now.weekday()
    if start <= end:
        return wd in days and start <= cur < end
    # wraps midnight: the block "belongs" to the day it starts on
    if cur >= start:
        return wd in days
    return ((wd - 1) % 7) in days and cur < end


def entries(sid: str) -> list[dict]:
    rows = db.rows(db.q("SELECT * FROM schedules WHERE station=? ORDER BY start_time, priority DESC", (sid,)))
    for r in rows:
        r["day_names"] = [DAY_NAMES[int(d)] for d in str(r["days"]).split(",") if d.strip() != ""]
    return rows


def evaluate(sid: str, now: dt.datetime | None = None) -> dict[str, Any]:
    now = now or dt.datetime.now()
    ov = db.get_setting(sid, "schedule_override")
    if ov and ov.get("until", 0) > now.timestamp():
        base = _evaluate_plain(sid, now)
        until = dt.datetime.fromtimestamp(ov["until"])
        base.update(playlist_slug=ov["playlist_slug"], override=ov,
                    current={"id": -1, "name": ov.get("name") or f"Manual override: {ov['playlist_slug']}",
                             "description": f"Operator override until {until.strftime('%H:%M')}", "playlist_slug": ov["playlist_slug"],
                             "start_time": dt.datetime.fromtimestamp(ov.get("since", now.timestamp())).strftime("%H:%M"),
                             "end_time": until.strftime("%H:%M"), "days": "", "priority": 999, "enabled": 1, "override": True},
                    next_switch=until.isoformat(timespec="seconds"), next_switch_in_sec=int((until - now).total_seconds()),
                    next_entry=base["current"])
        return base
    return _evaluate_plain(sid, now)


def _evaluate_plain(sid: str, now: dt.datetime) -> dict[str, Any]:
    rows = db.q("SELECT * FROM schedules WHERE station=? AND enabled=1", (sid,))
    matching = [r for r in rows if _matches(r, now)]
    current = max(matching, key=lambda r: (r["priority"], -_hm(r["start_time"]))) if matching else None
    # find the next minute at which the winning entry changes (scan up to 7 days, minute resolution
    # but step by candidate boundaries for speed)
    boundaries = sorted({_hm(r["start_time"]) for r in rows} | {_hm(r["end_time"]) for r in rows})
    next_switch, next_entry = None, None
    if rows:
        t = now.replace(second=0, microsecond=0)
        cur_id = current["id"] if current else None
        for day in range(0, 8):
            base = (t + dt.timedelta(days=day)).replace(hour=0, minute=0)
            for b in boundaries:
                cand = base + dt.timedelta(minutes=b)
                if cand <= t:
                    continue
                m = [r for r in rows if _matches(r, cand)]
                win = max(m, key=lambda r: (r["priority"], -_hm(r["start_time"]))) if m else None
                if (win["id"] if win else None) != cur_id:
                    next_switch, next_entry = cand, win
                    break
            if next_switch:
                break
    out = {
        "now": now.isoformat(timespec="seconds"),
        "current": dict(current) if current else None,
        "playlist_slug": current["playlist_slug"] if current else "all",
        "next_switch": next_switch.isoformat(timespec="seconds") if next_switch else None,
        "next_switch_in_sec": int((next_switch - now).total_seconds()) if next_switch else None,
        "next_entry": dict(next_entry) if next_entry else None,
        "override": None,
    }
    return out


def day_view(sid: str, offset_days: int = 0) -> list[dict]:
    """Programme blocks for a given day (0=today, 1=tomorrow…), time-ordered with on_now/next flags."""
    now = dt.datetime.now()
    day = now + dt.timedelta(days=offset_days)
    ev = evaluate(sid, now)
    cur_id = ev["current"]["id"] if ev["current"] else None
    next_id = ev["next_entry"]["id"] if ev["next_entry"] else None
    out = []
    for r in entries(sid):
        if day.weekday() not in {int(d) for d in str(r["days"]).split(",") if d.strip()}:
            continue
        if r["date_from"] and day.date().isoformat() < r["date_from"]:
            continue
        if r["date_to"] and day.date().isoformat() > r["date_to"]:
            continue
        r["on_now"] = offset_days == 0 and r["id"] == cur_id
        r["is_next"] = r["id"] == next_id
        out.append(r)
    return sorted(out, key=lambda r: r["start_time"])


def today(sid: str, now: dt.datetime | None = None) -> list[dict]:
    """Today's programme as the dashboard shows it (entries active today, in time order)."""
    now = now or dt.datetime.now()
    ev = evaluate(sid, now)
    cur_id = ev["current"]["id"] if ev["current"] else None
    out = []
    for r in entries(sid):
        if not r["enabled"] or now.weekday() not in {int(d) for d in str(r["days"]).split(",") if d.strip()}:
            continue
        r["on_now"] = r["id"] == cur_id
        out.append(r)
    return out


DEFAULT_SCHEDULE = [
    # name, description, playlist, start, end, days, priority
    ("Morning Lo-Fi Afrobeats", "Smooth starts, brighter days", "all", "06:00", "12:00", "0,1,2,3,4,5,6", 10),
    ("Afternoon Lo-Fi Afrobeats", "Warm, steady daytime rotation", "all", "12:00", "18:00", "0,1,2,3,4,5,6", 10),
    ("Evening Lo-Fi Afrobeats", "Deep grooves, city vibes", "all", "18:00", "00:00", "0,1,2,3,4,5,6", 10),
    ("Overnight Chill", "Late night. Peaceful minds.", "all", "00:00", "06:00", "0,1,2,3,4,5,6", 10),
]


def ensure_defaults(sid: str) -> None:
    if db.q1("SELECT 1 FROM schedules WHERE station=?", (sid,)):
        return
    with db.tx() as c:
        for name, desc, pl, s, e, days, pr in DEFAULT_SCHEDULE:
            c.execute("INSERT INTO schedules(station,name,description,playlist_slug,start_time,end_time,days,priority) "
                      "VALUES(?,?,?,?,?,?,?,?)", (sid, name, desc, pl, s, e, days, pr))
