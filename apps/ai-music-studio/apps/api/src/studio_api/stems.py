"""Bounded contracts for four-source separation and immutable mixing."""

from typing import Literal
from uuid import UUID

from studio_api.schemas import StrictModel

LABELS = ("vocals", "drums", "bass", "other")
ENGINE = "demucs"
ENGINE_VERSION = "4.0.1-htdemucs"


class CreateStemSet(StrictModel):
    idempotency_key: UUID


class SeparateInput(StrictModel):
    source_asset_id: UUID
    stem_set_id: UUID
    engine: Literal["demucs"] = ENGINE
    engine_version: Literal["4.0.1-htdemucs"] = ENGINE_VERSION


class StemResult(StrictModel):
    stem_set_id: UUID
    asset_ids: dict[Literal["vocals", "drums", "bass", "other"], UUID]


class CreateMix(StrictModel):
    idempotency_key: UUID
    levels: dict[Literal["vocals", "drums", "bass", "other"], float]


class MixInput(StrictModel):
    stem_set_id: UUID
    levels: dict[Literal["vocals", "drums", "bass", "other"], float]


class MixResult(StrictModel):
    stem_set_id: UUID
    asset_id: UUID
