"""Player skins: the visual scenes offered by player.hungreegoat.com, PLUS the pool of
looping backgrounds the live YouTube broadcast can draw from (see hgc/broadcast.py).

One registry, no special cases: every scene — the six the player originally shipped with
and anything an operator uploads — is a normal row in data/skins.json. There is no
separate hardcoded "built-in" list anywhere (the player used to carry its own copy; it no
longer does). A row's `source` field ("built-in" | "custom") is purely informational,
set once when the row is created, and every row supports the exact same lifecycle:
enable/disable, reorder, set default, edit, upload assets, and — this is the point of this
design — delete. Deleting a former "built-in" is real and permanent, exactly like deleting
a custom skin.

Assets (video/image/thumbnail) live on the media drive under /media/hungree-goat/skins/
and are served publicly via /v1/skins/assets/<file>. A stored `video`/`image` value is
EITHER a bare filename living in that directory (a managed upload — gets the
/v1/skins/assets/ prefix and is safe to delete when superseded/removed) OR an absolute
URL (used byte-for-byte, never deleted by this module) — that second form is how the two
built-ins with real bundled footage point at the player's own static hosting
(player.hungreegoat.com/assets/scenes/...) without duplicating those files onto the Pi.

This manifest is the single authoritative source the dashboard and the public player both
read: `/api/skins` (operator) and `/v1/skins` (public) return the same inventory, filtered
to enabled rows for the public one — so what Control shows is exactly what the public
player offers, and a disabled or deleted row is never rediscoverable by any hidden list.

A skin is a VISUAL SCENE (Study Room, Camping Van, ...). Time of day (Dawn / Afternoon /
Dusk / Night) is a separate, independent treatment the player applies to whichever skin is
selected — it must never itself switch the scene. By default a skin uses the same asset at
every time of day ("time_mode": "always"); an operator can optionally attach per-time
variant assets ("time_mode": "variants") without changing which skin is active.

`broadcast_eligible` is an orthogonal flag: it marks a skin's video as available to the
YouTube Broadcast Visuals system (hgc/broadcast.py). A skin can be a Player scene, a
broadcast visual, both, or neither — enabling one does not imply the other.
"""
from __future__ import annotations
import json
import re
import time
from io import BytesIO
from pathlib import Path

from . import config

SKINS_DIR = config.MEDIA / "skins"
MANIFEST = config.DATA_DIR / "skins.json"
TIMES = ("dawn", "afternoon", "dusk", "night")
# Human label -> internal key, shown as plain-English ambience names in the dashboard editor.
AMBIENCE_LABELS = {
    "cityTraffic": "City Traffic", "cityRain": "City Rain", "fireplace": "Fireplace", "campfire": "Campfire",
    "snow": "Snow", "summerStorm": "Summer Storm", "fan": "Fan", "forestNight": "Forest Night", "waves": "Waves",
    "ocean": "Ocean", "wind": "Wind", "people": "People", "river": "River", "rainForest": "Rainforest", "birds": "Birds",
}
AMBIENCE_KEYS = tuple(AMBIENCE_LABELS)
VIDEO_EXTS = {".mp4", ".webm"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
PLAYER_ORIGIN = "https://player.hungreegoat.com"

# One-time seed for a brand-new install (or one migrating off the old hardcoded-built-in
# architecture): the six scenes the player originally shipped with, now real, independently
# deletable rows, plus the animation loop the YouTube broadcast has always used, registered
# here so it is finally visible/manageable instead of only discoverable by SSHing in.
# `video` for the first two is an absolute URL (real footage bundled in the player's own
# static build — see apps/player/public/assets/scenes/) so no file is duplicated onto the
# Pi for those; the loop's actual video file IS copied in once (see ensure_seeded) because
# it needs to live under SKINS_DIR to be resolvable as a broadcast source.
_SEED_SKINS = [
    {"id": "study-room", "name": "Study Room", "source": "built-in", "order": 0, "accent": "#f2c14e",
     "video": f"{PLAYER_ORIGIN}/assets/scenes/Day-sunny.mp4", "ambience": {}},
    {"id": "camping-van", "name": "Camping Van", "source": "built-in", "order": 1, "accent": "#ff8a3d",
     "video": f"{PLAYER_ORIGIN}/assets/scenes/truckCampBackground.mp4", "ambience": {"campfire": 30, "forestNight": 15}},
    {"id": "rainforest", "name": "Rainforest", "source": "built-in", "order": 2, "accent": "#38d6e8", "ambience": {"rainForest": 35, "birds": 20}},
    {"id": "beach", "name": "Beach", "source": "built-in", "order": 3, "accent": "#ffb454", "ambience": {"waves": 35}},
    {"id": "cafe", "name": "Cafe", "source": "built-in", "order": 4, "accent": "#7fb0ff", "ambience": {"people": 20}},
    {"id": "riverfront", "name": "Riverfront", "source": "built-in", "order": 5, "accent": "#4f8cff", "ambience": {"river": 30}},
]
_SEED_LOOP_ID = "hungree-goat-loop"


def load() -> dict:
    try:
        d = json.loads(MANIFEST.read_text())
    except Exception:
        d = {"skins": [], "default": None, "updated_at": None}
    d.setdefault("skins", [])
    return d


def save(d: dict) -> None:
    d["updated_at"] = time.time()
    MANIFEST.parent.mkdir(parents=True, exist_ok=True)
    tmp = MANIFEST.with_suffix(".tmp")
    tmp.write_text(json.dumps(d, indent=1))
    tmp.replace(MANIFEST)


def ensure_seeded() -> None:
    """Two independent jobs, both idempotent and safe to run on every startup:

    1. Backfill (always runs, no gate): this migration landed on a manifest that already
       had bare rows for some of the six original scenes — created by the *old*
       architecture whenever an operator so much as disabled one (it only ever stored
       id/name/enabled/order, never video/accent/source). Fill in exactly those missing
       fields from the seed data. Never touches `enabled`, `name`, `description` or
       `order` on an existing row — those already reflect real operator state and must
       not be silently overwritten.
    2. Add-missing-rows (gated by a persisted `seeded` flag, once in this manifest's
       lifetime): on a manifest that has never seen this migration at all, create the six
       scenes and the YouTube loop from scratch. Gated so a genuine operator delete of one
       of them stays deleted across restarts/deploys instead of reappearing."""
    d = load()
    changed = _backfill_seed_fields(d)
    if not d.get("seeded"):
        existing = {s["id"] for s in d["skins"]}
        for seed in _SEED_SKINS:
            if seed["id"] in existing:
                continue
            d["skins"].append({**seed, "created_at": time.time(), "enabled": True, "time_mode": "always",
                                "description": "", "broadcast_eligible": False})
            changed = True
        if _SEED_LOOP_ID not in existing:
            loop_name = _adopt_loop_file()
            d["skins"].append({
                "id": _SEED_LOOP_ID, "name": "HUNGREE Goat Loop", "source": "built-in",
                "description": "The original looping goat animation used on the YouTube broadcast before Broadcast Visuals existed.",
                "order": len(_SEED_SKINS), "created_at": time.time(), "enabled": False, "time_mode": "always",
                "accent": "#f2c14e", "ambience": {}, "video": loop_name, "broadcast_eligible": bool(loop_name),
            })
            changed = True
        d["seeded"] = True
        changed = True
        # First install only: make today's behavior identical to yesterday's — single-visual
        # broadcast mode, pointed at the loop we just adopted.
        from . import broadcast
        bd = broadcast.load()
        if not bd.get("seeded"):
            bd["single_visual"] = _SEED_LOOP_ID
            bd["seeded"] = True
            broadcast.save(bd)
    if changed:
        save(d)


def _backfill_seed_fields(d: dict) -> bool:
    seed_by_id = {s["id"]: s for s in _SEED_SKINS}
    changed = False
    for row in d["skins"]:
        seed = seed_by_id.get(row["id"])
        if not seed:
            continue
        for k in ("video", "image", "accent", "source"):
            if not row.get(k) and seed.get(k):
                row[k] = seed[k]
                changed = True
        if not row.get("ambience") and seed.get("ambience"):
            row["ambience"] = seed["ambience"]
            changed = True
        row.setdefault("broadcast_eligible", False)
    return changed


def _adopt_loop_file() -> str | None:
    """Copy the existing broadcast loop into the managed skins store once, under its own
    name, so it becomes a normal resolvable asset like any uploaded video. Never touches or
    removes the original at config.LOOP_720 — that stays as the absolute-last-resort
    fallback if the registry is ever empty (see broadcast.py)."""
    src = config.LOOP_720 if config.LOOP_720.exists() else (config.LOOP_SOURCE if config.LOOP_SOURCE.exists() else None)
    if not src:
        return None
    SKINS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{_SEED_LOOP_ID}-{src.name}"
    dest = SKINS_DIR / name
    if not dest.exists():
        dest.write_bytes(src.read_bytes())
    return name


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "skin"


def _asset_url(name: str | None) -> str | None:
    if not name:
        return None
    if name.startswith("http://") or name.startswith("https://") or name.startswith("/"):
        return name   # already absolute (external hosting, e.g. the player's own bundled assets)
    return f"/v1/skins/assets/{name}"


def _is_managed(name: str | None) -> bool:
    """True for a bare filename this module owns under SKINS_DIR — the only kind of asset
    reference it is ever safe to delete from disk."""
    return bool(name) and "/" not in name and not name.startswith("http")


def _variants_public(s: dict) -> dict:
    out = {}
    for t, v in (s.get("time_variants") or {}).items():
        if t in TIMES and isinstance(v, dict) and (v.get("video") or v.get("image")):
            out[t] = {"video": _asset_url(v.get("video")), "image": _asset_url(v.get("image"))}
    return out


def _public_entry(s: dict, default_id: str | None) -> dict:
    return {
        "id": s["id"], "name": s["name"], "enabled": bool(s.get("enabled", True)), "order": s.get("order", 0),
        "accent": s.get("accent") or None, "description": s.get("description") or "",
        "time_mode": "variants" if s.get("time_mode") == "variants" else "always",
        "video": _asset_url(s.get("video")), "image": _asset_url(s.get("image")),
        "thumbnail": _asset_url(s.get("thumbnail")) or _asset_url(s.get("image")),
        "time_variants": _variants_public(s), "ambience": s.get("ambience") or {},
        "default": default_id == s["id"], "source": s.get("source") or "custom",
        "broadcast_eligible": bool(s.get("broadcast_eligible")),
    }


def public_list(include_disabled: bool = False) -> list[dict]:
    """The authoritative inventory, sorted by operator order: this is exactly what the
    public player and the Control dashboard both read — there is no second, hidden list,
    and nothing here is exempt from the enabled filter, including former built-ins."""
    d = load()
    out = [_public_entry(s, d.get("default")) for s in d["skins"]]
    out.sort(key=lambda x: (x["order"], x["name"]))
    if not include_disabled:
        out = [s for s in out if s["enabled"]]
    return out


def get(skin_id: str) -> dict | None:
    return next((s for s in load()["skins"] if s["id"] == skin_id), None)


def upsert(data: dict, skin_id: str | None = None) -> dict:
    d = load()
    if skin_id:
        cur = next((s for s in d["skins"] if s["id"] == skin_id), None)
        if cur is None:
            raise KeyError(skin_id)
    else:
        base = slug(data.get("name", "skin")); sid = base; n = 2
        while any(s["id"] == sid for s in d["skins"]):
            sid = f"{base}-{n}"; n += 1
        cur = {"id": sid, "created_at": time.time(), "enabled": True, "source": "custom",
               "order": len(d["skins"])}
        d["skins"].append(cur)
    for k in ("name", "description", "enabled", "order", "accent", "ambience", "video", "image", "thumbnail",
              "time_mode", "time_variants", "broadcast_eligible"):
        if k in data and data[k] is not None:
            cur[k] = data[k]
    if cur.get("time_mode") not in ("always", "variants"):
        cur["time_mode"] = "always"
    if isinstance(cur.get("ambience"), dict):
        cur["ambience"] = {k: max(0, min(100, int(v))) for k, v in cur["ambience"].items() if k in AMBIENCE_KEYS}
    if isinstance(cur.get("time_variants"), dict):
        cur["time_variants"] = {t: v for t, v in cur["time_variants"].items() if t in TIMES and isinstance(v, dict)}
    if cur.get("broadcast_eligible") and not _is_managed(cur.get("video")):
        cur["broadcast_eligible"] = False   # can't broadcast a video this box can't read as a local file
    save(d)
    return cur


def delete(skin_id: str) -> None:
    """Unconditional, permanent removal — used to be special-cased for the six built-ins
    (a delete just reset them); it no longer is. Any managed asset file exclusively owned
    by this row is removed too; external/absolute references (the two built-ins pointing at
    the player's own bundled footage) are left alone since this module doesn't own them."""
    d = load()
    s = next((x for x in d["skins"] if x["id"] == skin_id), None)
    if not s:
        raise KeyError(skin_id)
    for k in ("video", "image", "thumbnail"):
        name = s.get(k)
        if _is_managed(name):
            try:
                (SKINS_DIR / name).unlink(missing_ok=True)
            except OSError:
                pass
    for v in (s.get("time_variants") or {}).values():
        for k in ("video", "image"):
            name = isinstance(v, dict) and v.get(k)
            if _is_managed(name):
                try:
                    (SKINS_DIR / name).unlink(missing_ok=True)
                except OSError:
                    pass
    d["skins"] = [x for x in d["skins"] if x["id"] != skin_id]
    if d.get("default") == skin_id:
        d["default"] = None
    save(d)


def set_default(skin_id: str | None) -> None:
    d = load()
    d["default"] = skin_id
    save(d)


def reorder(ids: list[str]) -> None:
    d = load()
    by_id = {s["id"]: s for s in d["skins"]}
    for n, sid in enumerate(ids):
        row = by_id.get(sid)
        if row is None:
            continue
        row["order"] = n
    save(d)


def _validate_image_bytes(data: bytes) -> None:
    """Real content sniffing, not just a trusted file extension: open it, decode it, and
    confirm PIL actually recognizes a supported format."""
    from PIL import Image
    try:
        im = Image.open(BytesIO(data))
        im.verify()
        im2 = Image.open(BytesIO(data))
        fmt = (im2.format or "").upper()
    except Exception:
        raise ValueError("that file isn't a readable image")
    if fmt not in ("PNG", "JPEG", "WEBP"):
        raise ValueError(f"unsupported image content ({fmt or 'unknown'}) — use PNG, JPEG or WebP")


def _validate_video_bytes(path: Path) -> None:
    """ffprobe the bytes actually on disk (not the claimed extension) and require a real
    decodable video stream."""
    import subprocess
    try:
        r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                            "stream=codec_type", "-of", "json", str(path)], capture_output=True, text=True, timeout=15)
        j = json.loads(r.stdout or "{}")
    except Exception:
        j = {}
    streams = j.get("streams") or []
    if not streams or streams[0].get("codec_type") != "video":
        raise ValueError("that file isn't a readable video")


def store_asset(skin_id: str, kind: str, filename: str, data: bytes, time_key: str | None = None) -> str:
    ext = Path(filename).suffix.lower()
    if kind == "video":
        if ext not in VIDEO_EXTS:
            raise ValueError("video must be .mp4 or .webm")
    elif kind in ("image", "thumbnail"):
        if ext not in IMAGE_EXTS:
            raise ValueError("image must be jpg/jpeg/png/webp")
        _validate_image_bytes(data)
    SKINS_DIR.mkdir(parents=True, exist_ok=True)
    tag = f"{kind}-{time_key}" if time_key else kind
    name = f"{skin_id}-{tag}-{int(time.time())}{ext}"
    dest = SKINS_DIR / name
    dest.write_bytes(data)
    if kind == "video":
        try:
            _validate_video_bytes(dest)
        except ValueError:
            dest.unlink(missing_ok=True)
            raise
    if kind == "thumbnail" and ext != ".webp":
        try:
            from PIL import Image
            im = Image.open(SKINS_DIR / name).convert("RGB"); im.thumbnail((640, 640))
            wname = name.rsplit(".", 1)[0] + ".webp"; im.save(SKINS_DIR / wname, "WEBP", quality=80)
            (SKINS_DIR / name).unlink(missing_ok=True); name = wname
        except Exception:
            pass
    if time_key:
        d = load()
        row = next((s for s in d["skins"] if s["id"] == skin_id), None)
        if row is None:
            raise KeyError(skin_id)
        old = (row.get("time_variants") or {}).get(time_key, {}).get(kind)
        variants = dict(row.get("time_variants") or {})
        variants[time_key] = {**variants.get(time_key, {}), kind: name}
        row["time_variants"] = variants
        row["time_mode"] = "variants"
        save(d)
        if old and old != name and _is_managed(old):
            (SKINS_DIR / old).unlink(missing_ok=True)
    else:
        cur = next((s for s in load()["skins"] if s["id"] == skin_id), None)
        if cur is None:
            (SKINS_DIR / name).unlink(missing_ok=True)
            raise KeyError(skin_id)
        other_key = "image" if kind == "video" else "video" if kind == "image" else None
        # A new video/image replaces the previous main visual outright (the two are mutually
        # exclusive), and any replaced file — main visual or thumbnail — must not linger as an
        # orphan on disk once nothing in the manifest points to it.
        stale = [f for f in (cur.get(kind), cur.get(other_key) if other_key else None) if f and f != name and _is_managed(f)]
        upsert({kind: name}, skin_id)
        if other_key and cur.get(other_key):
            d = load()
            row = next((s for s in d["skins"] if s["id"] == skin_id), None)
            if row is not None:
                row[other_key] = None
                save(d)
        for f in stale:
            (SKINS_DIR / f).unlink(missing_ok=True)
    return name


def probe_asset(name: str) -> dict:
    """ffprobe/PIL metadata for the skin editor's live preview (dims, duration, size,
    format, and whether it meets the recommended specs)."""
    p = SKINS_DIR / name
    if not p.is_file():
        raise KeyError(name)
    ext = p.suffix.lower()
    info: dict = {"filename": name, "bytes": p.stat().st_size, "format": ext.lstrip(".")}
    if ext in VIDEO_EXTS:
        import subprocess
        try:
            r = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
                                "stream=width,height,duration,codec_name", "-of", "json", str(p)], capture_output=True, text=True, timeout=15)
            j = json.loads(r.stdout or "{}")
            st = (j.get("streams") or [{}])[0]
            info["width"] = int(st.get("width") or 0) or None
            info["height"] = int(st.get("height") or 0) or None
            info["duration"] = round(float(st["duration"]), 1) if st.get("duration") else None
            info["codec"] = st.get("codec_name")
        except Exception:
            info.update(width=None, height=None, duration=None, codec=None)
        info["meets_recommended"] = bool(
            info.get("width") and info.get("height") and info["bytes"] <= 40 * 1024 * 1024
            and (info.get("duration") or 0) >= 10 and (info.get("duration") or 999) <= 65)
    else:
        try:
            from PIL import Image
            with Image.open(p) as im:
                info["width"], info["height"] = im.size
        except Exception:
            info.update(width=None, height=None)
        info["meets_recommended"] = bool(info.get("width") and info["width"] >= 1920)
    return info


def generate_thumbnail(skin_id: str, source_name: str) -> str:
    """Still-frame (video) or resized copy (image) used as the thumbnail, matching the
    'Generate from visual' action in the skin editor."""
    p = SKINS_DIR / source_name
    if not p.is_file():
        raise KeyError(source_name)
    out_name = f"{skin_id}-thumbnail-{int(time.time())}.webp"
    out = SKINS_DIR / out_name
    if p.suffix.lower() in VIDEO_EXTS:
        import subprocess
        r = subprocess.run(["ffmpeg", "-y", "-v", "error", "-i", str(p), "-frames:v", "1", "-vf", "scale=640:-1", str(out)],
                            capture_output=True, timeout=30)
        if r.returncode != 0 or not out.exists():
            raise RuntimeError("could not extract a still frame from this video")
    else:
        from PIL import Image
        im = Image.open(p).convert("RGB"); im.thumbnail((640, 640)); im.save(out, "WEBP", quality=80)
    old = (get(skin_id) or {}).get("thumbnail")
    upsert({"thumbnail": out_name}, skin_id)
    if old and old != out_name and _is_managed(old):
        (SKINS_DIR / old).unlink(missing_ok=True)
    return out_name
