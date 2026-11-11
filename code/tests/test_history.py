"""Historique global des repas (étape 6) : toutes recettes, période, pagination."""
import pytest


@pytest.fixture(params=["sans comptes", "avec comptes"])
def client(request, anon_client):
    """Chaque test de ce fichier tourne dans les deux modes (AUTH_ENABLED=false puis true)."""
    if request.param == "avec comptes":
        return request.getfixturevalue("client_for")("alice")
    return anon_client


def recipe(client, title):
    r = client.post("/api/recipes", json={"title": title})
    assert r.status_code == 201, r.text
    return r.json()["id"]


def cook(client, recipe_id, cooked_on, /, **fields):
    r = client.post(
        f"/api/recipes/{recipe_id}/cookings", json={"cooked_on": cooked_on, **fields}
    )
    assert r.status_code == 201, r.text
    return r.json()


@pytest.fixture
def meals(client):
    """Cinq repas sur trois recettes, de septembre à novembre 2026."""
    crepes = recipe(client, "Crêpes")
    risotto = recipe(client, "Risotto")
    soupe = recipe(client, "Soupe")
    cook(client, crepes, "2026-09-10", rating=5)
    cook(client, risotto, "2026-10-05", comment="Trop de parmesan")
    cook(client, crepes, "2026-10-20")
    cook(client, soupe, "2026-11-01", rating=3)
    cook(client, crepes, "2026-11-02")
    return {"crepes": crepes, "risotto": risotto, "soupe": soupe}


def history(client, **params):
    r = client.get("/api/cookings", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_empty_history(client):
    assert history(client) == {"items": [], "total": 0, "recipe_count": 0}


def test_all_meals_most_recent_first_with_recipe_title(client, meals):
    page = history(client)
    assert page["total"] == 5
    assert page["recipe_count"] == 3
    assert [(m["cooked_on"], m["recipe_title"]) for m in page["items"]] == [
        ("2026-11-02", "Crêpes"),
        ("2026-11-01", "Soupe"),
        ("2026-10-20", "Crêpes"),
        ("2026-10-05", "Risotto"),
        ("2026-09-10", "Crêpes"),
    ]
    soupe = page["items"][1]
    assert soupe["recipe_id"] == meals["soupe"]
    assert soupe["rating"] == 3
    assert page["items"][3]["comment"] == "Trop de parmesan"


def test_period_filter_includes_both_bounds(client, meals):
    page = history(client, since="2026-10-05", until="2026-11-01")
    assert [m["cooked_on"] for m in page["items"]] == ["2026-11-01", "2026-10-20", "2026-10-05"]
    assert page["total"] == 3
    assert page["recipe_count"] == 3

    assert history(client, since="2026-11-01")["total"] == 2
    october = history(client, since="2026-10-01", until="2026-10-31")
    assert october["total"] == 2
    assert october["recipe_count"] == 2
    assert history(client, until="2026-09-30")["total"] == 1
    assert history(client, since="2027-01-01")["items"] == []


def test_pagination_keeps_totals_of_the_whole_period(client, meals):
    first = history(client, limit=2)
    second = history(client, limit=2, offset=2)
    last = history(client, limit=2, offset=4)
    assert [m["cooked_on"] for m in first["items"]] == ["2026-11-02", "2026-11-01"]
    assert [m["cooked_on"] for m in second["items"]] == ["2026-10-20", "2026-10-05"]
    assert [m["cooked_on"] for m in last["items"]] == ["2026-09-10"]
    assert first["total"] == second["total"] == last["total"] == 5
    assert history(client, offset=10)["items"] == []


def test_renamed_recipe_shows_its_new_title(client, meals):
    client.put(f"/api/recipes/{meals['soupe']}", json={"title": "Velouté"})
    titles = {m["recipe_title"] for m in history(client)["items"]}
    assert titles == {"Crêpes", "Risotto", "Velouté"}


def test_deleted_recipe_leaves_the_history(client, meals):
    assert client.delete(f"/api/recipes/{meals['crepes']}").status_code == 204
    page = history(client)
    assert page["total"] == 2
    assert {m["recipe_title"] for m in page["items"]} == {"Risotto", "Soupe"}


@pytest.mark.parametrize(
    "params",
    [
        {"since": "pas une date"},
        {"until": "2026-02-30"},
        {"since": "2026-11-02", "until": "2026-11-01"},  # début après la fin
        {"limit": 0},
        {"limit": 201},
        {"limit": "beaucoup"},
        {"offset": -1},
    ],
)
def test_invalid_parameters_rejected(client, params):
    assert client.get("/api/cookings", params=params).status_code == 422


def test_start_after_end_has_a_readable_message(client):
    r = client.get("/api/cookings", params={"since": "2026-11-02", "until": "2026-11-01"})
    assert r.json()["detail"] == "La date de début doit précéder la date de fin"


def test_users_only_see_their_own_meals(client_for):
    alice = client_for("alice")
    bob = client_for("bob")
    cook(alice, recipe(alice, "Recette d'Alice"), "2026-10-01")
    cook(bob, recipe(bob, "Recette de Bob"), "2026-10-02")

    assert [m["recipe_title"] for m in history(alice)["items"]] == ["Recette d'Alice"]
    assert [m["recipe_title"] for m in history(bob)["items"]] == ["Recette de Bob"]
    assert history(alice)["total"] == 1


def test_history_requires_a_token_when_accounts_are_enabled(enable_auth, anon_client):
    assert anon_client.get("/api/cookings").status_code == 401
