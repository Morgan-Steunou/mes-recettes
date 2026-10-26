"""Schémas Pydantic (validation des entrées / sorties de l'API)."""
import unicodedata
from typing import Annotated

from pydantic import AfterValidator, BaseModel, ConfigDict, StringConstraints

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


# Espaces de début / fin retirés avant la vérification de longueur
ItemName = Annotated[
    str,
    StringConstraints(strip_whitespace=True, min_length=1, max_length=100),
    AfterValidator(_check_single_line),
]
ItemDescription = Annotated[
    str,
    StringConstraints(strip_whitespace=True, max_length=1000),
    AfterValidator(_check_multiline),
]


class ItemBase(BaseModel):
    name: ItemName
    description: ItemDescription | None = None


class ItemCreate(ItemBase):
    # Refuse les champs inconnus (ex. « id ») au lieu de les ignorer
    model_config = ConfigDict(extra="forbid")


class ItemUpdate(ItemBase):
    model_config = ConfigDict(extra="forbid")


class Item(ItemBase):
    # Permet de construire le schéma depuis un modèle ORM (ItemModel)
    model_config = ConfigDict(from_attributes=True)

    id: int
