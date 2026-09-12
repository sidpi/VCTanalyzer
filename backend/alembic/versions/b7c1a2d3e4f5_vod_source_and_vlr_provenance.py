"""vod source columns and vlr match provenance

Revision ID: b7c1a2d3e4f5
Revises: e9c8f55daefb
Create Date: 2026-09-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "b7c1a2d3e4f5"
down_revision: Union[str, None] = "e9c8f55daefb"
branch_labels: Union[str, Sequence[str]] | None = None
depends_on: Union[str, Sequence[str]] | None = None


def upgrade() -> None:
    op.add_column(
        "vods",
        sa.Column("source", sa.String(length=20), nullable=False,
                  server_default="upload"),
    )
    op.add_column(
        "vods",
        sa.Column("source_url", sa.String(length=500), nullable=True),
    )
    op.add_column(
        "vods",
        sa.Column("source_channel", sa.String(length=120), nullable=True),
    )
    op.add_column(
        "matches",
        sa.Column("vlr_match_id", sa.String(length=40), nullable=True),
    )
    op.create_index(
        "ix_matches_vlr_match_id", "matches", ["vlr_match_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_matches_vlr_match_id", table_name="matches")
    op.drop_column("matches", "vlr_match_id")
    op.drop_column("vods", "source_channel")
    op.drop_column("vods", "source_url")
    op.drop_column("vods", "source")
