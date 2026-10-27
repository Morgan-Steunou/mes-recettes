import os

# Clé de test, définie avant d'importer l'application (les tests ne dépendent pas du .env)
os.environ.setdefault("SECRET_KEY", "cle-de-test-uniquement-" + "x" * 32)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402, F401  (enregistre les modèles auprès de Base)
from app.core.config import settings  # noqa: E402
from app.core.database import Base, get_db  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.user import UserCreate  # noqa: E402
from app.services.user_service import UserService  # noqa: E402

PASSWORD = "mot-de-passe-de-test"


@pytest.fixture
def session_factory():
    # Base SQLite en mémoire, recréée pour chaque test (ne touche pas PostgreSQL)
    engine = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(engine)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield factory
    app.dependency_overrides.clear()
    engine.dispose()


@pytest.fixture(autouse=True)
def auth_disabled(monkeypatch):
    """Comptes désactivés par défaut, quel que soit le .env (comme la configuration par défaut)."""
    monkeypatch.setattr(settings, "auth_enabled", False)


@pytest.fixture
def enable_auth(monkeypatch):
    """Active les comptes utilisateurs (AUTH_ENABLED=true) pour ce test."""
    monkeypatch.setattr(settings, "auth_enabled", True)


@pytest.fixture
def anon_client(session_factory):
    """Client sans token d'accès."""
    return TestClient(app)


@pytest.fixture
def create_user(session_factory):
    def _create(username: str, password: str = PASSWORD, is_active: bool = True):
        with session_factory() as db:
            user = UserService(db).create(UserCreate(username=username, password=password))
            if not is_active:
                user.is_active = False
                db.commit()
            return user

    return _create


@pytest.fixture
def client_for(enable_auth, anon_client, create_user):
    """Active les comptes, crée un utilisateur, se connecte, et renvoie un client avec son token."""

    def _client(username: str) -> TestClient:
        create_user(username)
        r = anon_client.post("/api/auth/token", data={"username": username, "password": PASSWORD})
        assert r.status_code == 200, r.text
        token = r.json()["access_token"]
        return TestClient(app, headers={"Authorization": f"Bearer {token}"})

    return _client


@pytest.fixture
def client(client_for):
    """Client connecté en tant qu'« alice »."""
    return client_for("alice")
