import pytest

from app.core.templating import render


@pytest.fixture(params=["sans comptes", "avec comptes"])
def client(request, anon_client):
    """Chaque test de ce fichier tourne dans les deux modes (AUTH_ENABLED=false puis true)."""
    if request.param == "avec comptes":
        return request.getfixturevalue("client_for")("alice")
    return anon_client


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


FULL_RECIPE = {
    "title": "Tarte aux pommes",
    "description": "La recette de grand-mère",
    "servings": 6,
    "prep_time_minutes": 20,
    "cook_time_minutes": 35,
    "steps": "Étaler la pâte\nDisposer les pommes\nCuire 35 min à 180 °C",
}


def test_recipes_crud(client):
    r = client.post("/api/recipes", json={"title": "Première recette"})
    assert r.status_code == 201
    recipe = r.json()
    # Champs facultatifs vides, dates fixées par le serveur
    assert recipe["description"] is None and recipe["servings"] is None
    assert recipe["created_at"] and recipe["updated_at"]

    assert client.get(f"/api/recipes/{recipe['id']}").json()["title"] == "Première recette"
    assert client.delete(f"/api/recipes/{recipe['id']}").status_code == 204
    assert client.get(f"/api/recipes/{recipe['id']}").status_code == 404
    assert client.delete(f"/api/recipes/{recipe['id']}").status_code == 404


def test_recipe_with_all_fields(client):
    r = client.post("/api/recipes", json=FULL_RECIPE)
    assert r.status_code == 201
    body = r.json()
    assert {k: body[k] for k in FULL_RECIPE} == FULL_RECIPE
    assert client.get(f"/api/recipes/{body['id']}").json() == body


def test_recipe_update(client):
    created = client.post("/api/recipes", json={"title": "Avant"}).json()

    r = client.put(f"/api/recipes/{created['id']}", json=FULL_RECIPE)
    assert r.status_code == 200
    body = r.json()
    assert {k: body[k] for k in FULL_RECIPE} == FULL_RECIPE
    assert body["id"] == created["id"]
    assert body["created_at"] == created["created_at"]

    # PUT remplace la recette : les champs absents sont vidés
    body = client.put(f"/api/recipes/{created['id']}", json={"title": "Après"}).json()
    assert body["title"] == "Après" and body["steps"] is None

    assert client.put(f"/api/recipes/{created['id']}", json={"title": ""}).status_code == 422
    assert client.put("/api/recipes/999", json={"title": "X"}).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {},  # titre obligatoire
        {"title": "   "},  # espaces uniquement
        {"title": "a" * 151},
        {"title": "abc\x00def"},  # caractère de contrôle
        {"title": "rouge\x1b[31m"},  # séquence ANSI (injection dans les logs)
        {"title": "abc\u202edef"},  # inversion du sens d'écriture
        {"title": "ligne 1\nligne 2"},  # pas de retour à la ligne dans le titre
        {"title": "ok", "description": "a" * 2001},
        {"title": "ok", "description": "a\x07"},
        {"title": "ok", "steps": "a" * 10001},
        {"title": "ok", "steps": "Étape\u202e"},
        {"title": "ok", "servings": 0},
        {"title": "ok", "servings": 101},
        {"title": "ok", "servings": "beaucoup"},
        {"title": "ok", "servings": 2.5},
        {"title": "ok", "prep_time_minutes": -1},
        {"title": "ok", "cook_time_minutes": 1441},
        {"title": "ok", "id": 42},  # champ inconnu
        {"title": "ok", "created_at": "2020-01-01T00:00:00Z"},  # date gérée par le serveur
    ],
)
def test_recipe_invalid_fields_rejected(client, body):
    assert client.post("/api/recipes", json=body).status_code == 422
    recipe_id = client.post("/api/recipes", json={"title": "Valide"}).json()["id"]
    assert client.put(f"/api/recipes/{recipe_id}", json=body).status_code == 422


def test_recipe_text_is_cleaned_and_stored_verbatim(client):
    r = client.post(
        "/api/recipes",
        json={
            "title": "  <script>alert(1)</script>  ",
            "description": "Ligne 1\nLigne 2",
            "steps": "\tMélanger\r\nCuire  ",
        },
    )
    assert r.status_code == 201
    # Espaces retirés ; le HTML est stocké tel quel (échappé à l'affichage par Vue)
    assert r.json()["title"] == "<script>alert(1)</script>"
    assert r.json()["description"] == "Ligne 1\nLigne 2"
    assert r.json()["steps"] == "Mélanger\r\nCuire"

    r = client.post("/api/recipes", json={"title": "x'); DROP TABLE recipes;--"})
    assert r.status_code == 201
    assert len(client.get("/api/recipes").json()) == 2


def test_recipes_list(client):
    client.post("/api/recipes", json={"title": "A"})
    client.post("/api/recipes", json={"title": "B", "description": "Détail"})

    recipes = client.get("/api/recipes").json()
    assert [r["title"] for r in recipes] == ["A", "B"]
    assert recipes[1]["description"] == "Détail"


def test_index_page(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "<html" in r.text


def test_email_template():
    html = render("emails/welcome.html", user_name="Morgan")
    assert "Morgan" in html
