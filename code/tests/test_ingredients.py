"""Ingrédients des recettes (étape 3) : saisie, ordre, remplacement, validation."""
import pytest

from app.models.recipe import IngredientModel

# Caractère d'inversion du sens d'écriture (U+202E), écrit par son code pour rester visible
RLO = chr(0x202E)

INGREDIENTS = [
    {"name": "Farine", "quantity": 250, "unit": "g"},
    {"name": "Œufs", "quantity": 3, "unit": None},
    {"name": "Lait", "quantity": 0.5, "unit": "l"},
    {"name": "Sel", "quantity": None, "unit": None},
]


@pytest.fixture(params=["sans comptes", "avec comptes"])
def client(request, anon_client):
    """Chaque test de ce fichier tourne dans les deux modes (AUTH_ENABLED=false puis true)."""
    if request.param == "avec comptes":
        return request.getfixturevalue("client_for")("alice")
    return anon_client


def create(client, **fields):
    r = client.post("/api/recipes", json={"title": "Crêpes", **fields})
    assert r.status_code == 201, r.text
    return r.json()


def test_recipe_without_ingredients_has_empty_list(client):
    assert create(client)["ingredients"] == []


def test_ingredients_are_saved_in_order(client):
    recipe = create(client, ingredients=INGREDIENTS)
    assert recipe["ingredients"] == INGREDIENTS
    assert client.get(f"/api/recipes/{recipe['id']}").json()["ingredients"] == INGREDIENTS
    assert client.get("/api/recipes").json()[0]["ingredients"] == INGREDIENTS


def test_update_replaces_the_ingredient_list(client, session_factory):
    recipe = create(client, ingredients=INGREDIENTS)
    new_list = [{"name": "Sucre", "quantity": 50, "unit": "g"}, INGREDIENTS[0]]

    body = {"title": "Crêpes", "ingredients": new_list}
    r = client.put(f"/api/recipes/{recipe['id']}", json=body)
    assert r.status_code == 200
    assert r.json()["ingredients"] == new_list
    assert r.json()["updated_at"] >= recipe["updated_at"]

    # Les anciennes lignes sont supprimées, pas seulement détachées
    with session_factory() as db:
        assert db.query(IngredientModel).count() == 2

    # PUT remplace toute la recette : sans liste, la recette n'a plus d'ingrédients
    r = client.put(f"/api/recipes/{recipe['id']}", json={"title": "Crêpes"})
    assert r.json()["ingredients"] == []


def test_deleting_a_recipe_deletes_its_ingredients(client, session_factory):
    recipe = create(client, ingredients=INGREDIENTS)
    create(client, ingredients=[INGREDIENTS[0]])
    assert client.delete(f"/api/recipes/{recipe['id']}").status_code == 204
    with session_factory() as db:
        assert db.query(IngredientModel).count() == 1


def test_ingredient_text_is_cleaned(client):
    recipe = create(client, ingredients=[{"name": "  Beurre  ", "quantity": 1.5, "unit": "   "}])
    assert recipe["ingredients"] == [{"name": "Beurre", "quantity": 1.5, "unit": None}]


@pytest.mark.parametrize(
    "ingredient",
    [
        {},  # nom obligatoire
        {"name": "   "},
        {"name": "a" * 101},
        {"name": "ligne 1\nligne 2"},
        {"name": "abc" + RLO + "def"},
        {"name": "ok", "unit": "u" * 31},
        {"name": "ok", "unit": "g\x00"},
        {"name": "ok", "quantity": 0},
        {"name": "ok", "quantity": -2},
        {"name": "ok", "quantity": 100001},
        {"name": "ok", "quantity": "beaucoup"},
        {"name": "ok", "position": 3},  # champ inconnu
        {"name": "ok", "id": 1},
    ],
)
def test_invalid_ingredient_rejected(client, ingredient):
    body = {"title": "ok", "ingredients": [ingredient]}
    assert client.post("/api/recipes", json=body).status_code == 422
    recipe_id = create(client)["id"]
    assert client.put(f"/api/recipes/{recipe_id}", json=body).status_code == 422


def test_quantity_cannot_be_infinite_or_nan(client):
    # Envoyés en JSON brut : Infinity et NaN ne sont pas du JSON standard
    for value in ("Infinity", "NaN"):
        r = client.post(
            "/api/recipes",
            content='{"title": "ok", "ingredients": [{"name": "x", "quantity": ' + value + "}]}",
            headers={"Content-Type": "application/json"},
        )
        assert r.status_code == 422, value
        assert r.json()["detail"][0]["loc"] == ["body", "ingredients", 0, "quantity"]
        assert "input" not in r.json()["detail"][0]


def test_ingredient_count_is_limited(client):
    many = [{"name": f"Ingrédient {i}"} for i in range(101)]
    assert client.post("/api/recipes", json={"title": "ok", "ingredients": many}).status_code == 422
    assert len(create(client, ingredients=many[:100])["ingredients"]) == 100


def test_ingredients_must_be_a_list(client):
    body = {"title": "ok", "ingredients": {"name": "Farine"}}
    assert client.post("/api/recipes", json=body).status_code == 422


def test_users_only_see_their_own_ingredients(client_for):
    alice = client_for("alice")
    bob = client_for("bob")
    recipe = alice.post(
        "/api/recipes", json={"title": "Secret", "ingredients": [{"name": "Truffe"}]}
    ).json()
    assert bob.get(f"/api/recipes/{recipe['id']}").status_code == 404
    assert bob.get("/api/recipes").json() == []
    # Bob ne peut pas remplacer les ingrédients d'Alice
    r = bob.put(f"/api/recipes/{recipe['id']}", json={"title": "x", "ingredients": []})
    assert r.status_code == 404
    assert alice.get(f"/api/recipes/{recipe['id']}").json()["ingredients"][0]["name"] == "Truffe"
