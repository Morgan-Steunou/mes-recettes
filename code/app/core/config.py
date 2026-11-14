"""Configuration de l'application, chargée depuis les variables d'environnement et le .env."""
from pathlib import Path
from typing import Literal, Self

from pydantic import Field, model_validator
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
    # Logs : niveau (DEBUG, INFO, WARNING...) et format. « json » : une ligne JSON par
    # événement, pour un outil de collecte ; « text » : lisible dans un terminal.
    # Par défaut : json en production, text sinon.
    log_level: str = "INFO"
    log_format: Literal["json", "text"] | None = None

    # Migrations Alembic appliquées au démarrage de l'API (pratique en développement).
    # En production, plusieurs instances les lanceraient en même temps : mettre false et les
    # appliquer une fois, avant le démarrage, avec « python -m app.cli migrate ».
    run_migrations_on_startup: bool = True

    # Authentification : clé de signature des tokens (obligatoire, au moins 32 caractères).
    # Générer : python -c "import secrets; print(secrets.token_urlsafe(48))"
    secret_key: str = Field(min_length=32)
    # Token d'accès (JWT, gardé en mémoire par l'interface) : court, renouvelé automatiquement
    access_token_expire_minutes: int = 15
    jwt_algorithm: str = "HS256"
    # Refresh token (cookie HttpOnly) : durée d'une session sans se reconnecter
    refresh_token_expire_days: int = 30
    # Cookie « Secure » : envoyé uniquement en HTTPS (et sur http://localhost, que les
    # navigateurs considèrent comme sûr). false seulement pour un essai en HTTP ailleurs.
    refresh_cookie_secure: bool = True

    # Limitation des tentatives de connexion échouées, sur une fenêtre glissante :
    # par couple (adresse IP, identifiant), et par adresse IP tous identifiants confondus
    login_max_failures: int = 5
    login_max_failures_per_ip: int = 20
    login_failure_window_seconds: int = 900

    # Connexion PostgreSQL (mêmes variables que l'image Docker officielle)
    postgres_host: str = "localhost"
    postgres_port: int = 5432
    postgres_db: str = "mes_recettes"
    postgres_user: str = "mes_recettes"
    postgres_password: str = ""
    # Optionnel : URL SQLAlchemy complète, prioritaire sur les variables POSTGRES_*
    database_url: str | None = None

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def log_json(self) -> bool:
        return self.log_format == "json" if self.log_format else self.is_production

    @model_validator(mode="after")
    def check_production(self) -> Self:
        """Refuse de démarrer en production avec des réglages de développement."""
        if not self.is_production:
            return self
        problems = []
        if self.debug:
            problems.append("DEBUG doit valoir false")
        local = ("localhost", "127.0.0.1", "0.0.0.0", "[::1]")
        bad_origins = [o for o in self.cors_origins if o == "*" or any(h in o for h in local)]
        if bad_origins:
            problems.append(f"CORS_ORIGINS ne doit contenir ni « * » ni localhost : {bad_origins}")
        if problems:
            raise ValueError("Configuration invalide en production : " + " ; ".join(problems))
        return self

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
