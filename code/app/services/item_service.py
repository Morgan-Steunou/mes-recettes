"""Logique métier des items, persistés en base de données via SQLAlchemy.

Chaque service est lié à un utilisateur : il ne voit et ne modifie que ses items.
"""
from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.models.item import ItemModel
from app.models.user import UserModel
from app.schemas.item import Item, ItemCreate, ItemUpdate


class ItemService:
    def __init__(self, db: Session, owner_id: int) -> None:
        self.db = db
        self.owner_id = owner_id

    def _get_row(self, item_id: int) -> ItemModel | None:
        # L'item d'un autre utilisateur est traité comme inexistant (404, pas 403) :
        # on ne révèle pas son existence
        return self.db.scalar(
            select(ItemModel).where(ItemModel.id == item_id, ItemModel.owner_id == self.owner_id)
        )

    def list(self) -> list[Item]:
        rows = self.db.scalars(
            select(ItemModel).where(ItemModel.owner_id == self.owner_id).order_by(ItemModel.id)
        )
        return [Item.model_validate(row) for row in rows]

    def get(self, item_id: int) -> Item | None:
        row = self._get_row(item_id)
        return Item.model_validate(row) if row else None

    def create(self, data: ItemCreate) -> Item:
        row = ItemModel(**data.model_dump(), owner_id=self.owner_id)
        self.db.add(row)
        self.db.commit()
        return Item.model_validate(row)

    def update(self, item_id: int, data: ItemUpdate) -> Item | None:
        row = self._get_row(item_id)
        if row is None:
            return None
        for field, value in data.model_dump().items():
            setattr(row, field, value)
        self.db.commit()
        return Item.model_validate(row)

    def delete(self, item_id: int) -> bool:
        row = self._get_row(item_id)
        if row is None:
            return False
        self.db.delete(row)
        self.db.commit()
        return True


def get_item_service(
    db: Session = Depends(get_db), user: UserModel = Depends(get_current_user)
) -> ItemService:
    return ItemService(db, owner_id=user.id)
