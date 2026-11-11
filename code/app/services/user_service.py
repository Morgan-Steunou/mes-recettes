"""Comptes utilisateurs : création et vérification des identifiants."""
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session

from app.core.security import hash_password, verify_password
from app.models.recipe import RecipeModel
from app.models.user import UserModel
from app.schemas.user import UserCreate


class UsernameTakenError(Exception):
    pass


class UserService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def count(self) -> int:
        return self.db.scalar(select(func.count()).select_from(UserModel))

    def get(self, user_id: int) -> UserModel | None:
        return self.db.get(UserModel, user_id)

    def get_by_username(self, username: str) -> UserModel | None:
        # Identifiants insensibles à la casse : « Alice » et « alice » sont le même compte
        return self.db.scalar(
            select(UserModel).where(func.lower(UserModel.username) == username.strip().lower())
        )

    def authenticate(self, username: str, password: str) -> UserModel | None:
        user = self.get_by_username(username)
        # Vérification faite même si l'utilisateur n'existe pas (temps de réponse constant)
        if not verify_password(password, user.hashed_password if user else None):
            return None
        if not user.is_active:
            return None
        return user

    def create(self, data: UserCreate) -> UserModel:
        if self.get_by_username(data.username):
            raise UsernameTakenError(data.username)
        user = UserModel(username=data.username, hashed_password=hash_password(data.password))
        self.db.add(user)
        self.db.commit()
        return user

    def claim_orphan_recipes(self, user: UserModel) -> int:
        """Rattache à cet utilisateur les recettes créées avant la mise en place des comptes."""
        result = self.db.execute(
            update(RecipeModel).where(RecipeModel.owner_id.is_(None)).values(owner_id=user.id)
        )
        self.db.commit()
        return result.rowcount
