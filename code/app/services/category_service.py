"""Catégories de plats : chaque utilisateur gère les siennes (comme ses recettes).

Comptes désactivés : owner_id vaut None, comme pour les recettes.
"""
from fastapi import Depends
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.category import CategoryModel
from app.models.recipe import RecipeModel
from app.models.user import UserModel
from app.schemas.category import Category, CategoryIn


class CategoryNameTakenError(Exception):
    """Une autre catégorie de l'utilisateur porte déjà ce nom."""


def _sort_key(name: str) -> str:
    return name.casefold()


class CategoryService:
    def __init__(self, db: Session, owner_id: int | None) -> None:
        self.db = db
        self.owner_id = owner_id

    def _rows(self) -> list[CategoryModel]:
        return list(
            self.db.scalars(select(CategoryModel).where(CategoryModel.owner_id == self.owner_id))
        )

    def get_row(self, category_id: int) -> CategoryModel | None:
        # La catégorie d'un autre utilisateur est traitée comme inexistante
        return self.db.scalar(
            select(CategoryModel).where(
                CategoryModel.id == category_id, CategoryModel.owner_id == self.owner_id
            )
        )

    def _check_name_free(self, name: str, except_id: int | None = None) -> None:
        key = _sort_key(name)
        for row in self._rows():
            if row.id != except_id and _sort_key(row.name) == key:
                raise CategoryNameTakenError

    def _counts(self) -> dict[int, int]:
        query = (
            select(RecipeModel.category_id, func.count(RecipeModel.id))
            .where(RecipeModel.owner_id == self.owner_id, RecipeModel.category_id.is_not(None))
            .group_by(RecipeModel.category_id)
        )
        return dict(self.db.execute(query).all())

    def _to_schema(self, row: CategoryModel, counts: dict[int, int] | None = None) -> Category:
        counts = self._counts() if counts is None else counts
        return Category(id=row.id, name=row.name, recipe_count=counts.get(row.id, 0))

    def list(self) -> list[Category]:
        """Catégories par ordre alphabétique, avec leur nombre de recettes."""
        counts = self._counts()
        rows = sorted(self._rows(), key=lambda r: (_sort_key(r.name), r.id))
        return [self._to_schema(row, counts) for row in rows]

    def create(self, data: CategoryIn) -> Category:
        self._check_name_free(data.name)
        row = CategoryModel(name=data.name, owner_id=self.owner_id)
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._to_schema(row)

    def rename(self, category_id: int, data: CategoryIn) -> Category | None:
        row = self.get_row(category_id)
        if row is None:
            return None
        self._check_name_free(data.name, except_id=row.id)
        row.name = data.name
        self.db.commit()
        return self._to_schema(row)

    def delete(self, category_id: int) -> bool:
        """Supprime la catégorie ; ses recettes sont gardées, sans catégorie."""
        row = self.get_row(category_id)
        if row is None:
            return False
        # Fait explicitement (et pas seulement par ON DELETE SET NULL), pour ne pas dépendre
        # des clés étrangères de la base (désactivées par défaut sous SQLite)
        self.db.execute(
            update(RecipeModel)
            .where(RecipeModel.category_id == row.id)
            .values(category_id=None)
        )
        self.db.delete(row)
        self.db.commit()
        return True


def get_category_service(
    db: Session = Depends(get_db), user: UserModel | None = Depends(get_current_user)
) -> CategoryService:
    return CategoryService(db, owner_id=user.id if user else None)
