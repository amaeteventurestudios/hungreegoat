from typing import Annotated, Literal

from pydantic import Field, field_validator

from studio_api.schemas import StrictModel

Tag = Annotated[str, Field(min_length=1, max_length=40)]


class ProjectInput(StrictModel):
    name: str = Field(min_length=1, max_length=120)
    description: str = Field(default="", max_length=4000)
    tags: list[Tag] = Field(default_factory=list, max_length=20)

    @field_validator("name")
    @classmethod
    def nonempty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name cannot be blank")
        return value.strip()


class SongInput(StrictModel):
    title: str = Field(min_length=1, max_length=120)
    brief: str = Field(default="", max_length=8000)
    notes: str = Field(default="", max_length=16000)
    tags: list[Tag] = Field(default_factory=list, max_length=20)
    bpm: int | None = Field(default=None, ge=30, le=300)
    musical_key: str | None = Field(default=None, max_length=32)
    style: str = Field(default="", max_length=1000)
    vocal_mode: Literal["instrumental", "vocals", "auto"] = "auto"
    target_duration_seconds: int | None = Field(default=None, ge=3, le=600)

    @field_validator("title")
    @classmethod
    def nonempty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Title cannot be blank")
        return value.strip()
