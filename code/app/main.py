"""Point d'entrée de l'API : uvicorn app.main:app --reload"""
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse

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


@app.get("/", response_class=HTMLResponse, include_in_schema=False)
def index(request: Request):
    """Page d'accueil rendue côté serveur depuis templates/pages/index.html."""
    return templates.TemplateResponse(
        request, "pages/index.html", {"app_name": settings.app_name}
    )
