"""Durable immutable ZIP artifacts for stem-set exports."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0008_stem_packages"
down_revision = "0007_review_rejection"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "stem_packages",
        sa.Column("stem_set_id", sa.Uuid(), nullable=False),
        sa.Column("job_id", sa.Uuid(), nullable=False),
        sa.Column("storage_key", sa.String(length=80), nullable=False),
        sa.Column("byte_size", sa.Integer(), nullable=False),
        sa.Column("sha256", sa.String(length=64), nullable=False),
        sa.Column("manifest", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), nullable=False),
        sa.Column("project_id", sa.Uuid(), nullable=False),
        sa.CheckConstraint(
            "byte_size > 0 AND byte_size <= 104857600", name="stem_package_size_range"
        ),
        sa.ForeignKeyConstraint(
            ["project_id", "workspace_id"], ["projects.id", "projects.workspace_id"]
        ),
        sa.ForeignKeyConstraint(
            ["stem_set_id", "project_id", "workspace_id"],
            ["stem_sets.id", "stem_sets.project_id", "stem_sets.workspace_id"],
        ),
        sa.ForeignKeyConstraint(["job_id"], ["jobs.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("job_id"),
        sa.UniqueConstraint("storage_key"),
    )
    op.create_index(op.f("ix_stem_packages_project_id"), "stem_packages", ["project_id"])
    op.create_index(op.f("ix_stem_packages_workspace_id"), "stem_packages", ["workspace_id"])
    op.create_index(op.f("ix_stem_packages_sha256"), "stem_packages", ["sha256"])


def downgrade() -> None:
    op.drop_index(op.f("ix_stem_packages_sha256"), table_name="stem_packages")
    op.drop_index(op.f("ix_stem_packages_workspace_id"), table_name="stem_packages")
    op.drop_index(op.f("ix_stem_packages_project_id"), table_name="stem_packages")
    op.drop_table("stem_packages")
