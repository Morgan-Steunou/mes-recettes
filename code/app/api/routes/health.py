from fastapi import APIRouter

from app.core.config import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    # « auth » indique à l'interface si elle doit proposer la connexion
    return {
        "status": "ok",
        "app": settings.app_name,
        "env": settings.environment,
        "auth": settings.auth_enabled,
    }
