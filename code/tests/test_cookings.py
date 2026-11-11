"""Historique des repas (étape 5) : « je l'ai cuisinée », note, commentaire, résumé."""
from datetime import date, timedelta

import pytest

from app.models.cooking import CookingModel

# Caractère d'inversion du sens d'écriture (U+202E), écrit par son code pour rester visible
RLO = chr(0x202E)


@pytest.fixture(params=["sans comptes", "avec comptes"])
def client(request, anon_client):
    """Chaque test de ce fichier tourne dans les deux modes (AUTH_ENABLED=false puis true)."""
    if request.param == "avec comptes":
        return request.getfixturevalue("client_for")("alice")
    return anon_client


def recipe(client, title="Crêpes"):
    r = client.post("/api/recipes", json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def cook(client, recipe_id, /, **fields):
    # recipe_id positionnel uniquement : un test envoie aussi un champ « recipe_id »
    return client.post(f"/api/recipes/{recipe_id}/cookings", json=fields)


def test_cooked_today_by_default(client):
    recipe_id = recipe(client)
    r = cook(client, recipe_id)
    assert r.status_code == 201
    body = r.json()
    assert body["recipe_id"] == recipe_id
    assert body["cooked_on"] == date.today().isoformat()
    assert body["rating"] is None and body["comment"] is None


def test_cooking_with_date_rating_and_comment(client):
    recipe_id = recipe(client)
    r = cook(client, recipe_id, cooked_on="2026-10-02", rating=4, comment="  Un peu trop salé  ")
    assert r.status_code == 201
    assert r.json()["cooked_on"] == "2026-10-02"
    assert r.json()["rating"] == 4
    assert r.json()["comment"] == "Un peu trop salé"
    # Commentaire vide : enregistré comme absent
    assert cook(client, recipe_id, comment="   ").json()["comment"] is None


def test_history_is_listed_most_recent_first(client):
    recipe_id = recipe(client)
    for day in ("2026-09-01", "2026-11-01", "2026-10-01"):
        cook(client, recipe_id, cooked_on=day)
    # Deux repas le même jour : le dernier saisi d'abord
    second = cook(client, recipe_id, cooked_on="2026-11-01").json()

    history = client.get(f"/api/recipes/{recipe_id}/cookings").json()
    assert [c["cooked_on"] for c in history] == [
        "2026-11-01",
        "2026-11-01",
        "2026-10-01",
        "2026-09-01",
    ]
    assert history[0]["id"] == second["id"]


def test_recipe_shows_count_and_last_cooked_date(client):
    cooked = recipe(client, "Cuisinée")
    never = recipe(client, "Jamais faite")
    cook(client, cooked, cooked_on="2026-09-15")
    cook(client, cooked, cooked_on="2026-10-20")
    cook(client, cooked, cooked_on="2026-08-01")

    detail = client.get(f"/api/recipes/{cooked}").json()
    assert detail["cooked_count"] == 3
    assert detail["last_cooked_on"] == "2026-10-20"

    by_title = {r["title"]: r for r in client.get("/api/recipes").json()}
    assert by_title["Cuisinée"]["cooked_count"] == 3
    assert by_title["Cuisinée"]["last_cooked_on"] == "2026-10-20"
    assert by_title["Jamais faite"]["cooked_count"] == 0
    assert by_title["Jamais faite"]["last_cooked_on"] is None
    assert client.get(f"/api/recipes/{never}").json()["cooked_count"] == 0


def test_summary_cannot_be_written_through_the_recipe(client):
    recipe_id = recipe(client)
    body = {"title": "x", "cooked_count": 99}
    assert client.post("/api/recipes", json=body).status_code == 422
    assert client.put(f"/api/recipes/{recipe_id}", json=body).status_code == 422


def test_updating_the_recipe_keeps_its_history(client):
    recipe_id = recipe(client)
    cook(client, recipe_id)
    r = client.put(f"/api/recipes/{recipe_id}", json={"title": "Renommée"})
    assert r.json()["cooked_count"] == 1
    assert len(client.get(f"/api/recipes/{recipe_id}/cookings").json()) == 1


def test_delete_a_cooking(client):
    recipe_id = recipe(client)
    kept = cook(client, recipe_id, cooked_on="2026-10-01").json()
    mistake = cook(client, recipe_id).json()

    url = f"/api/recipes/{recipe_id}/cookings/{mistake['id']}"
    assert client.delete(url).status_code == 204
    assert client.delete(url).status_code == 404
    history = client.get(f"/api/recipes/{recipe_id}/cookings").json()
    assert [c["id"] for c in history] == [kept["id"]]
    assert client.get(f"/api/recipes/{recipe_id}").json()["last_cooked_on"] == "2026-10-01"


def test_cooking_of_another_recipe_cannot_be_deleted_through_this_one(client):
    first = recipe(client, "Première")
    second = recipe(client, "Seconde")
    cooking = cook(client, first).json()
    r = client.delete(f"/api/recipes/{second}/cookings/{cooking['id']}")
    assert r.status_code == 404
    assert len(client.get(f"/api/recipes/{first}/cookings").json()) == 1


def test_deleting_a_recipe_deletes_its_history(client, session_factory):
    recipe_id = recipe(client)
    other = recipe(client, "Autre")
    cook(client, recipe_id)
    cook(client, recipe_id)
    cook(client, other)
    assert client.delete(f"/api/recipes/{recipe_id}").status_code == 204
    with session_factory() as db:
        assert db.query(CookingModel).count() == 1


def test_unknown_recipe_returns_404(client):
    assert client.get("/api/recipes/999/cookings").status_code == 404
    assert cook(client, 999).status_code == 404
    assert client.delete("/api/recipes/999/cookings/1").status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"rating": 0},
        {"rating": 6},
        {"rating": 2.5},
        {"rating": "4"},  # nombre attendu, pas du texte
        {"rating": True},
        {"cooked_on": "pas une date"},
        {"cooked_on": "2026-13-01"},
        {"cooked_on": "1899-12-31"},
        {"cooked_on": (date.today() + timedelta(days=2)).isoformat()},  # dans le futur
        {"comment": "a" * 1001},
        {"comment": "Très bon" + RLO},
        {"comment": "bip\x07"},
        {"id": 3},  # champ inconnu
        {"recipe_id": 2},
    ],
)
def test_invalid_cooking_rejected(client, body):
    recipe_id = recipe(client)
    assert cook(client, recipe_id, **body).status_code == 422
    assert client.get(f"/api/recipes/{recipe_id}").json()["cooked_count"] == 0


def test_tomorrow_is_tolerated_for_time_zones(client):
    recipe_id = recipe(client)
    tomorrow = (date.today() + timedelta(days=1)).isoformat()
    assert cook(client, recipe_id, cooked_on=tomorrow).status_code == 201


def test_multiline_comment_is_kept(client):
    recipe_id = recipe(client)
    r = cook(client, recipe_id, comment="Ligne 1\nLigne 2")
    assert r.json()["comment"] == "Ligne 1\nLigne 2"


def test_users_only_see_their_own_history(client_for):
    alice = client_for("alice")
    bob = client_for("bob")
    recipe_id = recipe(alice)
    cooking = cook(alice, recipe_id, rating=5).json()

    assert bob.get(f"/api/recipes/{recipe_id}/cookings").status_code == 404
    assert cook(bob, recipe_id).status_code == 404
    assert bob.delete(f"/api/recipes/{recipe_id}/cookings/{cooking['id']}").status_code == 404
    assert len(alice.get(f"/api/recipes/{recipe_id}/cookings").json()) == 1
