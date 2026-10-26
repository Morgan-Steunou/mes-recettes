"""Dépendances communes des routes : utilisateur connecté (token d'accès obligatoire)."""
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db
from app.core.security import decode_access_token
from app.models.user import UserModel
from app.services.user_service import UserService

# Lit l'en-tête « Authorization: Bearer <token> » (et ajoute le bouton « Authorize » à /docs).
# auto_error=False : l'absence de token est traitée ci-dessous, avec le même message en français.
oauth2_scheme = OAuth2PasswordBearer(
    tokenUrl=f"{settings.api_prefix}/auth/token", auto_error=False
)


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> UserModel:
    unauthorized = HTTPException(
        status.HTTP_401_UNAUTHORIZED,
        "Authentification requise ou session expirée",
        headers={"WWW-Authenticate": "Bearer"},
    )
    if not token:
        raise unauthorized
    user_id = decode_access_token(token)
    if user_id is None:
        raise unauthorized
    user = UserService(db).get(user_id)
    # Compte supprimé ou désactivé depuis la création du token
    if user is None or not user.is_active:
        raise unauthorized
    return user
