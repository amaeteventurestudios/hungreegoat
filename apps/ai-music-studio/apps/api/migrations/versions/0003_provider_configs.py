"""Workspace-scoped provider settings; credentials remain outside PostgreSQL."""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0003_provider_configs"
down_revision = "0002_auth_settings"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "provider_configs",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("provider", sa.String(32), nullable=False),
        sa.Column("enabled", sa.Boolean(), nullable=False),
        sa.Column("secret_reference", sa.String(36)),
        sa.Column("masked_secret", sa.String(16)),
        sa.Column("default_model", sa.String(160)),
        sa.Column("nonsecret_options", JSONB(), nullable=False),
        sa.Column("capabilities", JSONB(), nullable=False),
        sa.Column("health_status", sa.String(20), nullable=False),
        sa.Column("last_health_check_at", sa.DateTime(timezone=True)),
        sa.Column("last_successful_health_check_at", sa.DateTime(timezone=True)),
        sa.Column("usage", JSONB(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("workspace_id", "provider"),
    )
    op.create_index("ix_provider_configs_workspace_id", "provider_configs", ["workspace_id"])


def downgrade() -> None:
    op.drop_table("provider_configs")
