"""Contracts for bounded, durable audio analysis and tempo processing."""

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field

from studio_api.schemas import StrictModel

ANALYZER_VERSION = "librosa-0.11-ffmpeg-v1"


class CreateAnalysisInput(StrictModel):
    idempotency_key: UUID


class AudioAnalyzeJobInput(StrictModel):
    source_asset_id: UUID
    analyzer_version: Literal["librosa-0.11-ffmpeg-v1"] = ANALYZER_VERSION


class AudioAnalysisResult(StrictModel):
    source_asset_id: UUID
    analyzer_version: Literal["librosa-0.11-ffmpeg-v1"] = ANALYZER_VERSION
    duration_seconds: float = Field(gt=0, le=3600)
    sample_rate: int = Field(ge=8000, le=192000)
    channels: int = Field(ge=1, le=8)
    detected_bpm: float | None = Field(default=None, ge=30, le=300)
    musical_key: str | None = Field(default=None, max_length=32)
    loudness_lufs: float | None = Field(default=None, ge=-100, le=10)
    peaks: list[Annotated[float, Field(ge=0, le=1, allow_inf_nan=False)]] = Field(
        min_length=1, max_length=512
    )


TempoMode = Literal["time_stretch", "double_time", "half_time", "pitch_tempo"]
TransientMode = Literal["crisp", "mixed", "smooth"]


class CreateTempoInput(StrictModel):
    idempotency_key: UUID
    mode: TempoMode = "time_stretch"
    source_bpm: float = Field(ge=30, le=300, allow_inf_nan=False)
    target_bpm: float = Field(ge=30, le=300, allow_inf_nan=False)
    preserve_pitch: bool = True
    pitch_semitones: float = Field(default=0, ge=-12, le=12, allow_inf_nan=False)
    preserve_formants: bool = True
    transients: TransientMode = "mixed"


class TempoJobInput(StrictModel):
    source_asset_id: UUID
    mode: TempoMode
    source_bpm: float = Field(ge=30, le=300, allow_inf_nan=False)
    target_bpm: float = Field(ge=30, le=300, allow_inf_nan=False)
    ratio: float = Field(ge=0.5, le=2, allow_inf_nan=False)
    preserve_pitch: bool
    pitch_semitones: float = Field(ge=-12, le=12, allow_inf_nan=False)
    preserve_formants: bool
    transients: TransientMode


class TempoResult(StrictModel):
    source_asset_id: UUID
    asset_id: UUID
