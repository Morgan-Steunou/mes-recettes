"""Table items (état initial du projet)

Revision ID: 0001
Revises:
Create Date: 2026-10-19
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    # Les bases existantes ont déjà cette table (créée avant Alembic) : on ne la recrée pas
    if sa.inspect(op.get_bind()).has_table("items"):
        return
    op.create_table(
        "items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
    )


def downgrade() -> None:
    op.drop_table("items")
