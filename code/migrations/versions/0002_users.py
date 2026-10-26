"""Comptes utilisateurs et propriétaire des items

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-19
"""
from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("username", sa.String(50), nullable=False),
        sa.Column("hashed_password", sa.String(255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column(
            "created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()
        ),
    )
    op.create_index("ix_users_username", "users", ["username"], unique=True)

    # Les items existants n'ont pas encore de propriétaire : colonne nullable
    op.add_column("items", sa.Column("owner_id", sa.Integer(), nullable=True))
    op.create_foreign_key(
        "fk_items_owner_id_users", "items", "users", ["owner_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_items_owner_id", "items", ["owner_id"])


def downgrade() -> None:
    op.drop_index("ix_items_owner_id", table_name="items")
    op.drop_constraint("fk_items_owner_id_users", "items", type_="foreignkey")
    op.drop_column("items", "owner_id")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")
