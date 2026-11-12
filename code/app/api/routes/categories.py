"""Catégories de plats : /api/categories"""
from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.category import Category, CategoryIn
from app.services.category_service import (
    CategoryNameTakenError,
    CategoryService,
    get_category_service,
)

router = APIRouter()

NOT_FOUND = "Catégorie introuvable"
NAME_TAKEN = "Une catégorie porte déjà ce nom"


@router.get("", response_model=list[Category])
def list_categories(service: CategoryService = Depends(get_category_service)):
    return service.list()


@router.post("", response_model=Category, status_code=status.HTTP_201_CREATED)
def create_category(data: CategoryIn, service: CategoryService = Depends(get_category_service)):
    try:
        return service.create(data)
    except CategoryNameTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, NAME_TAKEN) from None


@router.put("/{category_id}", response_model=Category)
def rename_category(
    category_id: int, data: CategoryIn, service: CategoryService = Depends(get_category_service)
):
    try:
        category = service.rename(category_id, data)
    except CategoryNameTakenError:
        raise HTTPException(status.HTTP_409_CONFLICT, NAME_TAKEN) from None
    if category is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
    return category


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(category_id: int, service: CategoryService = Depends(get_category_service)):
    if not service.delete(category_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, NOT_FOUND)
