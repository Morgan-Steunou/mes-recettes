"""Historique des repas d'une recette : « je l'ai cuisinée » le tel jour, avec une note.

Les entrées appartiennent à une recette : on y accède uniquement à travers une recette de
l'utilisateur courant (une recette d'un autre utilisateur est traitée comme inexistante).
"""
from datetime import date

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.cooking import CookingModel
from app.models.user import UserModel
from app.schemas.cooking import Cooking, CookingCreate
from app.services.recipe_service import RecipeService


class RecipeNotFoundError(Exception):
    pass


class CookingService:
    def __init__(self, db: Session, owner_id: int | None) -> None:
        self.db = db
        self.recipes = RecipeService(db, owner_id)

    def _check_recipe(self, recipe_id: int) -> None:
        if not self.recipes.exists(recipe_id):
            raise RecipeNotFoundError(recipe_id)

    def list(self, recipe_id: int) -> list[Cooking]:
        """Repas de la recette, du plus récent au plus ancien."""
        self._check_recipe(recipe_id)
        rows = self.db.scalars(
            select(CookingModel)
            .where(CookingModel.recipe_id == recipe_id)
            .order_by(CookingModel.cooked_on.desc(), CookingModel.id.desc())
        )
        return [Cooking.model_validate(row) for row in rows]

    def create(self, recipe_id: int, data: CookingCreate) -> Cooking:
        self._check_recipe(recipe_id)
        row = CookingModel(
            recipe_id=recipe_id,
            cooked_on=data.cooked_on or date.today(),
            rating=data.rating,
            comment=data.comment,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return Cooking.model_validate(row)

    def delete(self, recipe_id: int, cooking_id: int) -> bool:
        """Supprime une entrée saisie par erreur. False si elle n'existe pas pour cette recette."""
        self._check_recipe(recipe_id)
        row = self.db.scalar(
            select(CookingModel).where(
                CookingModel.id == cooking_id, CookingModel.recipe_id == recipe_id
            )
        )
        if row is None:
            return False
        self.db.delete(row)
        self.db.commit()
        return True


def get_cooking_service(
    db: Session = Depends(get_db), user: UserModel | None = Depends(get_current_user)
) -> CookingService:
    return CookingService(db, owner_id=user.id if user else None)
