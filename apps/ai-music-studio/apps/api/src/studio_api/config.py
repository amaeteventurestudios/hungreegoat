from pathlib import Path
from typing import Literal, Self
from urllib.parse import urlsplit

from pydantic import Field, SecretStr, field_validator, model_validator
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
    worker_token_file: Path | None = None
    windmill_token_file: Path | None = None
    windmill_script_hash_file: Path | None = None
    windmill_url: str | None = None
    windmill_workspace: str = "studio"
    secret_root: Path | None = None
    secret_key_file: Path | None = None
    public_url: str = "http://localhost:3210"
    session_lifetime_seconds: int = Field(default=43200, ge=60, le=604800)
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

    @model_validator(mode="after")
    def validate_origin(self) -> Self:
        origin = urlsplit(self.public_url)
        if (
            origin.scheme not in {"http", "https"}
            or not origin.hostname
            or origin.username
            or origin.password
            or origin.query
            or origin.fragment
            or origin.path not in {"", "/"}
        ):
            raise ValueError("STUDIO_PUBLIC_URL must be a complete HTTP origin")
        if self.env == "production" and origin.scheme != "https":
            raise ValueError("Production requires an HTTPS public origin")
        if (
            self.env == "development"
            and origin.scheme == "http"
            and origin.hostname not in {"localhost", "127.0.0.1", "::1"}
        ):
            raise ValueError("Development HTTP must use a loopback origin")
        self.public_url = self.public_url.rstrip("/")
        return self
