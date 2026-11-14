from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class RefreshTokenModel(Base):
    """Refresh token d'une session (cookie HttpOnly), à usage unique.

    Chaque renouvellement révoque le token utilisé et en crée un nouveau dans la même
    famille (une famille = une connexion). Si un token déjà révoqué est présenté à nouveau,
    il a été copié : toute la famille est révoquée.
    """

    __tablename__ = "refresh_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    # Empreinte SHA-256 du token, jamais le token lui-même
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    family_id: Mapped[str] = mapped_column(String(36), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
