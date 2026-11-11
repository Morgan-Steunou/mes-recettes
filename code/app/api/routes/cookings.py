"""Historique des repas d'une recette : /api/recipes/{recipe_id}/cookings"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.cooking import Cooking, CookingCreate
from app.services.cooking_service import CookingService, RecipeNotFoundError, get_cooking_service

router = APIRouter()

RECIPE_NOT_FOUND = "Recette introuvable"
COOKING_NOT_FOUND = "Repas introuvable"


@router.get("", response_model=list[Cooking])
def list_cookings(recipe_id: int, service: CookingService = Depends(get_cooking_service)):
    try:
        return service.list(recipe_id)
    except RecipeNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RECIPE_NOT_FOUND) from None


@router.post("", response_model=Cooking, status_code=status.HTTP_201_CREATED)
def create_cooking(
    recipe_id: int, data: CookingCreate, service: CookingService = Depends(get_cooking_service)
):
    try:
        return service.create(recipe_id, data)
    except RecipeNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RECIPE_NOT_FOUND) from None


@router.delete("/{cooking_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_cooking(
    recipe_id: int, cooking_id: int, service: CookingService = Depends(get_cooking_service)
):
    try:
        deleted = service.delete(recipe_id, cooking_id)
    except RecipeNotFoundError:
        raise HTTPException(status.HTTP_404_NOT_FOUND, RECIPE_NOT_FOUND) from None
    if not deleted:
        raise HTTPException(status.HTTP_404_NOT_FOUND, COOKING_NOT_FOUND)
