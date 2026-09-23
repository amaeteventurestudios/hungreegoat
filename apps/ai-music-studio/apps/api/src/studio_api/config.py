from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="STUDIO_", extra="ignore", hide_input_in_errors=True
    )

    env: Literal["development", "test", "production"] = "development"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    database_url: SecretStr
    asset_root: Path
    database_connect_timeout: int = Field(default=3, ge=1, le=30)

    @field_validator("database_url")
    @classmethod
    def validate_database(cls, value: SecretStr) -> SecretStr:
        try:
            url = make_url(value.get_secret_value())
            if url.drivername not in {"postgresql", "postgresql+psycopg"}:
                raise ValueError
            if not url.host or not url.database or not url.username:
                raise ValueError
        except (ValueError, ArgumentError):
            # Do not include connection strings or credentials in validation errors.
            raise ValueError("A complete PostgreSQL connection URL is required") from None
        return value

    @field_validator("asset_root")
    @classmethod
    def validate_asset_root(cls, value: Path) -> Path:
        if not value.is_absolute():
            raise ValueError("STUDIO_ASSET_ROOT must be an absolute path")
        return value
