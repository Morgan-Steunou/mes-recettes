"""Point d'entrée de l'API : uvicorn app.main:app --reload"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse

from app.api.router import api_router
from app.core.config import settings
from app.core.database import init_db
from app.core.templating import templates


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(title=settings.app_name, debug=settings.debug, lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router, prefix=settings.api_prefix)


@app.exception_handler(RequestValidationError)
async def validation_error_handler(_: Request, exc: RequestValidationError):
    """Erreurs 422 sans la valeur envoyée (« input ») : on ne renvoie pas la saisie au client,
    et une valeur non représentable en JSON (Infinity, NaN) ne provoque pas d'erreur 500."""
    errors = [{k: v for k, v in error.items() if k != "input"} for error in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": jsonable_encoder(errors)})


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def index(request: Request):
    """Page d'accueil rendue côté serveur depuis templates/pages/index.html."""
    return templates.TemplateResponse(
        request, "pages/index.html", {"app_name": settings.app_name}
    )
