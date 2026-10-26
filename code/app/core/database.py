"""Connexion à la base de données PostgreSQL (SQLAlchemy) et session par requête."""
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.core.config import settings


class Base(DeclarativeBase):
    """Classe de base des modèles ORM."""


# pool_pre_ping : vérifie la connexion avant usage (ex. après un redémarrage de PostgreSQL)
engine = create_engine(settings.sqlalchemy_url, pool_pre_ping=True)
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """Applique les migrations Alembic manquantes (code/migrations)."""
    from alembic import command
    from alembic.config import Config

    from app.core.config import CODE_DIR

    command.upgrade(Config(str(CODE_DIR / "alembic.ini")), "head")


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
