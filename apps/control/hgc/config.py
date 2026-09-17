"""Central configuration for HUNGREE Goat Control.

Everything lives under ~/hungree-goat on the Pi; media lives on the
HUNGREE-GOAT USB drive. Stations are declared here — this is the two-channel
model (Lo-Fi Afrobeats + Afrobeats). Nothing here contains secrets.
"""
from __future__ import annotations
import os
from pathlib import Path

HOME = Path(os.environ.get("HGC_HOME", str(Path.home() / "hungree-goat")))
MEDIA = Path(os.environ.get("HGC_MEDIA", "/media/hungree-goat"))

APP_DIR = HOME / "app"
STATIC_DIR = APP_DIR / "static"
DJ_STUDIO_DIR = APP_DIR / "dj-studio"  # vendored Aurdour + mastering DSP; see apps/dj-studio/NOTICE.md
DATA_DIR = HOME / "data"
RUN_DIR = HOME / "run"
LOG_DIR = HOME / "logs"
SECRETS_DIR = HOME / "secrets"
LIQ_DIR = HOME / "liquidsoap"
BIN_DIR = HOME / "bin"

DB_PATH = DATA_DIR / "hungree-goat.sqlite3"

MUSIC_DIR = MEDIA / "music"
ARTWORK_DIR = MEDIA / "artwork"
# Branded default cover ships with the app (800 px JPEG for overlay/cache use); the
# copy on the media drive is kept in sync so Liquidsoap annotations stay valid.
DEFAULT_ARTWORK = ARTWORK_DIR / "default.jpg"
DEFAULT_ARTWORK_BUNDLED = APP_DIR / "static" / "assets" / "img" / "default-track-art-800.jpg"
ANIMATION_DIR = MEDIA / "animation"
LOOP_SOURCE = ANIMATION_DIR / "hungree-goat-loop.mp4"
LOOP_720 = ANIMATION_DIR / "hungree-goat-loop-720p.mp4"
FALLBACK_DIR = MEDIA / "fallback"
JINGLES_DIR = MEDIA / "jingles"
STATION_IDS_DIR = MEDIA / "station-ids"
PLAYLISTS_DIR = MEDIA / "playlists"
# DJ Studio: finished/raw mixes. Deliberately NOT under MUSIC_DIR/MEDIA/music — the library
# scanner only ever walks each station's music_dir (see catalog.scan_station), so this tree
# is structurally invisible to Library rescans without any extra exclusion logic.
MIXES_DIR = MEDIA / "mixes"
MIXES_RAW_DIR = MIXES_DIR / ".raw"

# Derived artwork cache (square thumbnails/normalised covers) lives on the USB
# drive so it survives reinstalls but never touches the originals.
ARTWORK_CACHE = ARTWORK_DIR / ".cache"

API_HOST = os.environ.get("HGC_HOST", "0.0.0.0")
API_PORT = int(os.environ.get("HGC_PORT", "8090"))

AUDIO_EXTS = {".mp3", ".m4a", ".aac", ".wav", ".flac", ".ogg", ".opus"}
IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}

VIDEO_W, VIDEO_H, VIDEO_FPS = 1280, 720, 30
# Overlay band composited on the bottom of the frame (see overlay.py).
OVERLAY_W, OVERLAY_H, OVERLAY_Y = 1280, 300, VIDEO_H - 300

# Vertical (9:16, mobile/Shorts-style) output — a separate, independently-run pipeline;
# see overlay.render_vertical() and streamer_vertical.py. Never derived by stretching the
# horizontal frame: it is composed fresh from the current artwork at this native size.
VERT_W, VERT_H, VERT_FPS = 720, 1280, 30

STATIONS = {
    "lofi": {
        "id": "lofi",
        "name": "HUNGREE Goat Lo-Fi Afrobeats",
        "short": "Lo-Fi Afrobeats",
        "genre": "Lo-Fi Afrobeats",
        "tags": ["Lo-Fi", "Afrobeats", "Chill", "Instrumental"],
        "music_dir": str(MUSIC_DIR / "lofi-afrobeats"),
        "harbor_port": 8100,       # Liquidsoap -> FFmpeg audio (127.0.0.1 only)
        "live_port": 8105,         # DJ / live input harbor
        "liq_socket": str(RUN_DIR / "liq-lofi.sock"),
        "youtube_secret": str(SECRETS_DIR / "youtube-lofi.env"),
        "video_bitrate_k": 3000,
        "audio_bitrate_k": 192,
    },
    "afrobeats": {
        "id": "afrobeats",
        "name": "HUNGREE Goat Afrobeats",
        "short": "Afrobeats",
        "genre": "Afrobeats",
        "tags": ["Afrobeats", "Afro-Pop", "Dance"],
        "music_dir": str(MUSIC_DIR / "afrobeats"),
        "harbor_port": 8101,
        "live_port": 8106,
        "liq_socket": str(RUN_DIR / "liq-afrobeats.sock"),
        "youtube_secret": str(SECRETS_DIR / "youtube-afrobeats.env"),
        "video_bitrate_k": 3000,
        "audio_bitrate_k": 192,
    },
}
STATION_IDS = list(STATIONS)


def station(sid: str) -> dict:
    if sid not in STATIONS:
        raise KeyError(f"unknown station {sid!r}")
    return STATIONS[sid]


def ensure_dirs() -> None:
    for d in (DATA_DIR, RUN_DIR, LOG_DIR, SECRETS_DIR):
        d.mkdir(parents=True, exist_ok=True)
    try:
        os.chmod(SECRETS_DIR, 0o700)
    except OSError:
        pass
