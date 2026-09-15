"""Player skins: operator-managed immersive scenes for the public player.

Manifest: data/skins.json (backed up with the data dir). Assets (video/image/thumbnail)
live on the media drive under /media/hungree-goat/skins/ and are served publicly via
/v1/skins/assets/<file>. Bundled default skins ship with the player itself; this manifest
adds/overrides them.
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
AMBIENCE_KEYS = ("cityTraffic", "cityRain", "fireplace", "snow", "summerStorm", "fan", "forestNight", "waves", "wind",
                 "people", "river", "rainForest", "birds", "ocean", "campfire")
VIDEO_EXTS = {".mp4", ".webm"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


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


def public_list(include_disabled: bool = False) -> list[dict]:
    out = []
    d = load()
    for i, s in enumerate(sorted(d["skins"], key=lambda x: (x.get("order", 0), x.get("name", "")))):
        if not include_disabled and not s.get("enabled", True):
            continue
        out.append({
            "id": s["id"], "name": s["name"], "time": s.get("time", "afternoon"), "enabled": bool(s.get("enabled", True)),
            "order": s.get("order", i), "accent": s.get("accent") or None,
            "video": f"/v1/skins/assets/{s['video']}" if s.get("video") else None,
            "image": f"/v1/skins/assets/{s['image']}" if s.get("image") else None,
            "thumbnail": f"/v1/skins/assets/{s['thumbnail']}" if s.get("thumbnail") else (f"/v1/skins/assets/{s['image']}" if s.get("image") else None),
            "ambience": s.get("ambience") or {}, "default": d.get("default") == s["id"], "source": "operator",
        })
    return out


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
        cur = {"id": sid, "created_at": time.time(), "enabled": True, "order": len(d["skins"])}
        d["skins"].append(cur)
    for k in ("name", "time", "enabled", "order", "accent", "ambience", "video", "image", "thumbnail"):
        if k in data and data[k] is not None:
            cur[k] = data[k]
    if cur.get("time") not in TIMES:
        cur["time"] = "afternoon"
    if isinstance(cur.get("ambience"), dict):
        cur["ambience"] = {k: max(0, min(100, int(v))) for k, v in cur["ambience"].items() if k in AMBIENCE_KEYS}
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
    pos = {i: n for n, i in enumerate(ids)}
    for s in d["skins"]:
        s["order"] = pos.get(s["id"], 999)
    save(d)


def store_asset(skin_id: str, kind: str, filename: str, data: bytes) -> str:
    ext = Path(filename).suffix.lower()
    if kind == "video" and ext not in VIDEO_EXTS:
        raise ValueError("video must be .mp4 or .webm")
    if kind in ("image", "thumbnail") and ext not in IMAGE_EXTS:
        raise ValueError("image must be jpg/png/webp")
    SKINS_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{skin_id}-{kind}-{int(time.time())}{ext}"
    (SKINS_DIR / name).write_bytes(data)
    if kind == "thumbnail" and ext != ".webp":
        try:
            from PIL import Image
            im = Image.open(SKINS_DIR / name).convert("RGB"); im.thumbnail((640, 640))
            wname = name.rsplit(".", 1)[0] + ".webp"; im.save(SKINS_DIR / wname, "WEBP", quality=80)
            (SKINS_DIR / name).unlink(missing_ok=True); name = wname
        except Exception:
            pass
    upsert({kind: name}, skin_id)
    return name
