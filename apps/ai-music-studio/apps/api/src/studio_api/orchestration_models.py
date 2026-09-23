from datetime import datetime
from uuid import UUID, uuid4

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    String,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from studio_api.database import Base
from studio_api.models import utcnow


class JobAttempt(Base):
    __tablename__ = "job_attempts"
    __table_args__ = (
        UniqueConstraint("job_id", "attempt"),
        CheckConstraint("attempt > 0", name="job_attempt_positive"),
        CheckConstraint(
            "state IN ('pending','queued','running','succeeded','failed','cancelled')",
            name="job_attempt_state",
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    job_id: Mapped[UUID] = mapped_column(ForeignKey("jobs.id"), index=True)
    attempt: Mapped[int]
    execution_id: Mapped[UUID] = mapped_column(unique=True, default=uuid4)
    state: Mapped[str] = mapped_column(String(20), default="pending")
    script_hash: Mapped[str | None] = mapped_column(String(32))
    worker_id: Mapped[str | None] = mapped_column(String(120))
    lease_hash: Mapped[str | None] = mapped_column(String(64))
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    result: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class JobOutbox(Base):
    __tablename__ = "job_outbox"
    __table_args__ = (
        UniqueConstraint("job_id", "attempt", name="uq_job_outbox_attempt"),
        CheckConstraint(
            "state IN ('pending','dispatching','dispatched','closed')", name="job_outbox_state"
        ),
        ForeignKeyConstraint(
            ["job_id", "attempt"], ["job_attempts.job_id", "job_attempts.attempt"]
        ),
    )
    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    job_id: Mapped[UUID] = mapped_column(index=True)
    attempt: Mapped[int]
    next_dispatch_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    state: Mapped[str] = mapped_column(String(20), default="pending")
    lease_owner: Mapped[UUID | None]
    lease_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_error_code: Mapped[str | None] = mapped_column(String(64))
