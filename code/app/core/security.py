"""Mots de passe (hachage Argon2), tokens d'accès (JWT signés) et refresh tokens (aléatoires)."""
import hashlib
import secrets
from datetime import UTC, datetime, timedelta

import jwt
from pwdlib import PasswordHash

from app.core.config import settings

# Argon2, paramètres recommandés par pwdlib
password_hash = PasswordHash.recommended()

# Hachage factice : vérifié quand l'utilisateur n'existe pas, pour que la réponse prenne
# le même temps qu'un mauvais mot de passe (évite de deviner les identifiants existants)
_DUMMY_HASH = password_hash.hash("mot-de-passe-factice-pour-temps-constant")


def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str | None) -> bool:
    if hashed is None:
        password_hash.verify(password, _DUMMY_HASH)
        return False
    return password_hash.verify(password, hashed)


def create_access_token(user_id: int) -> tuple[str, int]:
    """Renvoie (token, durée de validité en secondes)."""
    now = datetime.now(UTC)
    lifetime = timedelta(minutes=settings.access_token_expire_minutes)
    payload = {"sub": str(user_id), "type": "access", "iat": now, "exp": now + lifetime}
    token = jwt.encode(payload, settings.secret_key, algorithm=settings.jwt_algorithm)
    return token, int(lifetime.total_seconds())


def decode_access_token(token: str) -> int | None:
    """Renvoie l'id de l'utilisateur, ou None si le token est invalide ou expiré."""
    try:
        payload = jwt.decode(
            token,
            settings.secret_key,
            # Liste explicite : refuse les tokens « alg: none » ou signés autrement
            algorithms=[settings.jwt_algorithm],
            options={"require": ["exp", "iat", "sub"]},
        )
    except jwt.PyJWTError:
        return None
    if payload.get("type") != "access":
        return None
    try:
        return int(payload["sub"])
    except (TypeError, ValueError):
        return None


def new_refresh_token() -> str:
    """Refresh token : 256 bits aléatoires, opaque (aucune information dedans)."""
    return secrets.token_urlsafe(32)


def hash_refresh_token(token: str) -> str:
    """Empreinte stockée en base. SHA-256 suffit : le token est aléatoire et long, il ne se
    devine pas comme un mot de passe."""
    return hashlib.sha256(token.encode()).hexdigest()
