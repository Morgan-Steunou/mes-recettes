"""Table recipes, qui remplace l'exemple items

Les items existants sont copiés en recettes (nom -> titre, même description et propriétaire).

Revision ID: 0003
Revises: 0002
Create Date: 2026-11-11
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("title", sa.String(150), nullable=False),
        sa.Column("description", sa.String(2000), nullable=True),
        sa.Column("servings", sa.Integer(), nullable=True),
        sa.Column("prep_time_minutes", sa.Integer(), nullable=True),
        sa.Column("cook_time_minutes", sa.Integer(), nullable=True),
        sa.Column("steps", sa.Text(), nullable=True),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name="fk_recipes_owner_id_users", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
        sa.Column(
            "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_recipes_owner_id", "recipes", ["owner_id"])

    op.execute(
        "INSERT INTO recipes (title, description, owner_id) "
        "SELECT name, description, owner_id FROM items ORDER BY id"
    )
    op.drop_index("ix_items_owner_id", table_name="items")
    op.drop_table("items")


def downgrade() -> None:
    op.create_table(
        "items",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.String(1000), nullable=True),
        sa.Column(
            "owner_id",
            sa.Integer(),
            sa.ForeignKey("users.id", name="fk_items_owner_id_users", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_items_owner_id", "items", ["owner_id"])
    # Les champs propres aux recettes sont perdus ; titre et description sont tronqués
    op.execute(
        "INSERT INTO items (name, description, owner_id) "
        "SELECT substr(title, 1, 100), substr(description, 1, 1000), owner_id "
        "FROM recipes ORDER BY id"
    )
    op.drop_index("ix_recipes_owner_id", table_name="recipes")
    op.drop_table("recipes")
