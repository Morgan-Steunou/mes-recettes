"""Historique des repas : chaque fois qu'une recette est cuisinée (date, note, commentaire)

Revision ID: 0005
Revises: 0004
Create Date: 2026-11-11
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipe_cookings",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column(
            "recipe_id",
            sa.Integer(),
            sa.ForeignKey(
                "recipes.id", name="fk_recipe_cookings_recipe_id_recipes", ondelete="CASCADE"
            ),
            nullable=False,
        ),
        sa.Column("cooked_on", sa.Date(), nullable=False),
        sa.Column("rating", sa.SmallInteger(), nullable=True),
        sa.Column("comment", sa.String(1000), nullable=True),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.CheckConstraint("rating BETWEEN 1 AND 5", name="ck_recipe_cookings_rating"),
    )
    op.create_index("ix_recipe_cookings_recipe_id", "recipe_cookings", ["recipe_id"])
    op.create_index("ix_recipe_cookings_cooked_on", "recipe_cookings", ["cooked_on"])


def downgrade() -> None:
    op.drop_index("ix_recipe_cookings_cooked_on", table_name="recipe_cookings")
    op.drop_index("ix_recipe_cookings_recipe_id", table_name="recipe_cookings")
    op.drop_table("recipe_cookings")
