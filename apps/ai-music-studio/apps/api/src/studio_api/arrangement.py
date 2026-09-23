"""Bounded, provider-neutral arrangement revision contracts."""

from typing import Literal

from pydantic import Field, field_validator

from studio_api.schemas import StrictModel


class ArrangementSection(StrictModel):
    kind: Literal["intro", "verse", "chorus", "bridge", "outro"]
    name: str = Field(min_length=1, max_length=80)
    duration_seconds: int = Field(ge=3, le=600)
    energy: int = Field(ge=0, le=100)
    instrumentation: list[str] = Field(default_factory=list, max_length=16)
    production_notes: str = Field(default="", max_length=2000)
    vocal_instructions: str = Field(default="", max_length=2000)

    @field_validator("name")
    @classmethod
    def nonblank_name(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Section name cannot be blank")
        return value.strip()

    @field_validator("instrumentation")
    @classmethod
    def bounded_instruments(cls, value: list[str]) -> list[str]:
        if any(not item.strip() or len(item) > 80 for item in value):
            raise ValueError("Each instrument must be 1–80 characters")
        return [item.strip() for item in value]


class CreateArrangementRevision(StrictModel):
    base_revision: int = Field(ge=0)
    sections: list[ArrangementSection] = Field(min_length=1, max_length=32)

    @field_validator("sections")
    @classmethod
    def bounded_timeline(cls, value: list[ArrangementSection]) -> list[ArrangementSection]:
        if sum(section.duration_seconds for section in value) > 3600:
            raise ValueError("Arrangement cannot exceed one hour")
        return value
