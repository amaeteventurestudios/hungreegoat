"""Add an explicit, mutually exclusive rejection decision to generation review."""

import sqlalchemy as sa
from alembic import op

revision = "0007_review_rejection"
down_revision = "0006_music_generation"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "generation_versions",
        sa.Column("rejected", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.create_check_constraint(
        "generation_review_exclusive", "generation_versions", "NOT (approved AND rejected)"
    )
    op.alter_column("generation_versions", "rejected", server_default=None)


def downgrade() -> None:
    op.drop_constraint("generation_review_exclusive", "generation_versions", type_="check")
    op.drop_column("generation_versions", "rejected")
