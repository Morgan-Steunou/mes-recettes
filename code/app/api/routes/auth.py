import logging
import math

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from fastapi.responses import JSONResponse
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.database import get_db
from app.core.rate_limit import login_throttle
from app.core.security import create_access_token
from app.models.user import UserModel
from app.schemas.user import Token, User
from app.services.session_service import SessionService
from app.services.user_service import UserService

router = APIRouter()
logger = logging.getLogger(__name__)

# Refresh token : cookie HttpOnly (illisible par le JavaScript de la page, donc par une
# éventuelle faille XSS), envoyé seulement aux routes /api/auth et jamais par un autre site.
# Nom propre à l'application : les cookies de localhost sont partagés entre tous les ports,
# donc entre deux applications de ce type qui tournent en même temps.
REFRESH_COOKIE = "mes_recettes_refresh"
REFRESH_COOKIE_PATH = f"{settings.api_prefix}/auth"


def set_refresh_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        REFRESH_COOKIE,
        token,
        max_age=settings.refresh_token_expire_days * 24 * 3600,
        path=REFRESH_COOKIE_PATH,
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="strict",
    )


def clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        REFRESH_COOKIE,
        path=REFRESH_COOKIE_PATH,
        secure=settings.refresh_cookie_secure,
        httponly=True,
        samesite="strict",
    )


@router.post("/token", response_model=Token)
def login(
    request: Request,
    response: Response,
    form: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    """Échange identifiant + mot de passe (formulaire OAuth2) contre un token d'accès.

    Le token d'accès est à envoyer ensuite sur chaque requête : « Authorization: Bearer <token> ».
    Le refresh token est posé en cookie HttpOnly ; POST /auth/refresh donne un nouveau token
    d'accès sans redemander le mot de passe.
    Après trop d'échecs (voir core/rate_limit.py), répond 429 pendant un moment.
    """
    # Derrière un reverse proxy, uvicorn prend l'adresse dans X-Forwarded-For
    # (variable FORWARDED_ALLOW_IPS, voir docker/docker-compose.prod.yml)
    ip = request.client.host if request.client else "inconnue"
    wait = login_throttle.retry_after(ip, form.username)
    if wait is not None:
        logger.warning(
            "Connexion bloquée (trop d'échecs)",
            extra={"event": "auth.login.throttled", "username": form.username, "client_ip": ip},
        )
        minutes = math.ceil(wait / 60)
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Trop de tentatives de connexion. Réessayez dans {minutes} minute"
            + ("s" if minutes > 1 else "")
            + ".",
            headers={"Retry-After": str(wait)},
        )

    user = UserService(db).authenticate(form.username, form.password)
    if user is None:
        login_throttle.record_failure(ip, form.username)
        logger.warning(
            "Échec de connexion",
            extra={"event": "auth.login.failure", "username": form.username, "client_ip": ip},
        )
        # Même message que l'identifiant existe ou non (ne pas aider à deviner les comptes)
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Identifiant ou mot de passe incorrect",
            headers={"WWW-Authenticate": "Bearer"},
        )
    login_throttle.record_success(ip, form.username)
    logger.info(
        "Connexion",
        extra={
            "event": "auth.login.success",
            "user_id": user.id,
            "username": user.username,
            "client_ip": ip,
        },
    )
    set_refresh_cookie(response, SessionService(db).start(user))
    token, expires_in = create_access_token(user.id)
    return Token(access_token=token, expires_in=expires_in)


@router.post("/refresh", response_model=Token)
def refresh(
    response: Response,
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    db: Session = Depends(get_db),
):
    """Nouveau token d'accès à partir du cookie de session, qui est renouvelé au passage.

    Chaque refresh token ne sert qu'une fois : en présenter un déjà utilisé révoque la session.
    """
    result = SessionService(db).rotate(refresh_token) if refresh_token else None
    if result is None:
        # Réponse construite ici (et non HTTPException) pour effacer aussi le cookie inutilisable
        error = JSONResponse(
            {"detail": "Session expirée, veuillez vous reconnecter"},
            status_code=status.HTTP_401_UNAUTHORIZED,
        )
        clear_refresh_cookie(error)
        return error
    user, new_refresh_token = result
    set_refresh_cookie(response, new_refresh_token)
    token, expires_in = create_access_token(user.id)
    return Token(access_token=token, expires_in=expires_in)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    refresh_token: str | None = Cookie(default=None, alias=REFRESH_COOKIE),
    db: Session = Depends(get_db),
):
    """Déconnexion : révoque la session côté serveur et efface le cookie.

    Le token d'accès déjà délivré reste valable jusqu'à son expiration (15 min par défaut) ;
    l'interface l'oublie aussitôt.
    """
    if refresh_token:
        SessionService(db).end(refresh_token)
    response = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_refresh_cookie(response)
    return response


@router.get("/me", response_model=User)
def me(user: UserModel = Depends(get_current_user)):
    """Utilisateur correspondant au token envoyé."""
    return user
