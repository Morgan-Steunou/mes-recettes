import os

# Clé de test, définie avant d'importer l'application (les tests ne dépendent pas du .env)
os.environ.setdefault("SECRET_KEY", "cle-de-test-uniquement-" + "x" * 32)

# Par défaut, base SQLite en mémoire (rapide, sans serveur). Avec TEST_DATABASE_URL, les mêmes
# tests tournent sur PostgreSQL, schéma créé par les migrations Alembic (comme en production) :
#   TEST_DATABASE_URL=postgresql+psycopg://user:motdepasse@localhost:5432/mes_recettes_test pytest
# Attention : le schéma de cette base est entièrement effacé au début des tests.
TEST_DATABASE_URL = os.environ.get("TEST_DATABASE_URL")
if TEST_DATABASE_URL:
    os.environ["DATABASE_URL"] = TEST_DATABASE_URL

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import create_engine, text  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

import app.models  # noqa: E402, F401  (enregistre les modèles auprès de Base)
from app.core.config import settings  # noqa: E402
from app.core.database import Base, engine, get_db, init_db  # noqa: E402
from app.core.rate_limit import login_throttle  # noqa: E402
from app.main import app  # noqa: E402
from app.schemas.user import UserCreate  # noqa: E402
from app.services.user_service import UserService  # noqa: E402

PASSWORD = "mot-de-passe-de-test"


@pytest.fixture(autouse=True)
def reset_login_throttle():
    """Chaque test démarre sans tentative de connexion échouée enregistrée."""
    login_throttle.clear()
    yield
    login_throttle.clear()


@pytest.fixture(scope="session")
def postgres_engine():
    """PostgreSQL : schéma recréé une fois, par les migrations, pour toute la session de tests."""
    with engine.begin() as conn:
        conn.execute(text("DROP SCHEMA public CASCADE"))
        conn.execute(text("CREATE SCHEMA public"))
    init_db()
    yield engine
    engine.dispose()


def make_test_engine(request):
    if TEST_DATABASE_URL:
        pg = request.getfixturevalue("postgres_engine")
        # Tables vidées avant chaque test, compteurs d'id remis à 1
        tables = ", ".join(t.name for t in Base.metadata.sorted_tables)
        with pg.begin() as conn:
            conn.execute(text(f"TRUNCATE {tables} RESTART IDENTITY CASCADE"))
        return pg, False
    # Base SQLite en mémoire, recréée pour chaque test
    sqlite = create_engine(
        "sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool
    )
    Base.metadata.create_all(sqlite)
    return sqlite, True


@pytest.fixture
def session_factory(request):
    engine, dispose = make_test_engine(request)
    factory = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)

    def override_get_db():
        with factory() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    yield factory
    app.dependency_overrides.clear()
    if dispose:
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
