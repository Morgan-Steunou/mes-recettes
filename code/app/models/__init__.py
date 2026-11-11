"""Modèles ORM (tables de la base de données)."""
from app.models.recipe import RecipeModel
from app.models.user import UserModel

__all__ = ["RecipeModel", "UserModel"]
