"""Player skins: the built-in scenes the player ships with, plus operator-managed
custom scenes for the public player.

Manifest: data/skins.json (backed up with the data dir). Assets (video/image/thumbnail)
live on the media drive under /media/hungree-goat/skins/ and are served publicly via
/v1/skins/assets/<file>. This manifest is the single authoritative source the dashboard
and the public player both read: `/api/skins` (operator) and `/v1/skins` (public) return
the same merged built-in + custom inventory, so what Control shows is exactly what
player.hungreegoat.com offers.

A skin is a VISUAL SCENE (Study Room, Camping Van, ...). Time of day (Dawn / Afternoon /
Dusk / Night) is a separate, independent treatment the player applies to whichever skin is
selected — it must never itself switch the scene. By default a skin uses the same asset at
every time of day ("time_mode": "always"); an operator can optionally attach per-time
variant assets ("time_mode": "variants") without changing which skin is active.
"""
from __future__ import annotations
import json
import re
import time
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

# The six scenes that ship inside the player itself (no assets to store here — the player
# bundles them). The dashboard manages their enabled/order/default/accent/ambience state,
# and an operator can attach a custom visual to the same id to override the built-in art
# (shown to the operator as OVERRIDDEN).
BUILT_IN = [
    {"id": "study-room", "name": "Study Room"},
    {"id": "camping-van", "name": "Camping Van"},
    {"id": "rainforest", "name": "Rainforest"},
    {"id": "beach", "name": "Beach"},
    {"id": "cafe", "name": "Cafe"},
    {"id": "riverfront", "name": "Riverfront"},
]
BUILT_IN_IDS = {b["id"] for b in BUILT_IN}


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


def slug(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")[:40] or "skin"


def _asset_url(name: str | None) -> str | None:
    return f"/v1/skins/assets/{name}" if name else None


def _variants_public(s: dict) -> dict:
    out = {}
    for t, v in (s.get("time_variants") or {}).items():
        if t in TIMES and isinstance(v, dict) and (v.get("video") or v.get("image")):
            out[t] = {"video": _asset_url(v.get("video")), "image": _asset_url(v.get("image"))}
    return out


def _public_entry(s: dict, default_id: str | None, order: int, source: str, overridden: bool = False) -> dict:
    return {
        "id": s["id"], "name": s["name"], "enabled": bool(s.get("enabled", True)), "order": s.get("order", order),
        "accent": s.get("accent") or None, "description": s.get("description") or "",
        "time_mode": "variants" if s.get("time_mode") == "variants" else "always",
        "video": _asset_url(s.get("video")), "image": _asset_url(s.get("image")),
        "thumbnail": _asset_url(s.get("thumbnail")) or _asset_url(s.get("image")),
        "time_variants": _variants_public(s), "ambience": s.get("ambience") or {},
        "default": default_id == s["id"], "source": source, "overridden": overridden,
    }


def public_list(include_disabled: bool = False) -> list[dict]:
    """Merged, authoritative inventory: the six built-in scenes (using the dashboard's
    enabled/order/default/accent/ambience state, and any operator-uploaded visual override)
    followed by fully custom operator skins. This is exactly what the public player and the
    Control dashboard both read — there is no second, hidden list."""
    d = load()
    by_id = {s["id"]: s for s in d["skins"]}
    out = []
    for i, b in enumerate(BUILT_IN):
        row = by_id.get(b["id"])
        merged = {"id": b["id"], "name": (row or {}).get("name") or b["name"], "order": i, **({} if not row else row)}
        merged["id"] = b["id"]   # never let a stored row rename the built-in's id
        overridden = bool(row and (row.get("video") or row.get("image")))
        out.append(_public_entry(merged, d.get("default"), i, "built-in", overridden))
    for i, s in enumerate(d["skins"]):
        if s["id"] in BUILT_IN_IDS:
            continue
        out.append(_public_entry(s, d.get("default"), len(BUILT_IN) + i, "custom"))
    out.sort(key=lambda x: (x["order"], x["name"]))
    if not include_disabled:
        out = [s for s in out if s["enabled"]]
    return out


def upsert(data: dict, skin_id: str | None = None) -> dict:
    d = load()
    if skin_id:
        cur = next((s for s in d["skins"] if s["id"] == skin_id), None)
        if cur is None:
            if skin_id in BUILT_IN_IDS:
                # first time this built-in's state/override is being saved
                cur = {"id": skin_id, "created_at": time.time(), "enabled": True}
                d["skins"].append(cur)
            else:
                raise KeyError(skin_id)
    else:
        base = slug(data.get("name", "skin")); sid = base; n = 2
        while sid in BUILT_IN_IDS or any(s["id"] == sid for s in d["skins"]):
            sid = f"{base}-{n}"; n += 1
        cur = {"id": sid, "created_at": time.time(), "enabled": True, "order": len(BUILT_IN) + len(d["skins"])}
        d["skins"].append(cur)
    for k in ("name", "description", "enabled", "order", "accent", "ambience", "video", "image", "thumbnail",
              "time_mode", "time_variants"):
        if k in data and data[k] is not None:
            cur[k] = data[k]
    if cur.get("time_mode") not in ("always", "variants"):
        cur["time_mode"] = "always"
    if isinstance(cur.get("ambience"), dict):
        cur["ambience"] = {k: max(0, min(100, int(v))) for k, v in cur["ambience"].items() if k in AMBIENCE_KEYS}
    if isinstance(cur.get("time_variants"), dict):
        cur["time_variants"] = {t: v for t, v in cur["time_variants"].items() if t in TIMES and isinstance(v, dict)}
    save(d)
    return cur


def delete(skin_id: str) -> None:
    d = load()
    s = next((x for x in d["skins"] if x["id"] == skin_id), None)
    if not s:
        raise KeyError(skin_id)
    for k in ("video", "image", "thumbnail"):
        if s.get(k):
            try:
                (SKINS_DIR / s[k]).unlink(missing_ok=True)
            except OSError:
                pass
    for v in (s.get("time_variants") or {}).values():
        for k in ("video", "image"):
            if isinstance(v, dict) and v.get(k):
                try:
                    (SKINS_DIR / v[k]).unlink(missing_ok=True)
                except OSError:
                    pass
    d["skins"] = [x for x in d["skins"] if x["id"] != skin_id]
    if d.get("default") == skin_id:
        d["default"] = None
    save(d)
    # a built-in never disappears from the inventory — deleting its manifest row just
    # resets it back to plain built-in defaults (enabled, no override, no ambience)


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
            if sid not in BUILT_IN_IDS:
                continue
            row = {"id": sid, "created_at": time.time(), "enabled": True}
            d["skins"].append(row); by_id[sid] = row
        row["order"] = n
    save(d)


def store_asset(skin_id: str, kind: str, filename: str, data: bytes, time_key: str | None = None) -> str:
    ext = Path(filename).suffix.lower()
    if kind == "video" and ext not in VIDEO_EXTS:
        raise ValueError("video must be .mp4 or .webm")
    if kind in ("image", "thumbnail") and ext not in IMAGE_EXTS:
        raise ValueError("image must be jpg/png/webp")
    SKINS_DIR.mkdir(parents=True, exist_ok=True)
    tag = f"{kind}-{time_key}" if time_key else kind
    name = f"{skin_id}-{tag}-{int(time.time())}{ext}"
    (SKINS_DIR / name).write_bytes(data)
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
            if skin_id not in BUILT_IN_IDS:
                raise KeyError(skin_id)
            row = {"id": skin_id, "created_at": time.time(), "enabled": True}
            d["skins"].append(row)
        variants = dict(row.get("time_variants") or {})
        variants[time_key] = {**variants.get(time_key, {}), kind: name}
        row["time_variants"] = variants
        row["time_mode"] = "variants"
        save(d)
    else:
        upsert({kind: name}, skin_id)
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
                                "stream=width,height,duration", "-of", "json", str(p)], capture_output=True, text=True, timeout=15)
            j = json.loads(r.stdout or "{}")
            st = (j.get("streams") or [{}])[0]
            info["width"] = int(st.get("width") or 0) or None
            info["height"] = int(st.get("height") or 0) or None
            info["duration"] = round(float(st["duration"]), 1) if st.get("duration") else None
        except Exception:
            info.update(width=None, height=None, duration=None)
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
    upsert({"thumbnail": out_name}, skin_id)
    return out_name
