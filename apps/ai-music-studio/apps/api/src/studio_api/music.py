"""Provider-neutral contracts for durable music generation."""

from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from studio_api.producer import ProductionPlanData
from studio_api.schemas import StrictModel


class CreateGenerationInput(StrictModel):
    idempotency_key: UUID
    provider: Literal["elevenlabs"] | None = None
    model: str | None = Field(default=None, min_length=1, max_length=160)
    version_count: int = Field(default=1, ge=1, le=4)
    duration_seconds: int | None = Field(default=None, ge=3, le=600)
    prompt: str = Field(default="", max_length=4000)


class MusicGenerationJobInput(StrictModel):
    generation_id: UUID
    provider: Literal["elevenlabs"]
    model: str = Field(min_length=1, max_length=160)
    version_count: int = Field(ge=1, le=4)
    duration_seconds: int = Field(ge=3, le=600)
    prompt: str = Field(min_length=1, max_length=4000)
    force_instrumental: bool
    composition_plan: dict | None = None


class MusicGenerationResultItem(StrictModel):
    version: int = Field(ge=1, le=4)
    asset_id: UUID
    provider_request_id: str | None = Field(default=None, max_length=200)


class MusicGenerationResult(StrictModel):
    generation_id: UUID
    outputs: list[MusicGenerationResultItem] = Field(min_length=1, max_length=4)

    @field_validator("outputs")
    @classmethod
    def unique_versions(
        cls, value: list[MusicGenerationResultItem]
    ) -> list[MusicGenerationResultItem]:
        if len({item.version for item in value}) != len(value):
            raise ValueError("Each generated version must be unique")
        return value


class ReviewGenerationVersionInput(StrictModel):
    favorite: bool | None = None
    approved: bool | None = None
    rejected: bool | None = None
    notes: str | None = Field(default=None, max_length=8000)


def music_prompt(song, plan: ProductionPlanData, direction: str) -> str:
    """Produce a bounded vendor prompt from canonical song and plan data."""
    parts = [
        f"Create a finished {plan.style} track for {song.title}.",
        f"Instrumentation: {', '.join(plan.instrumentation)}.",
        f"Structure: {' → '.join(plan.structure)}.",
        f"Energy: {' → '.join(plan.energy_curve)}.",
        f"Arrangement: {plan.arrangement_guidance}",
        f"Production: {plan.production_notes}",
    ]
    if plan.bpm:
        parts.append(f"Tempo: {plan.bpm} BPM.")
    if plan.musical_key:
        parts.append(f"Key center: {plan.musical_key}.")
    if song.vocal_mode == "instrumental":
        parts.append("Instrumental only; do not include vocals or lyrics.")
    elif song.vocal_mode == "vocals":
        parts.append(f"Vocal direction: {plan.vocal_direction}")
    if plan.negative_instructions:
        parts.append("Avoid: " + ", ".join(plan.negative_instructions) + ".")
    if direction.strip():
        parts.append("Additional direction: " + direction.strip())
    return " ".join(parts)[:4000]
