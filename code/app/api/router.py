from fastapi import APIRouter, Depends

from app.api.deps import get_current_user
from app.api.routes import auth, health, items

api_router = APIRouter()
# Routes publiques
api_router.include_router(health.router, tags=["health"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
# Routes protégées : token d'accès obligatoire sur toutes les routes de ces routeurs,
# y compris celles qui seront ajoutées plus tard
protected = [Depends(get_current_user)]
api_router.include_router(items.router, prefix="/items", tags=["items"], dependencies=protected)
