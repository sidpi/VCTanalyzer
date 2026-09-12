"""team/player identity from vlr.gg

Adds provenance and identity columns so teams/players imported from
vlr.gg keep their real names, country, and role:

- teams.vlr_team_id      — VLR team id (unique per org, indexed)
- players.real_name      — real name (VLR "name"; alias stays in players.name)
- players.country        — country/flag code from VLR (e.g. "Finland", "gb")
- players.vlr_player_id  — VLR player id (unique, indexed)

Revision ID: c3d4e5f6a7b8
Revises: b7c1a2d3e4f5
Create Date: 2026-09-12

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "c3d4e5f6a7b8"
down_revision: Union[str, None] = "b7c1a2d3e4f5"
branch_labels: Union[str, Sequence[str]] | None = None
depends_on: Union[str, Sequence[str]] | None = None


def upgrade() -> None:
    op.add_column(
        "teams",
        sa.Column("vlr_team_id", sa.String(length=40), nullable=True),
    )
    op.create_index("ix_teams_vlr_team_id", "teams", ["vlr_team_id"])
    op.create_index(
        "ix_teams_organization_id", "teams", ["organization_id"]
    )

    op.add_column(
        "players",
        sa.Column("real_name", sa.String(length=120), nullable=False,
                  server_default=""),
    )
    op.add_column(
        "players",
        sa.Column("country", sa.String(length=60), nullable=False,
                  server_default=""),
    )
    op.add_column(
        "players",
        sa.Column("vlr_player_id", sa.String(length=40), nullable=True),
    )
    op.create_index("ix_players_vlr_player_id", "players", ["vlr_player_id"])


def downgrade() -> None:
    op.drop_index("ix_players_vlr_player_id", table_name="players")
    op.drop_column("players", "vlr_player_id")
    op.drop_column("players", "country")
    op.drop_column("players", "real_name")
    op.drop_index("ix_teams_organization_id", table_name="teams")
    op.drop_index("ix_teams_vlr_team_id", table_name="teams")
    op.drop_column("teams", "vlr_team_id")
