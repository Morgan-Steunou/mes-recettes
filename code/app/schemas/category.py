"""Schémas des catégories de plats."""
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

from app.schemas.recipe import _check_single_line

CategoryName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=50),
    AfterValidator(_check_single_line),
]


class CategoryIn(BaseModel):
    """Création ou renommage d'une catégorie."""

    model_config = ConfigDict(extra="forbid")

    name: CategoryName


class Category(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    # Nombre de recettes de la catégorie (calculé)
    recipe_count: int = 0
