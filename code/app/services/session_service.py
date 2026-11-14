"""Sessions : refresh tokens à usage unique, renouvelés à chaque utilisation (rotation)."""
import logging
import uuid
from datetime import UTC, datetime, timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import hash_refresh_token, new_refresh_token
from app.models.refresh_token import RefreshTokenModel
from app.models.user import UserModel

# Un token remplacé il y a moins de REUSE_GRACE peut encore être présenté sans alerte :
# deux onglets qui renouvellent en même temps envoient le même cookie. Il est refusé,
# mais sans révoquer la session (le navigateur a déjà reçu le nouveau cookie).
REUSE_GRACE = timedelta(seconds=30)

logger = logging.getLogger(__name__)


def _utc(value: datetime) -> datetime:
    # SQLite rend les dates sans fuseau : elles sont enregistrées en UTC
    return value if value.tzinfo else value.replace(tzinfo=UTC)


class SessionService:
    def __init__(self, db: Session) -> None:
        self.db = db

    def start(self, user: UserModel) -> str:
        """Nouvelle session (connexion) : renvoie son premier refresh token."""
        # Ménage : tokens expirés de cet utilisateur
        self.db.execute(
            delete(RefreshTokenModel).where(
                RefreshTokenModel.user_id == user.id,
                RefreshTokenModel.expires_at < datetime.now(UTC),
            )
        )
        family_id = str(uuid.uuid4())
        token = self._issue(user.id, family_id=family_id)
        self.db.commit()
        logger.info(
            "Session ouverte",
            extra={"event": "auth.session.started", "user_id": user.id, "session_id": family_id},
        )
        return token

    def rotate(self, token: str) -> tuple[UserModel, str] | None:
        """Échange un refresh token valide contre l'utilisateur et un nouveau refresh token.

        Renvoie None si le token est inconnu, expiré, révoqué ou si le compte est désactivé.
        """
        now = datetime.now(UTC)
        record = self.db.scalar(
            select(RefreshTokenModel)
            .where(RefreshTokenModel.token_hash == hash_refresh_token(token))
            # Deux renouvellements simultanés du même token : le second attend le premier
            .with_for_update()
        )
        if record is None:
            return None
        if record.revoked_at is not None:
            if now - _utc(record.revoked_at) > REUSE_GRACE:
                # Token réutilisé longtemps après : il a probablement été volé
                self._revoke_family(record.family_id, now)
                self.db.commit()
                logger.warning(
                    "Refresh token réutilisé : session révoquée",
                    extra={
                        "event": "auth.session.reuse_detected",
                        "user_id": record.user_id,
                        "session_id": record.family_id,
                    },
                )
            return None
        if _utc(record.expires_at) <= now:
            return None
        user = self.db.get(UserModel, record.user_id)
        if user is None or not user.is_active:
            self._revoke_family(record.family_id, now)
            self.db.commit()
            logger.info(
                "Session d'un compte désactivé révoquée",
                extra={
                    "event": "auth.session.revoked",
                    "reason": "inactive_user",
                    "user_id": record.user_id,
                    "session_id": record.family_id,
                },
            )
            return None

        record.revoked_at = now
        new_token = self._issue(user.id, family_id=record.family_id)
        self.db.commit()
        return user, new_token

    def end(self, token: str) -> None:
        """Déconnexion : révoque la session de ce token (toute sa famille)."""
        record = self.db.scalar(
            select(RefreshTokenModel).where(
                RefreshTokenModel.token_hash == hash_refresh_token(token)
            )
        )
        if record is not None:
            self._revoke_family(record.family_id, datetime.now(UTC))
            self.db.commit()
            logger.info(
                "Déconnexion",
                extra={
                    "event": "auth.session.revoked",
                    "reason": "logout",
                    "user_id": record.user_id,
                    "session_id": record.family_id,
                },
            )

    def end_all(self, user_id: int) -> int:
        """Révoque toutes les sessions d'un utilisateur ; renvoie le nombre de tokens révoqués."""
        result = self.db.execute(
            update(RefreshTokenModel)
            .where(RefreshTokenModel.user_id == user_id, RefreshTokenModel.revoked_at.is_(None))
            .values(revoked_at=datetime.now(UTC))
        )
        self.db.commit()
        logger.warning(
            "Toutes les sessions révoquées",
            extra={
                "event": "auth.session.revoked_all",
                "user_id": user_id,
                "revoked": result.rowcount,
            },
        )
        return result.rowcount

    def _issue(self, user_id: int, family_id: str) -> str:
        token = new_refresh_token()
        self.db.add(
            RefreshTokenModel(
                user_id=user_id,
                token_hash=hash_refresh_token(token),
                family_id=family_id,
                expires_at=datetime.now(UTC) + timedelta(days=settings.refresh_token_expire_days),
            )
        )
        return token

    def _revoke_family(self, family_id: str, now: datetime) -> None:
        self.db.execute(
            update(RefreshTokenModel)
            .where(RefreshTokenModel.family_id == family_id, RefreshTokenModel.revoked_at.is_(None))
            .values(revoked_at=now)
        )
