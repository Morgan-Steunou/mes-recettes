from fastapi import APIRouter, Depends, HTTPException, status

from app.schemas.item import Item, ItemCreate, ItemUpdate
from app.services.item_service import ItemService, get_item_service

router = APIRouter()


@router.get("", response_model=list[Item])
def list_items(service: ItemService = Depends(get_item_service)):
    return service.list()


@router.get("/{item_id}", response_model=Item)
def get_item(item_id: int, service: ItemService = Depends(get_item_service)):
    item = service.get(item_id)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item introuvable")
    return item


@router.post("", response_model=Item, status_code=status.HTTP_201_CREATED)
def create_item(data: ItemCreate, service: ItemService = Depends(get_item_service)):
    return service.create(data)


@router.put("/{item_id}", response_model=Item)
def update_item(
    item_id: int, data: ItemUpdate, service: ItemService = Depends(get_item_service)
):
    item = service.update(item_id, data)
    if item is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item introuvable")
    return item


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: int, service: ItemService = Depends(get_item_service)):
    if not service.delete(item_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Item introuvable")
