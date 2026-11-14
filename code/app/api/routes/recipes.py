from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.recipe import Recipe, RecipeCreate, RecipeUpdate
from app.services.recipe_service import (
    CategoryNotFoundError,
    RecipeService,
    get_recipe_service,
)

router = APIRouter()

NOT_FOUND = "Recette introuvable"
# Catégorie inconnue ou d'un autre utilisateur : donnée invalide (422)
CATEGORY_NOT_FOUND = "Catégorie introuvable"


@router.get("", response_model=list[Recipe])
def list_recipes(service: RecipeService = Depends(get_recipe_service)):
    return service.list()


@router.get("/{recipe_id}", response_model=Recipe)
def get_recipe(recipe_id: int, service: RecipeService = Depends(get_recipe_service)):
    recipe = service.get(recipe_id)
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return recipe


@router.post("", response_model=Recipe, status_code=status.HTTP_201_CREATED)
def create_recipe(data: RecipeCreate, service: RecipeService = Depends(get_recipe_service)):
    try:
        return service.create(data)
    except CategoryNotFoundError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, CATEGORY_NOT_FOUND) from None


@router.put("/{recipe_id}", response_model=Recipe)
def update_recipe(
    recipe_id: int, data: RecipeUpdate, service: RecipeService = Depends(get_recipe_service)
):
    try:
        recipe = service.update(recipe_id, data)
    except CategoryNotFoundError:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, CATEGORY_NOT_FOUND) from None
    if recipe is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return recipe


@router.delete("/{recipe_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_recipe(recipe_id: int, service: RecipeService = Depends(get_recipe_service)):
    if not service.delete(recipe_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
