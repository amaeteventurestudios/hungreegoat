"""Media catalog builder: ffprobe validation, tag reading, tolerant artwork matching,
loudness analysis and square artwork cache generation.

Artwork resolution order (never fails a track):
  1. matching external artwork in /srv/ai-node/storage/data/artwork
  2. embedded artwork inside the audio file
  3. /srv/ai-node/storage/data/artwork/default.jpg
"""
from __future__ import annotations
import io
import json
import re
import subprocess
import time
from pathlib import Path

from . import config, db

DEFAULT_ARTIST = "HUNGREE Goat"
STATION_ALBUM = {"lofi": "Lofi Afrobeats", "afrobeats": "Afrobeats"}


def norm_key(s: str) -> str:
    """Tolerant key: lowercase, strip extension, drop everything non-alphanumeric."""
    s = s.lower()
    s = re.sub(r"\.(jpe?g|png|webp|mp3|m4a|aac|wav|flac|ogg|opus)$", "", s)
    return re.sub(r"[^a-z0-9]+", "", s)


def ffprobe(path: Path) -> dict | None:
    try:
        out = subprocess.run(
            ["ffprobe", "-v", "error", "-show_entries",
             "format=duration,bit_rate,format_name:format_tags=title,artist,album,genre:"
             "stream=codec_type,codec_name,sample_rate,channels,bit_rate,width,height,r_frame_rate,disposition",
             "-of", "json", str(path)],
            capture_output=True, text=True, timeout=60)
        if out.returncode != 0:
            return None
        return json.loads(out.stdout)
    except Exception:
        return None


def read_tags(path: Path) -> tuple[dict, bytes | None]:
    """Return (tags, embedded_image_bytes) using mutagen; tolerant of untagged files."""
    tags: dict = {}
    art: bytes | None = None
    try:
        import mutagen
        from mutagen.id3 import ID3
        f = mutagen.File(str(path))
        if f is None:
            return tags, art
        easy = mutagen.File(str(path), easy=True)
        if easy and easy.tags:
            for k in ("title", "artist", "album", "genre"):
                v = easy.tags.get(k)
                if v:
                    tags[k] = str(v[0])
        # embedded artwork
        t = getattr(f, "tags", None)
        if t is not None:
            if isinstance(t, ID3) or hasattr(t, "getall"):
                try:
                    pics = t.getall("APIC")
                    if pics:
                        art = bytes(pics[0].data)
                except Exception:
                    pass
            if art is None and hasattr(f, "pictures") and f.pictures:  # FLAC
                art = bytes(f.pictures[0].data)
            if art is None and "covr" in t:  # MP4
                art = bytes(t["covr"][0])
        if art is None and path.suffix.lower() == ".wav":
            try:
                id3 = ID3(str(path))
                pics = id3.getall("APIC")
                if pics:
                    art = bytes(pics[0].data)
            except Exception:
                pass
    except Exception:
        pass
    return tags, art


def measure_loudness(path: Path) -> float | None:
    """Integrated loudness (LUFS) via ffmpeg ebur128. Returns None on failure."""
    try:
        out = subprocess.run(
            ["ffmpeg", "-nostats", "-hide_banner", "-i", str(path), "-map", "0:a:0",
             "-af", "ebur128=peak=none", "-f", "null", "-"],
            capture_output=True, text=True, timeout=600)
        m = re.findall(r"I:\s+(-?[\d.]+) LUFS", out.stderr)
        return float(m[-1]) if m else None
    except Exception:
        return None


def fuzzy_match(filename: str, art_idx: dict[str, Path], taken: set[str]) -> Path | None:
    """Second pass for covers whose names were shortened by hand, e.g.
    'Lemura - Bright spark.jpg' for 'Lemura - Bright spark of rhythm.wav'.
    Requires the same leading word and a strong similarity; ambiguous → None."""
    import difflib
    stem = Path(filename).stem
    first = re.split(r"[\s\-]+", stem.strip())[0].lower()
    if len(first) < 3:
        return None
    key = norm_key(filename)
    cands = []
    for k, p in art_idx.items():
        if k in taken:
            continue
        cfirst = re.split(r"[\s\-]+", p.stem.strip())[0].lower()
        if cfirst != first:
            continue
        score = difflib.SequenceMatcher(None, key, k).ratio()
        # prefix containment (shortened tagline) counts as strong evidence
        if key.startswith(k) or k.startswith(key):
            score = max(score, 0.9)
        cands.append((score, p))
    cands.sort(key=lambda c: -c[0])
    if not cands or cands[0][0] < 0.62:
        return None
    if len(cands) > 1 and cands[1][0] >= cands[0][0] - 0.05:
        return None  # ambiguous
    return cands[0][1]


def index_external_artwork() -> dict[str, Path]:
    idx: dict[str, Path] = {}
    if not config.ARTWORK_DIR.exists():
        return idx
    for p in config.ARTWORK_DIR.iterdir():
        if p.is_file() and p.suffix.lower() in config.IMAGE_EXTS and p.name != "default.jpg":
            idx.setdefault(norm_key(p.name), p)
    return idx


def make_square_cover(src: Path | bytes, dst: Path, size: int = 800) -> bool:
    """Center-crop to square, resize, save JPEG. Returns True on success."""
    try:
        from PIL import Image, ImageOps
        im = Image.open(io.BytesIO(src) if isinstance(src, bytes) else src)
        im = ImageOps.exif_transpose(im).convert("RGB")
        im = ImageOps.fit(im, (size, size), method=Image.LANCZOS, centering=(0.5, 0.5))
        dst.parent.mkdir(parents=True, exist_ok=True)
        tmp = dst.with_suffix(".tmp.jpg")
        im.save(tmp, "JPEG", quality=90, optimize=True)
        tmp.replace(dst)
        return True
    except Exception:
        return False


def clean_title(stem: str) -> str:
    """'02_Abaamani_FINAL' → 'Abaamani'; '01 - Gokwa' → 'Gokwa'. Non-destructive: files keep their names."""
    t = stem.strip()
    t = re.sub(r"^\s*\d{1,3}\s*[-._)]\s*", "", t)           # leading track number
    t = t.replace("_", " ")
    t = re.sub(r"\s*[\(\[]?(final|master(ed)?|mix|v\d+|wip|draft|edit|render|bounce)[\)\]]?\s*$", "", t, flags=re.I)
    t = re.sub(r"\s{2,}", " ", t).strip(" -_.")
    return t or stem


def split_title(stem: str) -> tuple[str, str | None]:
    """'Abamani - Wrapping oneself in comfort' -> ('Abamani', 'Wrapping oneself in comfort')."""
    parts = re.split(r"\s*-\s+", stem, maxsplit=1)   # "Name - tagline" and "Name- tagline"
    if len(parts) == 2 and not re.fullmatch(r"\d{1,3}", parts[0].strip()):
        return clean_title(parts[0]), parts[1].strip()
    return clean_title(stem), None


def scan_one(sid: str, path: Path, loudness: bool = True) -> dict | None:
    """Catalog a single file (upload flow). Returns the track row or None if unreadable."""
    scan_station(sid, loudness=False, only=path)
    row = db.q1("SELECT * FROM tracks WHERE path=?", (str(path),))
    if row and loudness and not row["corrupt"] and row["loudness_i"] is None:
        li = measure_loudness(path)
        if li is not None:
            with db.tx() as c:
                c.execute("UPDATE tracks SET loudness_i=?, replaygain_db=? WHERE id=?", (li, round(-18.0 - li, 2), row["id"]))
            row = db.q1("SELECT * FROM tracks WHERE path=?", (str(path),))
    return dict(row) if row else None


def resolve_artwork_for(track_id: int, mode: str = "auto", image: bytes | None = None) -> dict:
    """Artwork management: 'auto' (match external → embedded → default), 'default', 'upload' (bytes)."""
    t = db.q1("SELECT * FROM tracks WHERE id=?", (track_id,))
    if not t:
        raise KeyError("track")
    p = Path(t["path"])
    cache = config.ARTWORK_CACHE / f"{norm_key(p.name)}.jpg"
    config.ARTWORK_CACHE.mkdir(parents=True, exist_ok=True)
    ext = None; src = "default"; resolved = str(config.DEFAULT_ARTWORK)
    if mode == "upload" and image:
        # keep an original next to the covers so it survives cache rebuilds
        orig = config.ARTWORK_DIR / f"{p.stem}.jpg"
        make_square_cover(image, orig, size=1000)
        if make_square_cover(orig, cache):
            ext, src, resolved = str(orig), "external", str(cache)
    elif mode == "auto":
        idx = index_external_artwork()
        cand = idx.get(norm_key(p.name)) or fuzzy_match(p.name, idx, set())
        _, emb = read_tags(p)
        if cand and make_square_cover(cand, cache):
            ext, src, resolved = str(cand), "external", str(cache)
        elif emb and make_square_cover(emb, cache):
            src, resolved = "embedded", str(cache)
    with db.tx() as c:
        c.execute("UPDATE tracks SET external_artwork=?, resolved_artwork=?, artwork_source=?, updated_at=? WHERE id=?",
                  (ext, resolved, src, time.time(), track_id))
    return {"artwork_source": src, "resolved_artwork": resolved}


def scan_station(sid: str, loudness: bool = False, progress=None, only: Path | None = None) -> dict:
    st = config.station(sid)
    music_dir = Path(st["music_dir"])
    art_idx = index_external_artwork()
    config.ARTWORK_CACHE.mkdir(parents=True, exist_ok=True)
    stats = {"station": sid, "scanned": 0, "added": 0, "updated": 0, "corrupt": 0,
             "external_art": 0, "embedded_art": 0, "default_art": 0, "removed": 0,
             "formats": {}, "codecs": {}, "sample_rates": {}, "bitrates": {}, "total_bytes": 0,
             "total_duration": 0.0, "loudness_measured": 0}
    seen: set[str] = set()
    taken: set[str] = {norm_key(Path(r["external_artwork"]).name) for r in db.q(
        "SELECT external_artwork FROM tracks WHERE station=? AND external_artwork IS NOT NULL", (sid,))}
    files = sorted([p for p in music_dir.rglob("*") if p.is_file() and p.suffix.lower() in config.AUDIO_EXTS
                    and not any(part.startswith(".") for part in p.relative_to(music_dir).parts)]) if music_dir.exists() else []
    if only is not None:
        files = [only]
    for i, p in enumerate(files):
        if progress:
            progress(i + 1, len(files), p.name)
        stats["scanned"] += 1
        seen.add(str(p))
        stt = p.stat()
        existing = db.q1("SELECT * FROM tracks WHERE path=?", (str(p),))
        needs_probe = existing is None or existing["mtime"] != stt.st_mtime or existing["size"] != stt.st_size or existing["corrupt"]
        rec: dict = dict(existing) if existing else {}
        if needs_probe:
            info = ffprobe(p)
            tags, emb = read_tags(p)
            audio = None
            if info:
                for s in info.get("streams", []):
                    if s.get("codec_type") == "audio":
                        audio = s
                        break
            if not info or audio is None:
                rec.update(corrupt=1, error="ffprobe failed or no audio stream")
                stats["corrupt"] += 1
                db.log_event("error", "media", f"Unreadable audio file: {p.name}", sid, str(p))
            else:
                fmt = info.get("format", {})
                ftags = {k.lower(): v for k, v in fmt.get("tags", {}).items()}
                stem_title, tagline = split_title(p.stem)
                title = tags.get("title") or ftags.get("title") or stem_title
                artist = tags.get("artist") or ftags.get("artist") or DEFAULT_ARTIST
                album = tags.get("album") or ftags.get("album") or (tagline or STATION_ALBUM.get(sid, ""))
                genre = tags.get("genre") or ftags.get("genre") or st["genre"]
                rec.update(
                    corrupt=0, error=None, title=title, artist=artist, album=album, genre=genre,
                    duration=float(fmt.get("duration") or 0), codec=audio.get("codec_name"),
                    format=(fmt.get("format_name") or "").split(",")[0],
                    bitrate=int(fmt.get("bit_rate") or audio.get("bit_rate") or 0),
                    sample_rate=int(audio.get("sample_rate") or 0), channels=int(audio.get("channels") or 0),
                    embedded_artwork=1 if emb else 0,
                )
                # artwork resolution
                ext = art_idx.get(norm_key(p.name)) or fuzzy_match(p.name, art_idx, taken)
                if ext:
                    taken.add(norm_key(ext.name))
                cache = config.ARTWORK_CACHE / f"{norm_key(p.name)}.jpg"
                resolved, source = None, None
                if ext and make_square_cover(ext, cache):
                    resolved, source = str(cache), "external"
                elif emb and make_square_cover(emb, cache):
                    resolved, source = str(cache), "embedded"
                if resolved is None:
                    resolved, source = str(config.DEFAULT_ARTWORK), "default"
                    if not config.DEFAULT_ARTWORK.exists():
                        db.log_event("warning", "media", "default.jpg artwork missing", sid)
                rec.update(external_artwork=str(ext) if ext else None, resolved_artwork=resolved, artwork_source=source)
            rec.update(path=str(p), filename=p.name, station=sid, size=stt.st_size, mtime=stt.st_mtime,
                       updated_at=time.time())
            if existing is None:
                rec.setdefault("enabled", 1)
                rec["added_at"] = time.time()
                stats["added"] += 1
            else:
                stats["updated"] += 1
            cols = [k for k in rec if k != "id"]
            with db.tx() as c:
                c.execute(f"INSERT INTO tracks({','.join(cols)}) VALUES({','.join('?'*len(cols))}) "
                          f"ON CONFLICT(path) DO UPDATE SET " + ",".join(f"{k}=excluded.{k}" for k in cols),
                          tuple(rec[k] for k in cols))
            rec = dict(db.q1("SELECT * FROM tracks WHERE path=?", (str(p),)))
        if loudness and not rec.get("corrupt") and rec.get("loudness_i") is None:
            li = measure_loudness(p)
            if li is not None:
                gain = round(-18.0 - li, 2)   # target -18 LUFS (EBU R128-ish streaming reference)
                with db.tx() as c:
                    c.execute("UPDATE tracks SET loudness_i=?, replaygain_db=? WHERE id=?", (li, gain, rec["id"]))
                stats["loudness_measured"] += 1
        if rec.get("corrupt"):
            continue
        stats["total_bytes"] += rec.get("size") or 0
        stats["total_duration"] += rec.get("duration") or 0
        for key, val in (("formats", rec.get("format")), ("codecs", rec.get("codec")),
                         ("sample_rates", rec.get("sample_rate")), ("bitrates", rec.get("bitrate"))):
            stats[key][str(val)] = stats[key].get(str(val), 0) + 1
        src = rec.get("artwork_source")
        if src == "external":
            stats["external_art"] += 1
        elif src == "embedded":
            stats["embedded_art"] += 1
        else:
            stats["default_art"] += 1
    # remove records for files that disappeared
    gone = [] if only is not None else [r["path"] for r in db.q("SELECT path FROM tracks WHERE station=?", (sid,)) if r["path"] not in seen]
    if gone:
        with db.tx() as c:
            for g in gone:
                c.execute("DELETE FROM tracks WHERE path=?", (g,))
        stats["removed"] = len(gone)
    return stats


def probe_video(path: Path) -> dict:
    info = ffprobe(path) or {}
    try:
        exists = path.exists()
    except OSError:
        exists = False
    out = {"path": str(path), "exists": exists}
    if not info:
        return out
    fmt = info.get("format", {})
    out["duration"] = float(fmt.get("duration") or 0)
    out["bitrate"] = int(fmt.get("bit_rate") or 0)
    for s in info.get("streams", []):
        if s.get("codec_type") == "video" and "video_codec" not in out:
            fr = s.get("r_frame_rate", "0/1")
            try:
                n, d = fr.split("/")
                fps = round(float(n) / float(d), 3)
            except Exception:
                fps = None
            out.update(video_codec=s.get("codec_name"), width=s.get("width"), height=s.get("height"), fps=fps)
        elif s.get("codec_type") == "audio":
            out.update(audio_codec=s.get("codec_name"), audio_sample_rate=s.get("sample_rate"),
                       audio_channels=s.get("channels"), audio_bitrate=int(s.get("bit_rate") or 0))
    return out


def ensure_default_playlists(sid: str) -> None:
    """Every station gets its core playlists; the 'all' music playlist tracks the library."""
    st = config.station(sid)
    core = [
        ("all", f"{st['short']} — Full Library", "Every enabled track in the station library", "music", "shuffle"),
        ("jingles", "Jingles", "Short idents inserted between songs", "jingles", "shuffle"),
        ("station-ids", "Station IDs", "HUNGREE Goat station identification", "station_ids", "shuffle"),
        ("fallback", "Chill Fallback Mix", "Backup playlist used when the main source fails", "fallback", "shuffle"),
    ]
    with db.tx() as c:
        for slug, name, desc, kind, mode in core:
            c.execute("INSERT OR IGNORE INTO playlists(station,slug,name,description,kind,mode) VALUES(?,?,?,?,?,?)",
                      (sid, slug, name, desc, kind, mode))
        pl = c.execute("SELECT id FROM playlists WHERE station=? AND slug='all'", (sid,)).fetchone()
        fb = c.execute("SELECT id FROM playlists WHERE station=? AND slug='fallback'", (sid,)).fetchone()
        ids = [r["id"] for r in c.execute("SELECT id FROM tracks WHERE station=? AND corrupt=0 ORDER BY filename", (sid,))]
        for pos, tid in enumerate(ids):
            c.execute("INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)", (pl["id"], tid, pos))
            c.execute("INSERT OR IGNORE INTO playlist_tracks(playlist_id,track_id,position) VALUES(?,?,?)", (fb["id"], tid, pos))
        c.execute("DELETE FROM playlist_tracks WHERE playlist_id=? AND track_id NOT IN (SELECT id FROM tracks WHERE station=?)", (pl["id"], sid))


def write_liquidsoap_playlists(sid: str) -> None:
    """Static M3U files Liquidsoap uses for its *backup* source (independent of the backend)."""
    config.PLAYLISTS_DIR.mkdir(parents=True, exist_ok=True)
    rows = db.q("SELECT t.path FROM tracks t JOIN playlist_tracks pt ON pt.track_id=t.id "
                "JOIN playlists p ON p.id=pt.playlist_id WHERE p.station=? AND p.slug='fallback' AND t.corrupt=0 AND t.enabled=1 "
                "ORDER BY pt.position", (sid,))
    tmp = config.PLAYLISTS_DIR / f"{sid}-fallback.m3u.tmp"
    tmp.write_text("\n".join(r["path"] for r in rows) + ("\n" if rows else ""))
    tmp.replace(config.PLAYLISTS_DIR / f"{sid}-fallback.m3u")
