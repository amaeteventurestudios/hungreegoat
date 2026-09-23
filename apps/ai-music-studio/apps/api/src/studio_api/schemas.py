from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", hide_input_in_errors=True)


class LoginInput(StrictModel):
    email: str = Field(min_length=3, max_length=254)
    password: SecretStr = Field(min_length=1, max_length=128)


class PasswordInput(StrictModel):
    current_password: SecretStr = Field(min_length=1, max_length=128)
    new_password: SecretStr = Field(min_length=12, max_length=128)


class WorkspacePreferences(StrictModel):
    name: str = Field(default="My studio", min_length=1, max_length=120)

    @field_validator("name")
    @classmethod
    def nonempty(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Name cannot be empty")
        return value.strip()


class Appearance(StrictModel):
    theme: Literal["light", "dark", "system"] = "light"


class AudioDefaults(StrictModel):
    sample_rate: Literal[44100, 48000] = 44100
    bpm: int = Field(default=120, ge=30, le=300)


class ExportDefaults(StrictModel):
    format: Literal["wav", "mp3"] = "wav"
    bit_depth: Literal[16, 24] = 24
    mp3_bitrate_kbps: Literal[128, 192, 256, 320] = 320


class ProviderDefaults(StrictModel):
    default_producer: Literal["openai", "openrouter", "anthropic"] | None = None
    default_music: Literal["elevenlabs"] | None = None


class SettingsDocument(StrictModel):
    workspace: WorkspacePreferences = Field(default_factory=WorkspacePreferences)
    appearance: Appearance = Field(default_factory=Appearance)
    audio: AudioDefaults = Field(default_factory=AudioDefaults)
    exports: ExportDefaults = Field(default_factory=ExportDefaults)
    providers: ProviderDefaults = Field(default_factory=ProviderDefaults)
