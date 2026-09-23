"""Canonical project, immutable audio, and versioned workflow records."""

from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKeyConstraint,
    Index,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from studio_api.database import Base
from studio_api.models import utcnow


class Identity:
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class ProjectScope:
    workspace_id: Mapped[UUID] = mapped_column(index=True)
    project_id: Mapped[UUID] = mapped_column(index=True)


def project_scope():
    return ForeignKeyConstraint(
        ["project_id", "workspace_id"], ["projects.id", "projects.workspace_id"]
    )


def song_scope():
    return ForeignKeyConstraint(
        ["song_id", "project_id", "workspace_id"],
        ["songs.id", "songs.project_id", "songs.workspace_id"],
    )


def asset_scope(column: str):
    return ForeignKeyConstraint(
        [column, "project_id", "workspace_id"],
        ["audio_assets.id", "audio_assets.project_id", "audio_assets.workspace_id"],
    )


class Project(Identity, Base):
    __tablename__ = "projects"
    __table_args__ = (
        UniqueConstraint("id", "workspace_id"),
        ForeignKeyConstraint(["workspace_id"], ["workspaces.id"]),
        CheckConstraint("length(trim(name)) > 0", name="project_nonempty_name"),
    )
    workspace_id: Mapped[UUID] = mapped_column(index=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(String(4000), default="")
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class Song(Identity, ProjectScope, Base):
    __tablename__ = "songs"
    __table_args__ = (
        project_scope(),
        UniqueConstraint("id", "project_id", "workspace_id"),
        CheckConstraint("bpm IS NULL OR (bpm >= 30 AND bpm <= 300)", name="song_bpm_range"),
        CheckConstraint("length(trim(title)) > 0", name="song_nonempty_title"),
        CheckConstraint("vocal_mode IN ('instrumental','vocals','auto')", name="song_vocal_mode"),
        CheckConstraint(
            "target_duration_seconds IS NULL OR "
            "(target_duration_seconds >= 3 AND target_duration_seconds <= 600)",
            name="song_target_duration",
        ),
    )
    title: Mapped[str] = mapped_column(String(120))
    brief: Mapped[str] = mapped_column(String(8000), default="")
    notes: Mapped[str] = mapped_column(String(16000), default="")
    tags: Mapped[list] = mapped_column(JSONB, default=list)
    bpm: Mapped[int | None]
    musical_key: Mapped[str | None] = mapped_column(String(32))
    style: Mapped[str] = mapped_column(String(1000), default="")
    vocal_mode: Mapped[str] = mapped_column(String(16), default="auto")
    target_duration_seconds: Mapped[int | None]
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


class AudioAsset(Identity, ProjectScope, Base):
    __tablename__ = "audio_assets"
    __table_args__ = (
        project_scope(),
        song_scope(),
        UniqueConstraint("id", "project_id", "workspace_id"),
        CheckConstraint(
            "byte_size > 0 AND duration_seconds > 0 AND sample_rate > 0 AND channels > 0",
            name="asset_positive_media",
        ),
    )
    song_id: Mapped[UUID | None]
    kind: Mapped[str] = mapped_column(String(32))
    original_filename: Mapped[str] = mapped_column(String(180))
    media_type: Mapped[str] = mapped_column(String(80))
    storage_key: Mapped[str] = mapped_column(String(80), unique=True)
    byte_size: Mapped[int] = mapped_column()
    sha256: Mapped[str] = mapped_column(String(64), index=True)
    duration_seconds: Mapped[float]
    sample_rate: Mapped[int]
    channels: Mapped[int]


class AssetLineage(Identity, ProjectScope, Base):
    __tablename__ = "asset_lineage"
    __table_args__ = (
        project_scope(),
        asset_scope("parent_asset_id"),
        asset_scope("child_asset_id"),
        UniqueConstraint("parent_asset_id", "child_asset_id", "operation"),
        CheckConstraint("parent_asset_id <> child_asset_id", name="lineage_not_self"),
    )
    parent_asset_id: Mapped[UUID]
    child_asset_id: Mapped[UUID]
    operation: Mapped[str] = mapped_column(String(64))
    parameters: Mapped[dict] = mapped_column(JSONB, default=dict)


class Job(Identity, ProjectScope, Base):
    __tablename__ = "jobs"
    __table_args__ = (
        project_scope(),
        UniqueConstraint("workspace_id", "idempotency_key", name="uq_jobs_idempotency"),
        song_scope(),
        asset_scope("result_asset_id"),
        UniqueConstraint("id", "project_id", "workspace_id"),
        CheckConstraint(
            "state IN ('pending','queued','running','succeeded','failed','cancelled')",
            name="job_valid_state",
        ),
        CheckConstraint(
            "progress_percent >= 0 AND progress_percent <= 100", name="job_progress_range"
        ),
    )
    attempt: Mapped[int] = mapped_column(default=1, server_default="1")
    cancel_requested: Mapped[bool] = mapped_column(default=False, server_default="false")
    retry_eligible: Mapped[bool] = mapped_column(default=False, server_default="false")
    outcome_unknown: Mapped[bool] = mapped_column(default=False, server_default="false")
    idempotency_key: Mapped[UUID | None]
    song_id: Mapped[UUID | None]
    kind: Mapped[str] = mapped_column(String(64))
    state: Mapped[str] = mapped_column(String(20), default="pending")
    progress_percent: Mapped[int] = mapped_column(default=0)
    current_stage: Mapped[str | None] = mapped_column(String(120))
    error_code: Mapped[str | None] = mapped_column(String(64))
    error_message: Mapped[str | None] = mapped_column(String(500))
    result_asset_id: Mapped[UUID | None]
    parameters: Mapped[dict] = mapped_column(JSONB, default=dict)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class JobEvent(Identity, ProjectScope, Base):
    __tablename__ = "job_events"
    __table_args__ = (
        project_scope(),
        ForeignKeyConstraint(
            ["job_id", "project_id", "workspace_id"],
            ["jobs.id", "jobs.project_id", "jobs.workspace_id"],
        ),
        UniqueConstraint("job_id", "sequence"),
    )
    job_id: Mapped[UUID]
    sequence: Mapped[int]
    state: Mapped[str] = mapped_column(String(20))
    message: Mapped[str] = mapped_column(String(500))


class ProductionPlan(Identity, ProjectScope, Base):
    __tablename__ = "production_plans"
    __table_args__ = (
        project_scope(),
        song_scope(),
        UniqueConstraint("song_id", "version"),
        UniqueConstraint("id", "project_id", "workspace_id"),
        UniqueConstraint("id", "song_id", "project_id", "workspace_id"),
        Index("uq_production_plan_active", "song_id", unique=True, postgresql_where=text("active")),
        CheckConstraint("version > 0", name="plan_version_positive"),
    )
    song_id: Mapped[UUID]
    version: Mapped[int]
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(160))
    plan: Mapped[dict] = mapped_column(JSONB)
    active: Mapped[bool] = mapped_column(default=False)


class Generation(Identity, ProjectScope, Base):
    __tablename__ = "generations"
    __table_args__ = (
        project_scope(),
        song_scope(),
        UniqueConstraint("id", "project_id", "workspace_id"),
        ForeignKeyConstraint(
            ["plan_id", "song_id", "project_id", "workspace_id"],
            [
                "production_plans.id",
                "production_plans.song_id",
                "production_plans.project_id",
                "production_plans.workspace_id",
            ],
        ),
    )
    song_id: Mapped[UUID]
    plan_id: Mapped[UUID | None]
    provider: Mapped[str] = mapped_column(String(32))
    model: Mapped[str] = mapped_column(String(160))
    settings: Mapped[dict] = mapped_column(JSONB, default=dict)


class GenerationVersion(Identity, ProjectScope, Base):
    __tablename__ = "generation_versions"
    __table_args__ = (
        project_scope(),
        asset_scope("asset_id"),
        UniqueConstraint("generation_id", "version"),
        UniqueConstraint("id", "project_id", "workspace_id"),
        ForeignKeyConstraint(
            ["generation_id", "project_id", "workspace_id"],
            ["generations.id", "generations.project_id", "generations.workspace_id"],
        ),
        CheckConstraint("version > 0", name="generation_version_positive"),
    )
    generation_id: Mapped[UUID]
    version: Mapped[int]
    asset_id: Mapped[UUID | None]
    approved: Mapped[bool] = mapped_column(default=False)
    favorite: Mapped[bool] = mapped_column(default=False)
    notes: Mapped[str] = mapped_column(String(8000), default="")


class Arrangement(Identity, ProjectScope, Base):
    __tablename__ = "arrangements"
    __table_args__ = (
        project_scope(),
        asset_scope("asset_id"),
        UniqueConstraint("version_id", "revision"),
        ForeignKeyConstraint(
            ["version_id", "project_id", "workspace_id"],
            [
                "generation_versions.id",
                "generation_versions.project_id",
                "generation_versions.workspace_id",
            ],
        ),
        CheckConstraint("revision > 0", name="arrangement_revision_positive"),
    )
    version_id: Mapped[UUID]
    revision: Mapped[int]
    asset_id: Mapped[UUID | None]
    sections: Mapped[list] = mapped_column(JSONB, default=list)


class AudioAnalysis(Identity, ProjectScope, Base):
    __tablename__ = "audio_analysis"
    __table_args__ = (
        project_scope(),
        asset_scope("asset_id"),
        UniqueConstraint("asset_id", "analyzer_version"),
    )
    asset_id: Mapped[UUID]
    analyzer_version: Mapped[str] = mapped_column(String(64))
    detected_bpm: Mapped[float | None]
    musical_key: Mapped[str | None] = mapped_column(String(32))
    measurements: Mapped[dict] = mapped_column(JSONB, default=dict)


class TempoVersion(Identity, ProjectScope, Base):
    __tablename__ = "tempo_versions"
    __table_args__ = (
        project_scope(),
        asset_scope("source_asset_id"),
        asset_scope("asset_id"),
        UniqueConstraint("asset_id"),
        CheckConstraint("ratio > 0", name="tempo_positive_ratio"),
    )
    source_asset_id: Mapped[UUID]
    asset_id: Mapped[UUID]
    ratio: Mapped[float]
    pitch_semitones: Mapped[float] = mapped_column(default=0)
    preserve_pitch: Mapped[bool] = mapped_column(default=True)


class StemSet(Identity, ProjectScope, Base):
    __tablename__ = "stem_sets"
    __table_args__ = (
        project_scope(),
        asset_scope("source_asset_id"),
        UniqueConstraint("id", "project_id", "workspace_id"),
    )
    source_asset_id: Mapped[UUID]
    engine: Mapped[str] = mapped_column(String(64))
    engine_version: Mapped[str] = mapped_column(String(64))


class Stem(Identity, ProjectScope, Base):
    __tablename__ = "stems"
    __table_args__ = (
        project_scope(),
        asset_scope("asset_id"),
        UniqueConstraint("stem_set_id", "label"),
        ForeignKeyConstraint(
            ["stem_set_id", "project_id", "workspace_id"],
            ["stem_sets.id", "stem_sets.project_id", "stem_sets.workspace_id"],
        ),
    )
    stem_set_id: Mapped[UUID]
    asset_id: Mapped[UUID]
    label: Mapped[str] = mapped_column(String(64))


class MixVersion(Identity, ProjectScope, Base):
    __tablename__ = "mix_versions"
    __table_args__ = (
        project_scope(),
        asset_scope("asset_id"),
        UniqueConstraint("stem_set_id", "version"),
        ForeignKeyConstraint(
            ["stem_set_id", "project_id", "workspace_id"],
            ["stem_sets.id", "stem_sets.project_id", "stem_sets.workspace_id"],
        ),
        CheckConstraint("version > 0", name="mix_version_positive"),
    )
    stem_set_id: Mapped[UUID]
    asset_id: Mapped[UUID]
    version: Mapped[int]
    levels: Mapped[dict] = mapped_column(JSONB)


class Master(Identity, ProjectScope, Base):
    __tablename__ = "masters"
    __table_args__ = (
        project_scope(),
        asset_scope("source_asset_id"),
        asset_scope("reference_asset_id"),
        asset_scope("asset_id"),
        UniqueConstraint("asset_id"),
    )
    source_asset_id: Mapped[UUID]
    reference_asset_id: Mapped[UUID | None]
    asset_id: Mapped[UUID]
    engine: Mapped[str] = mapped_column(String(64))
    settings: Mapped[dict] = mapped_column(JSONB)


class Export(Identity, ProjectScope, Base):
    __tablename__ = "exports"
    __table_args__ = (
        project_scope(),
        asset_scope("source_asset_id"),
        asset_scope("asset_id"),
        UniqueConstraint("asset_id"),
        CheckConstraint("format IN ('wav','mp3','zip')", name="export_valid_format"),
    )
    source_asset_id: Mapped[UUID]
    asset_id: Mapped[UUID]
    format: Mapped[str] = mapped_column(String(16))
    settings: Mapped[dict] = mapped_column(JSONB)
