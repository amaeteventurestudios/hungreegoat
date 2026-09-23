"""Typed, provider-neutral production-plan contracts."""

from typing import Literal
from uuid import UUID

from pydantic import Field, field_validator

from studio_api.schemas import StrictModel


class ProductionPlanData(StrictModel):
    style: str = Field(min_length=1, max_length=500)
    bpm: int | None = Field(default=None, ge=30, le=300)
    musical_key: str | None = Field(default=None, max_length=32)
    instrumentation: list[str] = Field(min_length=1, max_length=16)
    structure: list[str] = Field(min_length=1, max_length=16)
    energy_curve: list[str] = Field(min_length=1, max_length=16)
    vocal_direction: str = Field(min_length=1, max_length=1000)
    arrangement_guidance: str = Field(min_length=1, max_length=4000)
    negative_instructions: list[str] = Field(default_factory=list, max_length=16)
    production_notes: str = Field(min_length=1, max_length=4000)
    provider_request_id: str | None = Field(default=None, max_length=200)

    @field_validator("instrumentation", "structure", "energy_curve", "negative_instructions")
    @classmethod
    def valid_items(cls, value: list[str]) -> list[str]:
        if any(not item.strip() or len(item) > 500 for item in value):
            raise ValueError("Plan items must be non-empty and bounded")
        return [item.strip() for item in value]


class ProducerJobInput(StrictModel):
    provider: Literal["openai", "openrouter", "anthropic"]
    model: str = Field(min_length=1, max_length=160)
    instructions: str = Field(default="", max_length=4000)
    title: str = Field(min_length=1, max_length=120)
    brief: str = Field(default="", max_length=8000)
    notes: str = Field(default="", max_length=16000)
    tags: list[str] = Field(default_factory=list, max_length=20)
    bpm: int | None = Field(default=None, ge=30, le=300)
    musical_key: str | None = Field(default=None, max_length=32)
    style: str = Field(default="", max_length=1000)
    vocal_mode: Literal["instrumental", "vocals", "auto"] = "auto"
    target_duration_seconds: int | None = Field(default=None, ge=3, le=600)
    previous_plan: ProductionPlanData | None = None


class CreatePlanInput(StrictModel):
    idempotency_key: UUID
    instructions: str = Field(default="", max_length=4000)
    provider: Literal["openai", "openrouter", "anthropic"] | None = None
    model: str | None = Field(default=None, max_length=160)


class ProducerResult(StrictModel):
    plan: ProductionPlanData
