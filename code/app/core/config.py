"""Configuration de l'application, chargée depuis les variables d'environnement et le .env."""
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import URL

# Dossier du code (contenant app/, src/, templates/)
CODE_DIR = Path(__file__).resolve().parents[2]
# Racine du projet (contenant code/, docker/, .env)
ROOT_DIR = CODE_DIR.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ROOT_DIR / ".env", extra="ignore")

    app_name: str = "Mes Recettes"
    environment: str = "development"
    debug: bool = True
    api_prefix: str = "/api"
    cors_origins: list[str] = ["http://localhost:5173"]
    templates_dir: Path = CODE_DIR / "templates"

    # Comptes utilisateurs. Désactivés : l'application est ouverte sans connexion et les recettes
    # n'ont pas de propriétaire. AUTH_ENABLED=true les réactive (voir README, « Comptes »).
    auth_enabled: bool = False

    # Authentification : clé de signature des tokens (obligatoire, au moins 32 caractères).
    # Générer : python -c "import secrets; print(secrets.token_urlsafe(48))"
    secret_key: str = Field(min_length=32)
    access_token_expire_minutes: int = 60
    jwt_algorithm: str = "HS256"

    # Connexion PostgreSQL (mêmes variables que l'image Docker officielle)
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "mes_recettes"
    postgres_user: str = "mes_recettes"
    postgres_password: str = ""
    # Optionnel : URL SQLAlchemy complète, prioritaire sur les variables POSTGRES_*
    database_url: str | None = None

    @property
    def sqlalchemy_url(self) -> URL | str:
        if self.database_url:
            return self.database_url
        # URL.create échappe les caractères spéciaux du mot de passe
        return URL.create(
            "postgresql+psycopg",
            username=self.postgres_user,
            password=self.postgres_password or None,
            host=self.postgres_host,
            port=self.postgres_port,
            database=self.postgres_db,
        )


settings = Settings()
