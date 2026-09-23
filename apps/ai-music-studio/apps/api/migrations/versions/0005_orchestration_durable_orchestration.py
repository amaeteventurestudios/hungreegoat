"""durable orchestration"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql
from uuid import uuid4

revision = "0005_orchestration"
down_revision = "0004_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "job_attempts",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("execution_id", sa.Uuid(), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("script_hash", sa.String(length=32), nullable=True),
        sa.Column("worker_id", sa.String(length=120), nullable=True),
        sa.Column("lease_hash", sa.String(length=64), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["job_id"],
            ["jobs.id"],
        ),
        sa.CheckConstraint("attempt > 0", name="job_attempt_positive"),
        sa.CheckConstraint(
            "state IN ('pending','queued','running','succeeded','failed','cancelled')",
            name="job_attempt_state",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("execution_id"),
        sa.UniqueConstraint("job_id", "attempt"),
    )
    op.create_index(op.f("ix_job_attempts_job_id"), "job_attempts", ["job_id"], unique=False)
    op.create_table(
        "job_outbox",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("attempt", sa.Integer(), nullable=False),
        sa.Column("next_dispatch_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("state", sa.String(length=20), nullable=False),
        sa.Column("lease_owner", sa.Uuid(), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error_code", sa.String(length=64), nullable=True),
        sa.ForeignKeyConstraint(
            ["job_id", "attempt"],
            ["job_attempts.job_id", "job_attempts.attempt"],
        ),
        sa.UniqueConstraint("job_id", "attempt", name="uq_job_outbox_attempt"),
        sa.CheckConstraint(
            "state IN ('pending','dispatching','dispatched','closed')", name="job_outbox_state"
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_job_outbox_job_id"), "job_outbox", ["job_id"], unique=False)
    op.add_column("jobs", sa.Column("attempt", sa.Integer(), server_default="1", nullable=False))
    op.add_column(
        "jobs", sa.Column("cancel_requested", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column(
        "jobs", sa.Column("retry_eligible", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column(
        "jobs", sa.Column("outcome_unknown", sa.Boolean(), server_default="false", nullable=False)
    )
    op.add_column("jobs", sa.Column("idempotency_key", sa.Uuid(), nullable=True))
    op.create_unique_constraint("uq_jobs_idempotency", "jobs", ["workspace_id", "idempotency_key"])
    # Phase 05 established the jobs table before attempts/outbox existed. Preserve
    # any pre-upgrade job rather than leaving it with an unusable attempt number.
    connection = op.get_bind()
    existing = connection.execute(sa.text("SELECT id, state, created_at FROM jobs")).mappings()
    for job in existing:
        connection.execute(
            sa.text(
                "INSERT INTO job_attempts "
                "(id, job_id, attempt, execution_id, state, created_at) "
                "VALUES (:id, :job_id, 1, :execution_id, :state, :created_at)"
            ),
            {
                "id": uuid4(), "job_id": job["id"], "execution_id": uuid4(),
                "state": job["state"], "created_at": job["created_at"],
            },
        )
        if job["state"] not in {"succeeded", "failed", "cancelled"}:
            connection.execute(
                sa.text(
                    "INSERT INTO job_outbox (id, job_id, attempt, next_dispatch_at, state) "
                    "VALUES (:id, :job_id, 1, CURRENT_TIMESTAMP, 'pending')"
                ),
                {"id": uuid4(), "job_id": job["id"]},
            )


def downgrade() -> None:
    op.drop_constraint("uq_jobs_idempotency", "jobs", type_="unique")
    op.drop_column("jobs", "idempotency_key")
    op.drop_column("jobs", "outcome_unknown")
    op.drop_column("jobs", "retry_eligible")
    op.drop_column("jobs", "cancel_requested")
    op.drop_column("jobs", "attempt")
    op.drop_index(op.f("ix_job_outbox_job_id"), table_name="job_outbox")
    op.drop_table("job_outbox")
    op.drop_index(op.f("ix_job_attempts_job_id"), table_name="job_attempts")
    op.drop_table("job_attempts")
