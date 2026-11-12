from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CategoryModel(Base):
    """Catégorie de plats créée par l'utilisateur (« Desserts », « Plats du dimanche »…)."""

    __tablename__ = "categories"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Unique par propriétaire, sans tenir compte des majuscules (vérifié par le service)
    name: Mapped[str] = mapped_column(String(50))
    # Même règle que les recettes : vide quand les comptes sont désactivés
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
