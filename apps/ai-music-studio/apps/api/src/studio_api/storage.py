import hashlib
import json
import math
import os
import re
import subprocess
from pathlib import Path
from typing import BinaryIO, Protocol
from uuid import UUID, uuid4

MAX_UPLOAD = 100 * 1024 * 1024
MAX_MULTIPART = MAX_UPLOAD + 64 * 1024


class StorageError(Exception):
    pass


class InvalidMedia(Exception):
    pass


class UploadTooLarge(Exception):
    pass


class StorageProvider(Protocol):
    def save_upload(self, source: BinaryIO) -> tuple[str, int, str]: ...
    def path_for(self, key: str) -> Path: ...
    def delete_uncommitted(self, key: str) -> None: ...


class LocalStorageProvider:
    def __init__(self, root: Path):
        if not root.is_absolute() or any(p.is_symlink() for p in (root, *root.parents)):
            raise StorageError("Invalid asset storage root")
        self.root = root / "objects"
        self.root.mkdir(parents=True, mode=0o700, exist_ok=True)
        if self.root.is_symlink():
            raise StorageError("Invalid asset storage directory")
        os.chmod(self.root, 0o700)

    def path_for(self, key: str) -> Path:
        try:
            if str(UUID(key)) != key:
                raise ValueError
        except (ValueError, TypeError):
            raise StorageError("Invalid storage key") from None
        path = self.root / key
        if path.is_symlink():
            raise StorageError("Invalid asset object")
        return path

    def save_upload(self, source: BinaryIO) -> tuple[str, int, str]:
        key = str(uuid4())
        path = self.path_for(key)
        temporary = self.root / (".upload-" + str(uuid4()))
        total = 0
        linked = False
        digest = hashlib.sha256()
        try:
            fd = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "wb") as output:
                while chunk := source.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_UPLOAD:
                        raise UploadTooLarge
                    digest.update(chunk)
                    output.write(chunk)
                output.flush()
                os.fsync(output.fileno())
            if total == 0:
                raise InvalidMedia("Audio file is empty")
            # Hard link is atomic and fails rather than replacing an existing asset.
            os.link(temporary, path)
            linked = True
            directory = os.open(self.root, os.O_RDONLY | os.O_DIRECTORY)
            try:
                os.fsync(directory)
            finally:
                os.close(directory)
            return key, total, digest.hexdigest()
        except BaseException:
            if linked:
                path.unlink(missing_ok=True)
            raise
        finally:
            temporary.unlink(missing_ok=True)

    def delete_uncommitted(self, key: str) -> None:
        self.path_for(key).unlink(missing_ok=True)


def safe_filename(name: str | None) -> str:
    name = (name or "audio").replace("\\", "/").rsplit("/", 1)[-1]
    name = re.sub(r"[^A-Za-z0-9._ -]", "_", name).strip(" .")[:160]
    return name or "audio"


def probe_audio(path: Path) -> dict:
    args = [
        "ffprobe",
        "-v",
        "error",
        "-protocol_whitelist",
        "file,pipe",
        "-format_whitelist",
        "wav,mp3,flac,ogg,mov,mp4,m4a,3gp,3g2,mj2,aac,aiff",
        "-probesize",
        "5000000",
        "-analyzeduration",
        "5000000",
        "-show_entries",
        "format=format_name,duration:stream=codec_type,codec_name,sample_rate,channels,duration",
        "-of",
        "json",
        str(path),
    ]
    try:
        result = subprocess.run(
            args, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, timeout=10, check=False
        )
    except FileNotFoundError:
        raise StorageError("Audio validation is unavailable") from None
    except subprocess.TimeoutExpired:
        raise InvalidMedia("Audio validation timed out") from None
    if result.returncode or len(result.stdout) > 65536:
        raise InvalidMedia("File is not supported audio")
    try:
        data = json.loads(result.stdout)
        streams = data["streams"]
        if not streams or len(streams) != 1 or streams[0].get("codec_type") != "audio":
            raise ValueError
        stream = streams[0]
        duration = float(data["format"].get("duration", stream.get("duration", 0)))
        rate, channels = int(stream["sample_rate"]), int(stream["channels"])
        if (
            not math.isfinite(duration)
            or not 0 < duration <= 3600
            or not 8000 <= rate <= 192000
            or not 1 <= channels <= 8
        ):
            raise ValueError
        formats = set(data["format"]["format_name"].split(","))
        mime = next(
            (
                mime
                for fmt, mime in [
                    ("wav", "audio/wav"),
                    ("mp3", "audio/mpeg"),
                    ("flac", "audio/flac"),
                    ("ogg", "audio/ogg"),
                    ("mov", "audio/mp4"),
                    ("aac", "audio/aac"),
                    ("aiff", "audio/aiff"),
                ]
                if fmt in formats
            ),
            None,
        )
        if mime is None:
            raise ValueError
        return {
            "duration_seconds": duration,
            "sample_rate": rate,
            "channels": channels,
            "media_type": mime,
        }
    except (ValueError, KeyError, TypeError):
        raise InvalidMedia(
            "Audio must contain one supported stream, up to one hour and eight channels"
        ) from None
