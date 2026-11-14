from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import get_db

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Vivacité : le processus répond (ne teste pas la base)."""
    # « auth » indique à l'interface si elle doit proposer la connexion
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.environment,
        "auth": settings.auth_enabled,
    }


@router.get("/health/ready")
def ready(db: Session = Depends(get_db)) -> dict:
    """Disponibilité : l'API peut servir des requêtes, base de données comprise (sinon 503)."""
    try:
        db.execute(text("SELECT 1"))
    except SQLAlchemyError as e:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE, "Base de données injoignable"
        ) from e
    return {"status": "ok", "database": "ok"}
