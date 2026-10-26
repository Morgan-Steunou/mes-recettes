from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.database import get_db
from app.core.security import create_access_token
from app.models.user import UserModel
from app.schemas.user import Token, User
from app.services.user_service import UserService

router = APIRouter()


@router.post("/token", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    """Échange identifiant + mot de passe (formulaire OAuth2) contre un token d'accès.

    Le token est à envoyer ensuite sur chaque requête : « Authorization: Bearer <token> ».
    """
    user = UserService(db).authenticate(form.username, form.password)
    if user is None:
        # Même message que l'identifiant existe ou non (ne pas aider à deviner les comptes)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Identifiant ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    token, expires_in = create_access_token(user.id)
    return Token(access_token=token, expires_in=expires_in)


@router.get("/me", response_model=User)
def me(user: UserModel = Depends(get_current_user)):
    """Utilisateur correspondant au token envoyé."""
    return user
