"""YouTube broadcast visual rotation: which looping background video the live stream
shows, and when it changes.

Single source of truth, layered rather than duplicated: this module owns no video files
and no separate asset registry. It only ever references rows in hgc/skins.py's manifest by
id — any skin can be flagged `broadcast_eligible` there, independent of whether it is
enabled as a Player scene. What this module DOES own is broadcast-specific state:

  data/broadcast.json   — durable config: mode (single/rotation), which single visual,
                           named collections and their video lists/order mode, which
                           collection is active. Edited only from Control.
  run/broadcast-<sid>.json — ephemeral per-station runtime state: which visual is playing
                           right now and the rotation cursor. Written only by the Streamer
                           process while it is running; read by Control for display.

Track-transition detection uses play_history (the same durable, cross-process signal
Liquidsoap's now-playing webhook already writes on every real track change) rather than a
timer, so a visual loops for exactly as long as its song and changes exactly once per
transition — see advance_if_track_changed(), called from the Streamer's poll loop.
"""
from __future__ import annotations
import json
import random
import time
from pathlib import Path

from . import config, skins as skins_mod

MANIFEST = config.DATA_DIR / "broadcast.json"


def load() -> dict:
    try:
        d = json.loads(MANIFEST.read_text())
    except Exception:
        d = {}
    d.setdefault("mode", "single")            # "single" | "rotation"
    d.setdefault("single_visual", None)        # skin id
    d.setdefault("collections", [])            # [{id,name,order:"sequential"|"shuffle",video_ids:[...]}]
    d.setdefault("active_collection", None)
    return d


def save(d: dict) -> None:
    d["updated_at"] = time.time()
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = MANIFEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, indent=1))
    tmp.replace(MANIFEST)


def local_path(skin_row: dict) -> Path | None:
    """The on-disk file for a skin's video, if (and only if) it is a managed local asset —
    a bare filename under SKINS_DIR. The two built-ins that point at the player's own
    bundled hosting (an absolute URL) are real Player scenes but cannot be read as a local
    file by FFmpeg, so they are never broadcast-eligible (skins.upsert enforces this too)."""
    v = (skin_row or {}).get("video")
    if not skins_mod._is_managed(v):
        return None
    p = skins_mod.SKINS_DIR / v
    return p if p.is_file() else None


def eligible_visuals() -> list[dict]:
    return [s for s in skins_mod.load()["skins"] if s.get("broadcast_eligible") and local_path(s) is not None]


def _visual_public(s: dict) -> dict:
    return {
        "id": s["id"], "name": s["name"],
        "video": skins_mod._asset_url(s.get("video")),
        "thumbnail": skins_mod._asset_url(s.get("thumbnail")) or skins_mod._asset_url(s.get("image")),
        "player_enabled": bool(s.get("enabled", True)),
    }


def active_pool(d: dict | None = None) -> list[dict]:
    """The visuals actually in rotation for the current mode — never assumed to be "every
    eligible visual": in rotation mode this is exactly the active collection's list, and an
    eligible video not added to it does not participate."""
    d = d or load()
    elig_by_id = {s["id"]: s for s in eligible_visuals()}
    if d["mode"] == "single":
        s = elig_by_id.get(d["single_visual"])
        return [s] if s else []
    coll = next((c for c in d["collections"] if c["id"] == d["active_collection"]), None)
    if not coll:
        return []
    return [elig_by_id[i] for i in coll.get("video_ids", []) if i in elig_by_id]


def _state_path(sid: str) -> Path:
    return config.RUN_DIR / f"broadcast-{sid}.json"


def _load_state(sid: str) -> dict:
    try:
        return json.loads(_state_path(sid).read_text())
    except Exception:
        return {}


def _save_state(sid: str, state: dict) -> None:
    state["updated_at"] = time.time()
    config.RUN_DIR.mkdir(parents=True, exist_ok=True)
    tmp = _state_path(sid).with_suffix(".tmp")
    tmp.write_text(json.dumps(state))
    tmp.replace(_state_path(sid))


def _pick_next(state: dict, d: dict, pool: list[dict]) -> None:
    if not pool:
        state["current_visual_id"] = None
        return
    ids = [v["id"] for v in pool]
    if d["mode"] == "single":
        state["current_visual_id"] = ids[0]
        return
    coll = next((c for c in d["collections"] if c["id"] == d["active_collection"]), None)
    order = (coll or {}).get("order", "sequential")
    if order == "shuffle":
        choices = [i for i in ids if i != state.get("current_visual_id")] or ids
        state["current_visual_id"] = random.choice(choices)
    else:  # sequential: wrap back to the first clip after the last
        cur = state.get("current_visual_id")
        idx = (ids.index(cur) + 1) % len(ids) if cur in ids else 0
        state["current_visual_id"] = ids[idx]


def advance_if_track_changed(sid: str) -> tuple[Path, dict | None]:
    """Call every poll tick from the Streamer (roughly once a second is plenty — play
    history only changes on a real track transition). Returns the local file path the
    background should show right now, and the resolved skin row (or None if falling back
    to the original animation loop because nothing is configured/eligible)."""
    from . import db
    row = db.q1("SELECT id FROM play_history WHERE station=? ORDER BY id DESC LIMIT 1", (sid,))
    latest_id = row["id"] if row else None
    state = _load_state(sid)
    d = load()
    pool = active_pool(d)
    changed = latest_id is not None and latest_id != state.get("last_play_history_id")
    if changed or state.get("current_visual_id") is None:
        state["last_play_history_id"] = latest_id
        _pick_next(state, d, pool)
        _save_state(sid, state)
    visual = next((v for v in pool if v["id"] == state.get("current_visual_id")), None)
    path = local_path(visual) if visual else None
    if path is None:
        # Deterministic, always-available fallback: the original animation, untouched on
        # disk, exactly like the day before Broadcast Visuals existed. Never lets a
        # misconfigured rotation take the background to nothing.
        path = config.LOOP_720 if config.LOOP_720.exists() else config.LOOP_SOURCE
        state["current_visual_id"] = None
    return path, visual


def current_state(sid: str) -> dict:
    """Everything the dashboard needs to show "what's on air right now" for broadcast.
    `current_visual: null` means the original animation loop is airing as the deterministic
    fallback — either because nothing is configured/eligible, or the stream supervisor
    hasn't reported in yet (e.g. it's still starting)."""
    state = _load_state(sid)
    d = load()
    pool = active_pool(d)
    visual = next((v for v in pool if v["id"] == state.get("current_visual_id")), None)
    return {"mode": d["mode"], "active_count": len(pool), "current_visual": _visual_public(visual) if visual else None}


def public_state() -> dict:
    """Full Broadcast Visuals page payload for Control."""
    d = load()
    elig = eligible_visuals()
    elig_by_id = {s["id"]: s for s in elig}
    collections = []
    for c in d["collections"]:
        vids = [elig_by_id[i] for i in c.get("video_ids", []) if i in elig_by_id]
        collections.append({
            "id": c["id"], "name": c["name"], "order": c.get("order", "sequential"),
            "video_ids": c.get("video_ids", []), "count": len(vids),
            "videos": [_visual_public(v) for v in vids],
        })
    lofi = current_state("lofi")
    return {
        "mode": d["mode"], "single_visual": d["single_visual"],
        "active_collection": d["active_collection"], "collections": collections,
        "active_count": len(active_pool(d)),
        "eligible_visuals": [_visual_public(s) | {"id_for_probe": s["id"]} for s in elig],
        "now": lofi,
    }


def set_mode(mode: str, single_visual: str | None = None, active_collection: str | None = None) -> dict:
    if mode not in ("single", "rotation"):
        raise ValueError("mode must be 'single' or 'rotation'")
    d = load()
    d["mode"] = mode
    if mode == "single":
        if single_visual is not None:
            d["single_visual"] = single_visual
    else:
        if active_collection is not None:
            d["active_collection"] = active_collection
    save(d)
    return d


def upsert_collection(data: dict, cid: str | None = None) -> dict:
    d = load()
    if cid:
        cur = next((c for c in d["collections"] if c["id"] == cid), None)
        if cur is None:
            raise KeyError(cid)
    else:
        base = skins_mod.slug(data.get("name", "collection")); sid = base; n = 2
        while any(c["id"] == sid for c in d["collections"]):
            sid = f"{base}-{n}"; n += 1
        cur = {"id": sid, "order": "sequential", "video_ids": []}
        d["collections"].append(cur)
    for k in ("name", "order", "video_ids"):
        if k in data and data[k] is not None:
            cur[k] = data[k]
    if cur.get("order") not in ("sequential", "shuffle"):
        cur["order"] = "sequential"
    save(d)
    return cur


def delete_collection(cid: str) -> None:
    d = load()
    if not any(c["id"] == cid for c in d["collections"]):
        raise KeyError(cid)
    d["collections"] = [c for c in d["collections"] if c["id"] != cid]
    if d.get("active_collection") == cid:
        d["active_collection"] = None
    save(d)
