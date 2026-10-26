"""Schémas Pydantic de l'authentification."""
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, StringConstraints

# Identifiant : lettres non accentuées, chiffres, « . », « _ », « - »
Username = Annotated[
    str,
    StringConstraints(
        strip_whitespace=True, min_length=3, max_length=50, pattern=r"^[A-Za-z0-9._-]+$"
    ),
]
Password = Annotated[str, StringConstraints(min_length=8, max_length=128)]


class UserCreate(BaseModel):
    username: Username
    password: Password


class User(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    username: str
    is_active: bool


class Token(BaseModel):
    access_token: str
    token_type: Literal["bearer"] = "bearer"
    # Durée de validité, en secondes
    expires_in: int
