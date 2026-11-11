"""Logique métier des recettes, persistées en base de données via SQLAlchemy.

Chaque service est lié à un utilisateur : il ne voit et ne modifie que ses recettes.
Comptes désactivés : owner_id vaut None, le service travaille sur les recettes sans propriétaire
(le premier compte créé les récupère, voir la commande create-user).
"""
from fastapi import Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.recipe import IngredientModel, RecipeModel
from app.models.user import UserModel
from app.schemas.recipe import IngredientIn, Recipe, RecipeCreate, RecipeUpdate


def _ingredient_rows(ingredients: list[IngredientIn]) -> list[IngredientModel]:
    """Lignes d'ingrédients à enregistrer, numérotées dans l'ordre reçu."""
    return [
        IngredientModel(position=i, **ingredient.model_dump())
        for i, ingredient in enumerate(ingredients)
    ]


class RecipeService:
    def __init__(self, db: Session, owner_id: int | None) -> None:
        self.db = db
        self.owner_id = owner_id

    def _get_row(self, recipe_id: int) -> RecipeModel | None:
        # La recette d'un autre utilisateur est traitée comme inexistante (404, pas 403) :
        # on ne révèle pas son existence
        return self.db.scalar(
            select(RecipeModel).where(
                RecipeModel.id == recipe_id, RecipeModel.owner_id == self.owner_id
            )
        )

    def list(self) -> list[Recipe]:
        rows = self.db.scalars(
            select(RecipeModel)
            .where(RecipeModel.owner_id == self.owner_id)
            .order_by(RecipeModel.id)
        )
        return [Recipe.model_validate(row) for row in rows]

    def get(self, recipe_id: int) -> Recipe | None:
        row = self._get_row(recipe_id)
        return Recipe.model_validate(row) if row else None

    def create(self, data: RecipeCreate) -> Recipe:
        row = RecipeModel(
            **data.model_dump(exclude={"ingredients"}),
            ingredients=_ingredient_rows(data.ingredients),
            owner_id=self.owner_id,
        )
        self.db.add(row)
        self.db.commit()
        # Relit les dates calculées par la base (created_at, updated_at)
        self.db.refresh(row)
        return Recipe.model_validate(row)

    def update(self, recipe_id: int, data: RecipeUpdate) -> Recipe | None:
        row = self._get_row(recipe_id)
        if row is None:
            return None
        for field, value in data.model_dump(exclude={"ingredients"}).items():
            setattr(row, field, value)
        # Les anciens ingrédients sont supprimés (delete-orphan), les nouveaux insérés dans l'ordre
        row.ingredients = _ingredient_rows(data.ingredients)
        # Date de modification mise à jour même si seuls les ingrédients ont changé
        row.updated_at = func.now()
        self.db.commit()
        self.db.refresh(row)
        return Recipe.model_validate(row)

    def delete(self, recipe_id: int) -> bool:
        row = self._get_row(recipe_id)
        if row is None:
            return False
        self.db.delete(row)
        self.db.commit()
        return True


def get_recipe_service(
    db: Session = Depends(get_db), user: UserModel | None = Depends(get_current_user)
) -> RecipeService:
    return RecipeService(db, owner_id=user.id if user else None)
