from fastapi import APIRouter, Depends

from app.api.deps import get_current_user, require_auth_enabled
from app.api.routes import auth, cookings, health, recipes

api_router = APIRouter()
# Routes publiques
api_router.include_router(health.router, tags=["health"])
# Connexion : 404 tant que les comptes sont désactivés (AUTH_ENABLED=false)
api_router.include_router(
    auth.router, prefix="/auth", tags=["auth"], dependencies=[Depends(require_auth_enabled)]
)
# Routes protégées : token d'accès obligatoire sur toutes les routes de ces routeurs,
# y compris celles qui seront ajoutées plus tard (accès libre si les comptes sont désactivés)
protected = [Depends(get_current_user)]
api_router.include_router(
    recipes.router, prefix="/recipes", tags=["recipes"], dependencies=protected
)
api_router.include_router(
    cookings.router,
    prefix="/recipes/{recipe_id}/cookings",
    tags=["cookings"],
    dependencies=protected,
)
