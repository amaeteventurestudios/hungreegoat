"""music generation metadata"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0006_music_generation"
down_revision = "0005_orchestration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("generation_versions", sa.Column("provider_request_id", sa.String(length=200), nullable=True))
    op.add_column(
        "generation_versions",
        sa.Column("metadata", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
    )
    op.alter_column("generation_versions", "metadata", server_default=None)


def downgrade() -> None:
    op.drop_column("generation_versions", "metadata")
    op.drop_column("generation_versions", "provider_request_id")
