"""Comptes utilisateurs désactivés (AUTH_ENABLED=false, réglage par défaut) et réactivation."""
from app.core.config import settings
from app.models.item import ItemModel
from app.services.user_service import UserService
from tests.conftest import PASSWORD


def test_health_tells_the_interface_that_accounts_are_disabled(anon_client):
    assert anon_client.get("/api/health").json()["auth"] is False


def test_items_are_open_without_token(anon_client, session_factory):
    r = anon_client.post("/api/items", json={"name": "Tarte aux pommes"})
    assert r.status_code == 201
    assert [i["name"] for i in anon_client.get("/api/items").json()] == ["Tarte aux pommes"]

    # Item sans propriétaire
    with session_factory() as db:
        assert db.get(ItemModel, r.json()["id"]).owner_id is None


def test_auth_routes_are_hidden(anon_client, create_user):
    create_user("alice")
    r = anon_client.post("/api/auth/token", data={"username": "alice", "password": PASSWORD})
    assert r.status_code == 404
    assert anon_client.get("/api/auth/me").status_code == 404


def test_reenabling_accounts_protects_items_and_gives_them_to_the_first_account(
    anon_client, session_factory, request
):
    assert anon_client.post("/api/items", json={"name": "Créé sans compte"}).status_code == 201

    # client_for active les comptes (AUTH_ENABLED=true) et connecte alice
    alice = request.getfixturevalue("client_for")("alice")
    assert settings.auth_enabled
    assert anon_client.get("/api/health").json()["auth"] is True
    assert anon_client.get("/api/items").status_code == 401
    assert alice.get("/api/items").json() == []

    # Ce que fait la commande create-user pour le premier compte
    with session_factory() as db:
        service = UserService(db)
        assert service.claim_orphan_items(service.get_by_username("alice")) == 1
    assert [i["name"] for i in alice.get("/api/items").json()] == ["Créé sans compte"]
