from datetime import UTC, datetime, timedelta

import jwt
import pytest

from app.core.config import settings
from tests.conftest import PASSWORD


def bearer(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(autouse=True)
def auth_enabled(enable_auth):
    """Tous les tests de ce fichier portent sur les comptes : AUTH_ENABLED=true."""


def make_token(payload: dict, key: str | None = None, algorithm: str = "HS256") -> str:
    return jwt.encode(payload, key or settings.secret_key, algorithm=algorithm)


# --- Connexion --------------------------------------------------------------------------


def test_login_returns_bearer_token(anon_client, create_user):
    create_user("alice")
    r = anon_client.post("/api/auth/token", data={"username": "alice", "password": PASSWORD})

    assert r.status_code == 200
    body = r.json()
    assert body["token_type"] == "bearer"
    assert body["expires_in"] == settings.access_token_expire_minutes * 60

    me = anon_client.get("/api/auth/me", headers=bearer(body["access_token"]))
    assert me.status_code == 200
    assert me.json() == {"id": me.json()["id"], "username": "alice", "is_active": True}


def test_login_is_case_insensitive_on_username(anon_client, create_user):
    create_user("alice")
    r = anon_client.post("/api/auth/token", data={"username": "ALICE", "password": PASSWORD})
    assert r.status_code == 200


@pytest.mark.parametrize(
    "username, password",
    [("alice", "mauvais-mot-de-passe"), ("inconnu", PASSWORD), ("alice", "")],
)
def test_login_rejects_bad_credentials_with_same_message(
    anon_client, create_user, username, password
):
    create_user("alice")
    r = anon_client.post("/api/auth/token", data={"username": username, "password": password})

    assert r.status_code in (401, 422)
    if r.status_code == 401:
        # Message identique que le compte existe ou non
        assert r.json()["detail"] == "Identifiant ou mot de passe incorrect"
        assert "access_token" not in r.json()


def test_login_rejects_inactive_user(anon_client, create_user):
    create_user("bob", is_active=False)
    r = anon_client.post("/api/auth/token", data={"username": "bob", "password": PASSWORD})
    assert r.status_code == 401


def test_password_is_hashed_in_database(session_factory, create_user):
    user = create_user("alice")
    assert user.hashed_password != PASSWORD
    assert user.hashed_password.startswith("$argon2")


# --- Accès aux routes protégées ---------------------------------------------------------


@pytest.mark.parametrize(
    "method, path",
    [("get", "/api/recipes"), ("post", "/api/recipes"), ("get", "/api/recipes/1"),
     ("put", "/api/recipes/1"), ("delete", "/api/recipes/1"), ("get", "/api/auth/me")],
)
def test_protected_routes_require_token(anon_client, method, path):
    r = getattr(anon_client, method)(path)
    assert r.status_code == 401
    assert r.headers["www-authenticate"] == "Bearer"


def test_public_routes_stay_open(anon_client):
    assert anon_client.get("/api/health").status_code == 200
    assert anon_client.get("/").status_code == 200


def test_rejects_invalid_tokens(anon_client, create_user):
    user = create_user("alice")
    now = datetime.now(UTC)
    valid = {"sub": str(user.id), "type": "access", "iat": now, "exp": now + timedelta(minutes=5)}

    bad_tokens = {
        "texte quelconque": "pas-un-token",
        "autre clé": make_token(valid, key="une-autre-cle-secrete-" + "y" * 32),
        "expiré": make_token(
            {**valid, "iat": now - timedelta(hours=2), "exp": now - timedelta(hours=1)}
        ),
        "sans expiration": make_token({k: v for k, v in valid.items() if k != "exp"}),
        "mauvais type": make_token({**valid, "type": "refresh"}),
        "utilisateur inexistant": make_token({**valid, "sub": "999"}),
        "alg none": jwt.encode(valid, None, algorithm="none"),
    }
    for label, token in bad_tokens.items():
        r = anon_client.get("/api/recipes", headers=bearer(token))
        assert r.status_code == 401, label


def test_token_stops_working_when_user_is_deactivated(client, session_factory):
    from app.models.user import UserModel

    assert client.get("/api/recipes").status_code == 200
    with session_factory() as db:
        db.query(UserModel).filter_by(username="alice").update({"is_active": False})
        db.commit()
    assert client.get("/api/recipes").status_code == 401


# --- Isolation entre utilisateurs -------------------------------------------------------


def test_users_only_see_their_own_recipes(client_for):
    alice = client_for("alice")
    bob = client_for("bob")
    recipe_id = alice.post("/api/recipes", json={"title": "Recette d'Alice"}).json()["id"]
    bob.post("/api/recipes", json={"title": "Recette de Bob"})

    assert [r["title"] for r in alice.get("/api/recipes").json()] == ["Recette d'Alice"]
    assert [r["title"] for r in bob.get("/api/recipes").json()] == ["Recette de Bob"]

    # Bob ne peut ni lire, ni modifier, ni supprimer la recette d'Alice :
    # elle « n'existe pas » pour lui
    assert bob.get(f"/api/recipes/{recipe_id}").status_code == 404
    assert bob.put(f"/api/recipes/{recipe_id}", json={"title": "Piraté"}).status_code == 404
    assert bob.delete(f"/api/recipes/{recipe_id}").status_code == 404
    assert alice.get(f"/api/recipes/{recipe_id}").json()["title"] == "Recette d'Alice"


def test_owner_cannot_be_forced_through_payload(client):
    r = client.post("/api/recipes", json={"title": "ok", "owner_id": 999})
    assert r.status_code == 422


def test_app_refuses_to_start_without_secret_key(monkeypatch):
    from pydantic import ValidationError

    from app.core.config import Settings

    monkeypatch.delenv("SECRET_KEY", raising=False)
    with pytest.raises(ValidationError):
        Settings(_env_file=None)
    with pytest.raises(ValidationError):
        Settings(_env_file=None, secret_key="trop-courte")


def test_first_account_claims_recipes_created_before_authentication(session_factory, client_for):
    from app.models.recipe import RecipeModel
    from app.services.user_service import UserService

    # Recette créée avant l'authentification : sans propriétaire, invisible pour tous
    with session_factory() as db:
        db.add(RecipeModel(title="Ancienne recette"))
        db.commit()
    alice = client_for("alice")
    assert alice.get("/api/recipes").json() == []

    with session_factory() as db:
        service = UserService(db)
        assert service.claim_orphan_recipes(service.get_by_username("alice")) == 1
    assert [r["title"] for r in alice.get("/api/recipes").json()] == ["Ancienne recette"]
