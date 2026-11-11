"""Schémas Pydantic (validation des entrées / sorties de l'API)."""
import unicodedata
from datetime import date, datetime
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, Field, StringConstraints

# Caractères Unicode qui inversent le sens d'affichage du texte (attaque « Trojan Source »)
BIDI_CONTROLS = set("\u202a\u202b\u202c\u202d\u202e\u2066\u2067\u2068\u2069")


def _check_chars(value: str, allowed: str = "") -> str:
    for char in value:
        if char in allowed:
            continue
        if unicodedata.category(char) == "Cc":
            raise ValueError("Le texte contient des caractères de contrôle interdits")
        if char in BIDI_CONTROLS:
            raise ValueError("Le texte contient des caractères de direction interdits")
    return value


def _check_single_line(value: str) -> str:
    return _check_chars(value)


def _check_multiline(value: str) -> str:
    return _check_chars(value, allowed="\n\r\t")


def _empty_to_none(value: str) -> str | None:
    # Un champ facultatif laissé vide (ou rempli d'espaces) est enregistré comme absent,
    # pour qu'il n'y ait qu'une seule façon de dire « pas de description »
    return value or None


# Espaces de début / fin retirés avant la vérification de longueur
RecipeTitle = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=150),
    AfterValidator(_check_single_line),
]
RecipeDescription = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=2000),
    AfterValidator(_check_multiline),
    AfterValidator(_empty_to_none),
]
RecipeSteps = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=10000),
    AfterValidator(_check_multiline),
    AfterValidator(_empty_to_none),
]
Servings = Annotated[int, Field(ge=1, le=100)]
# En minutes, 24 heures au maximum
Minutes = Annotated[int, Field(ge=0, le=1440)]

IngredientName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    AfterValidator(_check_single_line),
]
IngredientUnit = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=30),
    AfterValidator(_check_single_line),
    AfterValidator(_empty_to_none),
]
# Quantité strictement positive (« 0,5 » accepté), sans infini ni NaN
Quantity = Annotated[float, Field(gt=0, le=100000, allow_inf_nan=False)]
MAX_INGREDIENTS = 100


class IngredientIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: IngredientName
    quantity: Quantity | None = None
    unit: IngredientUnit | None = None


class Ingredient(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    name: str
    quantity: float | None = None
    unit: str | None = None


class RecipeBase(BaseModel):
    title: RecipeTitle
    description: RecipeDescription | None = None
    servings: Servings | None = None
    prep_time_minutes: Minutes | None = None
    cook_time_minutes: Minutes | None = None
    steps: RecipeSteps | None = None


class RecipeCreate(RecipeBase):
    # Refuse les champs inconnus (ex. « id ») au lieu de les ignorer
    model_config = ConfigDict(extra="forbid")

    # Dans l'ordre d'affichage. PUT remplace toute la recette : liste absente = aucun ingrédient
    ingredients: list[IngredientIn] = Field(default_factory=list, max_length=MAX_INGREDIENTS)


class RecipeUpdate(RecipeCreate):
    pass


class Recipe(RecipeBase):
    # Permet de construire le schéma depuis un modèle ORM (RecipeModel)
    model_config = ConfigDict(from_attributes=True)

    id: int
    ingredients: list[Ingredient]
    created_at: datetime
    updated_at: datetime
    # Résumé de l'historique des repas (calculé, pas modifiable directement)
    cooked_count: int = 0
    last_cooked_on: date | None = None
