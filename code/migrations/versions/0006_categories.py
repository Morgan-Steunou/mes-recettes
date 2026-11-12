"""Catégories de plats créées par l'utilisateur, et catégorie facultative de chaque recette

Revision ID: 0006
Revises: 0005
Create Date: 2026-11-12
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "categories",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(50), nullable=False),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name="fk_categories_owner_id_users", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_categories_owner_id", "categories", ["owner_id"])

    op.add_column("recipes", sa.Column("category_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_recipes_category_id_categories",
        "recipes",
        "categories",
        ["category_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_recipes_category_id", "recipes", ["category_id"])


def downgrade() -> None:
    op.drop_index("ix_recipes_category_id", table_name="recipes")
    op.drop_constraint("fk_recipes_category_id_categories", "recipes", type_="foreignkey")
    op.drop_column("recipes", "category_id")
    op.drop_index("ix_categories_owner_id", table_name="categories")
    op.drop_table("categories")
