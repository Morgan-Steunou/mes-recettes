from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class ItemModel(Base):
    __tablename__ = "items"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(String(1000), default=None)
    # Propriétaire de l'item. Vide pour les items créés quand les comptes sont désactivés :
    # une fois les comptes activés, ils sont invisibles jusqu'à être rattachés au premier
    # compte (voir la commande create-user).
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, default=None
    )
