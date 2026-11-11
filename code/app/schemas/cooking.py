"""Historique des repas : une entrée chaque fois qu'une recette est cuisinée."""
from datetime import date, datetime, timedelta
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

from app.schemas.recipe import _check_multiline, _empty_to_none

# Date la plus ancienne acceptée (évite les fautes de frappe du type « 0202 »)
OLDEST_DATE = date(1900, 1, 1)


def _not_in_future(value: date) -> date:
    # Un jour de tolérance : la date du navigateur peut être en avance sur celle du serveur
    # (fuseau horaire)
    if value > date.today() + timedelta(days=1):
        raise ValueError("La date ne peut pas être dans le futur")
    if value < OLDEST_DATE:
        raise ValueError("La date est trop ancienne")
    return value


CookedOn = Annotated[date, AfterValidator(_not_in_future)]
Rating = Annotated[int, Field(ge=1, le=5, strict=True)]
CookingComment = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=1000),
    AfterValidator(_check_multiline),
    AfterValidator(_empty_to_none),
]


class CookingCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    # Absente : aujourd'hui (date du serveur)
    cooked_on: CookedOn | None = None
    rating: Rating | None = None
    comment: CookingComment | None = None


class Cooking(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    recipe_id: int
    cooked_on: date
    rating: int | None
    comment: str | None
    created_at: datetime
