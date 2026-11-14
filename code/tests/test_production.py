"""Réglages de production, disponibilité et limitation des tentatives de connexion."""
import pytest
from pydantic import ValidationError

from app.core.config import Settings, settings
from app.core.rate_limit import LoginThrottle
from tests.conftest import PASSWORD

SECRET = "cle-de-test-uniquement-" + "x" * 32


def make_settings(**overrides) -> Settings:
    # _env_file=None : ignore le .env de la machine
    return Settings(_env_file=None, secret_key=SECRET, **overrides)


# --- Configuration de production --------------------------------------------------------


def test_development_accepts_debug_and_localhost():
    s = make_settings(environment="development", debug=True)
    assert not s.is_production


def test_production_accepts_safe_settings():
    s = make_settings(
        environment="production", debug=False, cors_origins=["https://app.example.com"]
    )
    assert s.is_production


@pytest.mark.parametrize(
    "overrides, message",
    [
        ({"debug": True, "cors_origins": ["https://app.example.com"]}, "DEBUG"),
        ({"debug": False, "cors_origins": ["http://localhost:5173"]}, "CORS_ORIGINS"),
        ({"debug": False, "cors_origins": ["*"]}, "CORS_ORIGINS"),
    ],
)
def test_production_refuses_development_settings(overrides, message):
    with pytest.raises(ValidationError, match=message):
        make_settings(environment="Production", **overrides)


# --- Disponibilité ----------------------------------------------------------------------


def test_ready_checks_database(anon_client):
    r = anon_client.get("/api/health/ready")
    assert r.status_code == 200
    assert r.json() == {"status": "ok", "database": "ok"}


def test_ready_returns_503_without_database(anon_client, session_factory):
    from sqlalchemy.exc import OperationalError

    from app.core.database import get_db
    from app.main import app

    class BrokenSession:
        def execute(self, *_):
            raise OperationalError("SELECT 1", {}, Exception("connexion refusée"))

    app.dependency_overrides[get_db] = lambda: BrokenSession()
    r = anon_client.get("/api/health/ready")
    assert r.status_code == 503
    assert r.json()["detail"] == "Base de données injoignable"


# --- Limitation des tentatives de connexion ---------------------------------------------


def login(client, username, password="mauvais-mot-de-passe"):
    return client.post("/api/auth/token", data={"username": username, "password": password})


def test_login_blocked_after_too_many_failures(enable_auth, anon_client, create_user):
    create_user("alice")
    for _ in range(settings.login_max_failures):
        assert login(anon_client, "alice").status_code == 401

    # Même le bon mot de passe est refusé tant que le blocage dure
    r = login(anon_client, "ALICE", PASSWORD)
    assert r.status_code == 429
    assert int(r.headers["Retry-After"]) > 0
    assert r.json()["detail"].startswith("Trop de tentatives de connexion")


def test_success_resets_failures_of_the_account(enable_auth, anon_client, create_user):
    create_user("alice")
    for _ in range(settings.login_max_failures - 1):
        login(anon_client, "alice")
    assert login(anon_client, "alice", PASSWORD).status_code == 200
    # Le compteur repart de zéro
    for _ in range(settings.login_max_failures - 1):
        assert login(anon_client, "alice").status_code == 401
    assert login(anon_client, "alice", PASSWORD).status_code == 200


def test_blocking_one_account_does_not_block_others(enable_auth, anon_client, create_user):
    create_user("alice")
    create_user("bob")
    for _ in range(settings.login_max_failures):
        login(anon_client, "alice")
    assert login(anon_client, "alice", PASSWORD).status_code == 429
    assert login(anon_client, "bob", PASSWORD).status_code == 200


def test_ip_limit_across_usernames():
    throttle = LoginThrottle(max_failures=5, max_failures_per_ip=3, window_seconds=60)
    for name in ("a", "b", "c"):
        throttle.record_failure("1.2.3.4", name)
    assert throttle.retry_after("1.2.3.4", "d") is not None
    assert throttle.retry_after("5.6.7.8", "d") is None


def test_failures_expire_after_window(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr("app.core.rate_limit.time.monotonic", lambda: now[0])
    throttle = LoginThrottle(max_failures=2, max_failures_per_ip=10, window_seconds=60)
    throttle.record_failure("ip", "alice")
    now[0] += 30
    throttle.record_failure("ip", "alice")
    assert throttle.retry_after("ip", "alice") == 31  # le 1er échec sort de la fenêtre dans 30 s

    now[0] += 31
    assert throttle.retry_after("ip", "alice") is None
