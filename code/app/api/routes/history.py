"""Historique global des repas, toutes recettes confondues : /api/cookings"""
from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.schemas.cooking import HistoryPage
from app.services.cooking_service import CookingService, get_cooking_service

router = APIRouter()


@router.get("", response_model=HistoryPage)
def history(
    since: Annotated[date | None, Query(description="Premier jour inclus (AAAA-MM-JJ)")] = None,
    until: Annotated[date | None, Query(description="Dernier jour inclus (AAAA-MM-JJ)")] = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
    service: CookingService = Depends(get_cooking_service),
):
    if since and until and since > until:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "La date de début doit précéder la date de fin",
        )
    return service.history(since=since, until=until, limit=limit, offset=offset)
