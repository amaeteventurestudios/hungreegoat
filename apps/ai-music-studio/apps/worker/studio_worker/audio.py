"""Bounded local audio analysis; source objects are immutable and read-only."""

from __future__ import annotations

import json
import math
import re
import stat
import subprocess
import tempfile
import time
from pathlib import Path
from typing import Callable
from uuid import UUID

from studio_worker.runtime import WorkerFailure

OBJECTS = Path("/var/lib/studio/assets/objects")
ANALYZER_VERSION = "librosa-0.11-ffmpeg-v1"


def source_path(key: str) -> Path:
    try:
        if str(UUID(key)) != key:
            raise ValueError
    except (TypeError, ValueError):
        raise WorkerFailure("invalid_audio_source", "Audio source is invalid") from None
    path = OBJECTS / key
    try:
        info = path.lstat()
    except OSError:
        raise WorkerFailure("audio_source_unavailable", "Audio source is unavailable", True) from None
    if not stat.S_ISREG(info.st_mode) or not 0 < info.st_size <= 100 * 1024 * 1024:
        raise WorkerFailure("invalid_audio_source", "Audio source is invalid")
    return path


def run_audio_command(args: list[str], timeout: int) -> subprocess.CompletedProcess[bytes]:
    try:
        result = subprocess.run(
            args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False
        )
    except (OSError, subprocess.TimeoutExpired):
        raise WorkerFailure("audio_engine_unavailable", "Audio engine could not finish", True) from None
    if result.returncode:
        raise WorkerFailure("audio_engine_failed", "Audio engine rejected the source")
    return result


def analyze_audio(source: Path, asset_id: str) -> dict:
    """Measure the full asset, with BPM/key estimated from a bounded 90s excerpt."""
    import librosa  # Heavy DSP modules load only for analysis jobs.
    import numpy as np
    import soundfile as sf

    probe = run_audio_command(
        [
            "ffprobe", "-v", "error", "-show_entries",
            "format=duration:stream=codec_type,sample_rate,channels", "-of", "json", str(source),
        ],
        20,
    )
    try:
        document = json.loads(probe.stdout)
        stream = next(item for item in document["streams"] if item["codec_type"] == "audio")
        duration = float(document["format"]["duration"])
        rate, channels = int(stream["sample_rate"]), int(stream["channels"])
    except (ValueError, KeyError, TypeError, StopIteration):
        raise WorkerFailure("invalid_audio_source", "Audio source metadata is invalid") from None
    if not 0 < duration <= 600:
        raise WorkerFailure("invalid_audio_source", "Audio source duration is unsupported")
    with tempfile.TemporaryDirectory(prefix="studio-analysis-") as directory:
        decoded = Path(directory) / "source.wav"
        run_audio_command(
            ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source),
             "-vn", "-ac", "1", "-ar", "11025", "-c:a", "pcm_s16le", str(decoded)],
            240,
        )
        samples, sample_rate = sf.read(decoded, dtype="float32", always_2d=False)
    if samples.size == 0:
        raise WorkerFailure("invalid_audio_source", "Audio source has no samples")
    peaks = [float(np.max(np.abs(part))) if part.size else 0.0 for part in np.array_split(samples, 256)]
    excerpt = samples[: min(samples.size, sample_rate * 90)]
    bpm = None
    key = None
    if float(np.max(np.abs(excerpt))) > 0.001:
        tempo, beats = librosa.beat.beat_track(y=excerpt, sr=sample_rate, trim=True)
        candidate = float(np.asarray(tempo).reshape(-1)[0])
        if len(beats) >= 4 and math.isfinite(candidate) and 30 <= candidate <= 300:
            bpm = round(candidate, 2)
        chroma = librosa.feature.chroma_stft(y=excerpt, sr=sample_rate)
        if chroma.size:
            vector = np.mean(chroma, axis=1)
            major = np.asarray([6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88])
            minor = np.asarray([6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17])
            names = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"]
            scores = [
                (float(np.corrcoef(vector, np.roll(profile, index))[0, 1]), names[index], mode)
                for profile, mode in ((major, "major"), (minor, "minor"))
                for index in range(12)
            ]
            best = max(scores)
            if math.isfinite(best[0]) and best[0] >= 0.3:
                key = f"{best[1]} {best[2]}"
    loudness = run_audio_command(
        ["ffmpeg", "-nostdin", "-hide_banner", "-i", str(source), "-vn", "-af",
         "ebur128", "-f", "null", "-"],
        240,
    )
    matches = re.findall(rb"I:\s*(-?(?:\d+\.?\d*|inf)) LUFS", loudness.stderr)
    lufs = float(matches[-1]) if matches else None
    if lufs is not None and not math.isfinite(lufs):
        lufs = None
    return {
        "source_asset_id": asset_id,
        "analyzer_version": ANALYZER_VERSION,
        "duration_seconds": duration,
        "sample_rate": rate,
        "channels": channels,
        "detected_bpm": bpm,
        "musical_key": key,
        "loudness_lufs": lufs,
        "peaks": [round(min(1.0, max(0.0, value)), 4) for value in peaks],
    }


def render_tempo(source: Path, inputs: dict, check_cancelled: Callable[[], None]) -> bytes:
    """Render a new FLAC through Rubber Band without touching the source object."""
    ratio = inputs.get("ratio")
    semitones = inputs.get("pitch_semitones")
    transients = inputs.get("transients")
    if (
        type(ratio) not in {int, float}
        or type(semitones) not in {int, float}
        or not math.isfinite(ratio)
        or not math.isfinite(semitones)
        or not 0.5 <= ratio <= 2
        or not -12 <= semitones <= 12
        or transients not in {"crisp", "mixed", "smooth"}
        or type(inputs.get("preserve_pitch")) is not bool
        or type(inputs.get("preserve_formants")) is not bool
    ):
        raise WorkerFailure("invalid_tempo_input", "Tempo inputs are invalid")
    pitch = 2 ** (semitones / 12) * (1 if inputs["preserve_pitch"] else ratio)
    formant = "preserved" if inputs["preserve_formants"] else "shifted"
    filter_value = f"rubberband=tempo={ratio:.8f}:pitch={pitch:.8f}:transients={transients}:formant={formant}"
    with tempfile.TemporaryDirectory(prefix="studio-tempo-") as directory:
        destination = Path(directory) / "tempo.flac"
        args = [
            "ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source),
            "-vn", "-af", filter_value, "-c:a", "flac", "-compression_level", "5", str(destination),
        ]
        try:
            process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        except OSError:
            raise WorkerFailure("audio_engine_unavailable", "Tempo engine is unavailable", True) from None
        try:
            deadline = time.monotonic() + 600
            while process.poll() is None:
                check_cancelled()
                if time.monotonic() > deadline:
                    raise WorkerFailure("audio_engine_timeout", "Tempo rendering took too long", True)
                time.sleep(0.5)
            if process.returncode:
                raise WorkerFailure("audio_engine_failed", "Tempo rendering failed")
            size = destination.stat().st_size
            if not 0 < size <= 100 * 1024 * 1024:
                raise WorkerFailure("invalid_derived_audio", "Derived audio exceeds the supported size")
            return destination.read_bytes()
        finally:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
            if process.stderr:
                process.stderr.close()
