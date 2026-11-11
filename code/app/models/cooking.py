from datetime import date, datetime

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, SmallInteger, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class CookingModel(Base):
    """Une fois où la recette a été cuisinée (historique des repas)."""

    __tablename__ = "recipe_cookings"
    __table_args__ = (
        CheckConstraint("rating BETWEEN 1 AND 5", name="ck_recipe_cookings_rating"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Le propriétaire est celui de la recette : pas de colonne owner_id ici
    recipe_id: Mapped[int] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE"), index=True
    )
    # Jour du repas (sans heure), choisi par l'utilisateur ; aujourd'hui par défaut
    cooked_on: Mapped[date] = mapped_column(Date, index=True)
    # Note de 1 à 5, facultative
    rating: Mapped[int | None] = mapped_column(SmallInteger, default=None)
    comment: Mapped[str | None] = mapped_column(String(1000), default=None)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
