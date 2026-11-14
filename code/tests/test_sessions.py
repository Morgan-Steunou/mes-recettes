"""Sessions : refresh token en cookie HttpOnly, rotation, réutilisation, déconnexion."""
from datetime import UTC, datetime, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.api.routes.auth import REFRESH_COOKIE
from app.core.config import settings
from app.core.security import hash_refresh_token
from app.main import app
from app.models.refresh_token import RefreshTokenModel
from app.services import session_service
from app.services.session_service import SessionService
from tests.conftest import PASSWORD

# Cookie « Secure » : le client de test ne le renvoie qu'en HTTPS
BASE_URL = "https://testserver"

# Les sessions n'existent qu'avec les comptes activés (AUTH_ENABLED=true)
pytestmark = pytest.mark.usefixtures("enable_auth")


@pytest.fixture
def https_client(session_factory):
    return TestClient(app, base_url=BASE_URL)


def login(client: TestClient, username: str = "alice") -> tuple[str, str]:
    """Renvoie (token d'accès, refresh token)."""
    r = client.post("/api/auth/token", data={"username": username, "password": PASSWORD})
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.cookies[REFRESH_COOKIE]


def refresh_with(token: str | None):
    """Appelle /refresh en présentant ce refresh token (sans le cookie jar d'un client)."""
    headers = {"Cookie": f"{REFRESH_COOKIE}={token}"} if token else {}
    return TestClient(app, base_url=BASE_URL).post("/api/auth/refresh", headers=headers)


def test_login_sets_refresh_cookie_out_of_javascript_reach(https_client, create_user):
    create_user("alice")
    r = https_client.post("/api/auth/token", data={"username": "alice", "password": PASSWORD})

    cookie = r.headers["set-cookie"]
    assert cookie.startswith(f"{REFRESH_COOKIE}=")
    assert "HttpOnly" in cookie
    assert "Secure" in cookie
    assert "SameSite=strict" in cookie
    # Envoyé seulement aux routes d'authentification
    assert "Path=/api/auth;" in cookie
    assert f"Max-Age={settings.refresh_token_expire_days * 24 * 3600}" in cookie
    # Le refresh token n'apparaît pas dans le corps de la réponse
    assert r.cookies[REFRESH_COOKIE] not in r.text


def test_refresh_returns_new_access_token_and_rotates_cookie(https_client, create_user):
    create_user("alice")
    _, first = login(https_client)

    r = https_client.post("/api/auth/refresh")

    assert r.status_code == 200
    body = r.json()
    assert body["expires_in"] == settings.access_token_expire_minutes * 60
    me = https_client.get(
        "/api/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"}
    )
    assert me.json()["username"] == "alice"
    second = r.cookies[REFRESH_COOKIE]
    assert second != first
    # Le client a gardé le nouveau cookie : un second renouvellement fonctionne
    assert https_client.post("/api/auth/refresh").status_code == 200


@pytest.mark.parametrize("token", [None, "", "inconnu"])
def test_refresh_rejects_missing_or_unknown_token(session_factory, token):
    r = refresh_with(token)
    assert r.status_code == 401
    assert r.json()["detail"] == "Session expirée, veuillez vous reconnecter"
    assert "access_token" not in r.json()


def test_failed_refresh_clears_cookie(session_factory):
    r = refresh_with("inconnu")
    assert f'{REFRESH_COOKIE}=""' in r.headers["set-cookie"]
    assert "Max-Age=0" in r.headers["set-cookie"]


def test_reused_refresh_token_revokes_the_whole_session(
    https_client, create_user, monkeypatch
):
    create_user("alice")
    _, stolen = login(https_client)
    assert https_client.post("/api/auth/refresh").status_code == 200
    legitimate = https_client.cookies[REFRESH_COOKIE]

    # Le token volé est présenté après le délai de grâce (négatif : l'horloge de Windows
    # avance par paliers, deux instants successifs peuvent être égaux)
    monkeypatch.setattr(session_service, "REUSE_GRACE", timedelta(seconds=-1))
    assert refresh_with(stolen).status_code == 401
    # La session entière est révoquée, y compris le token de l'utilisateur légitime
    assert refresh_with(legitimate).status_code == 401


def test_concurrent_refresh_within_grace_keeps_session(https_client, create_user):
    create_user("alice")
    _, first = login(https_client)
    assert https_client.post("/api/auth/refresh").status_code == 200
    current = https_client.cookies[REFRESH_COOKIE]

    # Deux onglets ont envoyé le même cookie : le second est refusé, sans révoquer la session
    assert refresh_with(first).status_code == 401
    assert refresh_with(current).status_code == 200


def test_logout_revokes_session_and_clears_cookie(https_client, create_user):
    create_user("alice")
    _, token = login(https_client)

    r = https_client.post("/api/auth/logout")

    assert r.status_code == 204
    assert "Max-Age=0" in r.headers["set-cookie"]
    assert refresh_with(token).status_code == 401


def test_logout_without_session_is_harmless(https_client):
    assert https_client.post("/api/auth/logout").status_code == 204


def test_logout_only_ends_the_current_session(create_user, session_factory):
    create_user("alice")
    _, laptop = login(TestClient(app, base_url=BASE_URL))
    _, phone = login(TestClient(app, base_url=BASE_URL))

    TestClient(app, base_url=BASE_URL).post(
        "/api/auth/logout", headers={"Cookie": f"{REFRESH_COOKIE}={laptop}"}
    )

    assert refresh_with(laptop).status_code == 401
    assert refresh_with(phone).status_code == 200


def test_refresh_rejects_deactivated_user(https_client, create_user, session_factory):
    user = create_user("alice")
    _, token = login(https_client)
    with session_factory() as db:
        db.get(type(user), user.id).is_active = False
        db.commit()

    assert refresh_with(token).status_code == 401


def test_refresh_rejects_expired_token(https_client, create_user, session_factory):
    create_user("alice")
    _, token = login(https_client)
    with session_factory() as db:
        record = db.scalar(select(RefreshTokenModel))
        record.expires_at = datetime.now(UTC) - timedelta(seconds=1)
        db.commit()

    assert refresh_with(token).status_code == 401


def test_refresh_token_is_stored_hashed(https_client, create_user, session_factory):
    create_user("alice")
    _, token = login(https_client)
    with session_factory() as db:
        record = db.scalar(select(RefreshTokenModel))
    assert record.token_hash != token
    assert record.token_hash == hash_refresh_token(token)


def test_end_all_logs_user_out_everywhere(create_user, session_factory):
    user = create_user("alice")
    tokens = [login(TestClient(app, base_url=BASE_URL))[1] for _ in range(2)]

    with session_factory() as db:
        assert SessionService(db).end_all(user.id) == 2

    for token in tokens:
        assert refresh_with(token).status_code == 401
