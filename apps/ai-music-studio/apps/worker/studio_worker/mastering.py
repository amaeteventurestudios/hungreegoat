"""Offline mastering and delivery adapters; source objects are read-only."""

from __future__ import annotations

import subprocess
import sys
import tempfile
import time
from collections.abc import Callable
from pathlib import Path
from typing import Protocol

from studio_worker.runtime import WorkerFailure


def _run(
    args: list[str], check_cancelled: Callable[[], None], timeout: int = 600
) -> None:
    try:
        process = subprocess.Popen(
            args, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE
        )
    except OSError:
        raise WorkerFailure(
            "audio_engine_unavailable", "Audio engine is unavailable", True
        ) from None
    try:
        deadline = time.monotonic() + timeout
        while process.poll() is None:
            check_cancelled()
            if time.monotonic() > deadline:
                raise WorkerFailure(
                    "audio_engine_timeout", "Audio processing timed out", True
                )
            time.sleep(0.25)
        if process.returncode:
            raise WorkerFailure("audio_engine_failed", "Audio processing failed")
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


class MasteringProvider(Protocol):
    name: str

    def render(
        self,
        source: Path,
        reference: Path | None,
        directory: Path,
        check_cancelled: Callable[[], None],
    ) -> Path: ...


class MatcheringProvider:
    name = "matchering"

    def render(
        self,
        source: Path,
        reference: Path | None,
        directory: Path,
        check_cancelled: Callable[[], None],
    ) -> Path:
        if reference is None:
            raise WorkerFailure(
                "invalid_master_input", "A reference is required for tonal matching"
            )
        target_wav, reference_wav, result = (
            directory / name for name in ("target.wav", "reference.wav", "matched.wav")
        )
        for original, decoded in ((source, target_wav), (reference, reference_wav)):
            _run(
                [
                    "ffmpeg",
                    "-nostdin",
                    "-hide_banner",
                    "-loglevel",
                    "error",
                    "-i",
                    str(original),
                    "-vn",
                    "-ac",
                    "2",
                    "-ar",
                    "44100",
                    "-c:a",
                    "pcm_s24le",
                    str(decoded),
                ],
                check_cancelled,
            )
        script = "import matchering as mg,sys; mg.process(target=sys.argv[1], reference=sys.argv[2], results=[mg.pcm24(sys.argv[3])])"
        _run(
            [
                sys.executable,
                "-c",
                script,
                str(target_wav),
                str(reference_wav),
                str(result),
            ],
            check_cancelled,
        )
        return result


class LoudnormProvider:
    name = "ffmpeg-loudnorm"

    def render(
        self,
        source: Path,
        reference: Path | None,
        directory: Path,
        check_cancelled: Callable[[], None],
    ) -> Path:
        return source


def _bytes(path: Path) -> bytes:
    try:
        size = path.stat().st_size
        if not 0 < size <= 100 * 1024 * 1024:
            raise WorkerFailure(
                "invalid_derived_audio", "Rendered asset exceeds 100 MiB"
            )
        return path.read_bytes()
    except OSError:
        raise WorkerFailure(
            "audio_engine_failed", "Audio output is unavailable"
        ) from None


def render_master(
    source: Path,
    reference: Path | None,
    inputs: dict,
    check_cancelled: Callable[[], None],
) -> bytes:
    engine = inputs.get("engine")
    provider: MasteringProvider
    if engine == "matchering":
        provider = MatcheringProvider()
    elif engine == "ffmpeg-loudnorm":
        provider = LoudnormProvider()
    else:
        raise WorkerFailure("invalid_master_input", "Mastering engine is invalid")
    target, peak = inputs.get("target_lufs"), inputs.get("true_peak_dbtp")
    if (
        type(target) not in {float, int}
        or type(peak) not in {float, int}
        or not -23 <= target <= -8
        or not -3 <= peak <= -0.1
    ):
        raise WorkerFailure("invalid_master_input", "Mastering targets are invalid")
    with tempfile.TemporaryDirectory(prefix="studio-master-") as temporary:
        directory = Path(temporary)
        intermediate = provider.render(source, reference, directory, check_cancelled)
        output = directory / "master.flac"
        filt = f"loudnorm=I={target}:TP={peak}:LRA=11:linear=false"
        _run(
            [
                "ffmpeg",
                "-nostdin",
                "-hide_banner",
                "-loglevel",
                "error",
                "-i",
                str(intermediate),
                "-vn",
                "-af",
                filt,
                "-ar",
                "48000",
                "-ac",
                "2",
                "-c:a",
                "flac",
                "-compression_level",
                "5",
                str(output),
            ],
            check_cancelled,
        )
        check_cancelled()
        return _bytes(output)


def render_export(
    source: Path, inputs: dict, check_cancelled: Callable[[], None]
) -> bytes:
    fmt = inputs.get("format")
    with tempfile.TemporaryDirectory(prefix="studio-export-") as temporary:
        output = Path(temporary) / ("delivery." + str(fmt))
        prefix = [
            "ffmpeg",
            "-nostdin",
            "-hide_banner",
            "-loglevel",
            "error",
            "-i",
            str(source),
            "-vn",
            "-map_metadata",
            "-1",
        ]
        if fmt == "wav" and inputs.get("bit_depth") in {16, 24}:
            codec = "pcm_s16le" if inputs["bit_depth"] == 16 else "pcm_s24le"
            args = prefix + ["-c:a", codec, str(output)]
        elif fmt == "mp3" and inputs.get("mp3_bitrate_kbps") in {128, 192, 256, 320}:
            args = prefix + [
                "-c:a",
                "libmp3lame",
                "-b:a",
                f"{inputs['mp3_bitrate_kbps']}k",
                "-id3v2_version",
                "0",
                str(output),
            ]
        else:
            raise WorkerFailure(
                "invalid_export_input", "Export format or quality is invalid"
            )
        _run(args, check_cancelled)
        check_cancelled()
        return _bytes(output)
