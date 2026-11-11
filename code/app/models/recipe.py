from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class RecipeModel(Base):
    __tablename__ = "recipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    title: Mapped[str] = mapped_column(String(150))
    description: Mapped[str | None] = mapped_column(String(2000), default=None)
    servings: Mapped[int | None] = mapped_column(Integer, default=None)
    prep_time_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    cook_time_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    # Étapes de préparation, une par ligne (texte libre pour l'instant)
    steps: Mapped[str | None] = mapped_column(Text, default=None)
    # Propriétaire de la recette. Vide pour les recettes créées quand les comptes sont
    # désactivés : une fois les comptes activés, elles sont invisibles jusqu'à être rattachées
    # au premier compte (voir la commande create-user).
    owner_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True, default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    # Ingrédients dans l'ordre de saisie. Remplacer la liste supprime les anciens
    # (delete-orphan) ; supprimer la recette supprime ses ingrédients.
    ingredients: Mapped[list["IngredientModel"]] = relationship(
        order_by="IngredientModel.position",
        cascade="all, delete-orphan",
        lazy="selectin",
    )


class IngredientModel(Base):
    __tablename__ = "recipe_ingredients"

    id: Mapped[int] = mapped_column(primary_key=True)
    recipe_id: Mapped[int] = mapped_column(
        ForeignKey("recipes.id", ondelete="CASCADE"), index=True
    )
    # Rang dans la liste (0 = premier)
    position: Mapped[int] = mapped_column(Integer)
    # Nom de l'ingrédient (« farine », « œufs »), indexé pour la recherche par ingrédient
    name: Mapped[str] = mapped_column(String(100), index=True)
    # Quantité facultative (« 250 », « 0,5 ») et unité libre (« g », « c. à soupe »)
    quantity: Mapped[float | None] = mapped_column(Float, default=None)
    unit: Mapped[str | None] = mapped_column(String(30), default=None)
