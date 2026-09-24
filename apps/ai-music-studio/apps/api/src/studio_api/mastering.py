"""Bounded, immutable mastering and audio delivery contracts."""

from typing import Literal
from uuid import UUID

from pydantic import Field

from studio_api.schemas import StrictModel


class CreateMaster(StrictModel):
    idempotency_key: UUID
    reference_asset_id: UUID | None = None
    target_lufs: float = Field(default=-14, ge=-23, le=-8)
    true_peak_dbtp: float = Field(default=-1, ge=-3, le=-0.1)


class MasterInput(StrictModel):
    source_asset_id: UUID
    reference_asset_id: UUID | None = None
    target_lufs: float = Field(ge=-23, le=-8)
    true_peak_dbtp: float = Field(ge=-3, le=-0.1)
    engine: Literal["matchering", "ffmpeg-loudnorm"]


class MasterResult(StrictModel):
    source_asset_id: UUID
    asset_id: UUID


class CreateExport(StrictModel):
    idempotency_key: UUID
    format: Literal["wav", "mp3"]
    bit_depth: Literal[16, 24] = 24
    mp3_bitrate_kbps: Literal[128, 192, 256, 320] = 320


class ExportInput(StrictModel):
    source_asset_id: UUID
    format: Literal["wav", "mp3"]
    bit_depth: Literal[16, 24] = 24
    mp3_bitrate_kbps: Literal[128, 192, 256, 320] = 320


class ExportResult(StrictModel):
    source_asset_id: UUID
    asset_id: UUID
    format: Literal["wav", "mp3"]
