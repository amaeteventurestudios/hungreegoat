"""Local separation/mixing adapters; input objects remain read-only."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import time
from pathlib import Path
from typing import Callable

from studio_worker.audio import run_audio_command
from studio_worker.runtime import WorkerFailure

LABELS = ("vocals", "drums", "bass", "other")


class StemSeparator:
    engine = "demucs"
    version = "4.0.1-htdemucs"

    def separate(self, source: Path, check_cancelled: Callable[[], None]) -> dict[str, bytes]:
        with tempfile.TemporaryDirectory(prefix="studio-stems-") as directory:
            root = Path(directory)
            decoded = root / "input.wav"
            run_audio_command(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(source), "-vn", "-ac", "2", "-ar", "44100", "-c:a", "pcm_s16le", str(decoded)], 240)
            # Demucs' CLI uses a fixed four-source model. Bounded segments keep CPU
            # memory predictable, and model weights live in the worker cache.
            args = ["python", "-m", "demucs", "-n", "htdemucs", "-d", "cpu", "--segment", "7", "--overlap", "0.1", "--shifts", "0", "--clip-mode", "clamp", "-o", str(root), str(decoded)]
            with (root / "engine.log").open("wb") as log:
                try:
                    process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log)
                except OSError:
                    raise WorkerFailure("stem_engine_unavailable", "Stem separation engine is unavailable", True) from None
                deadline = time.monotonic() + 1800
                try:
                    while process.poll() is None:
                        check_cancelled()
                        if time.monotonic() > deadline:
                            raise WorkerFailure("stem_engine_timeout", "Stem separation timed out", True)
                        time.sleep(1)
                    if process.returncode:
                        # Never return engine diagnostics, paths, or model URLs to clients.
                        errors = (root / "engine.log").read_bytes()[-4096:].lower()
                        retryable = b"http" in errors or b"download" in errors or b"network" in errors
                        raise WorkerFailure("stem_engine_failed", "Stem separation could not process this audio", retryable)
                finally:
                    if process.poll() is None:
                        process.terminate()
                        try:
                            process.wait(timeout=5)
                        except subprocess.TimeoutExpired:
                            process.kill()
                            process.wait(timeout=5)
            outputs: dict[str, bytes] = {}
            for label in LABELS:
                wav = root / "htdemucs" / decoded.stem / f"{label}.wav"
                if not wav.is_file():
                    raise WorkerFailure("stem_engine_failed", "Stem separation did not produce four stems")
                flac = root / f"{label}.flac"
                run_audio_command(["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-i", str(wav), "-c:a", "flac", "-compression_level", "5", str(flac)], 240)
                outputs[label] = flac.read_bytes()
            return outputs


def mix_stems(paths: dict[str, Path], levels: dict[str, float], check_cancelled: Callable[[], None]) -> bytes:
    if set(paths) != set(LABELS) or set(levels) != set(LABELS):
        raise WorkerFailure("invalid_mix_input", "Four stems are required")
    with tempfile.TemporaryDirectory(prefix="studio-mix-") as directory:
        output = Path(directory) / "mix.flac"
        args = ["ffmpeg", "-nostdin", "-hide_banner", "-loglevel", "error", "-filter_threads", "1", "-filter_complex_threads", "1", "-threads", "1"]
        for label in LABELS:
            args.extend(["-i", str(paths[label])])
        filters = ";".join(f"[{index}:a]volume={levels[label]:.6f}[s{index}]" for index, label in enumerate(LABELS))
        filters += ";" + "".join(f"[s{index}]" for index in range(4)) + "amix=inputs=4:duration=longest:normalize=0,alimiter=limit=0.95[out]"
        args.extend(["-filter_complex", filters, "-map", "[out]", "-threads", "1", "-c:a", "flac", "-compression_level", "5", str(output)])
        with (Path(directory) / "ffmpeg.log").open("wb") as log:
            try:
                process = subprocess.Popen(args, stdout=subprocess.DEVNULL, stderr=log)
            except OSError:
                raise WorkerFailure("audio_engine_unavailable", "Mix engine is unavailable", True) from None
            try:
                deadline = time.monotonic() + 300
                while process.poll() is None:
                    check_cancelled()
                    if time.monotonic() > deadline:
                        raise WorkerFailure("audio_engine_timeout", "Mix rendering timed out", True)
                    time.sleep(0.5)
                if process.returncode or not output.is_file():
                    print("Studio mix ffmpeg diagnostic: " + (Path(directory) / "ffmpeg.log").read_text(errors="replace")[-1500:], file=sys.stderr)
                    raise WorkerFailure("audio_engine_failed", "Mix rendering failed")
                return output.read_bytes()
            finally:
                if process.poll() is None:
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
