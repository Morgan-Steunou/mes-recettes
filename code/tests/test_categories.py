"""Catégories de plats créées par l'utilisateur, et catégorie des recettes."""
import pytest

# Caractère d'inversion du sens d'écriture (U+202E), écrit par son code pour rester visible
RLO = chr(0x202E)


@pytest.fixture(params=["sans comptes", "avec comptes"])
def client(request, anon_client):
    """Chaque test de ce fichier tourne dans les deux modes (AUTH_ENABLED=false puis true)."""
    if request.param == "avec comptes":
        return request.getfixturevalue("client_for")("alice")
    return anon_client


def category(client, name):
    r = client.post("/api/categories", json={"name": name})
    assert r.status_code == 201, r.text
    return r.json()


def recipe(client, title="Crêpes", **fields):
    r = client.post("/api/recipes", json={"title": title, **fields})
    assert r.status_code == 201, r.text
    return r.json()


def test_create_and_list_categories_alphabetically(client):
    assert client.get("/api/categories").json() == []
    plats = category(client, "  Plats  ")
    assert plats["name"] == "Plats"
    assert plats["recipe_count"] == 0
    category(client, "desserts")
    category(client, "Entrées")
    names = [c["name"] for c in client.get("/api/categories").json()]
    assert names == ["desserts", "Entrées", "Plats"]


def test_category_name_is_validated(client):
    assert client.post("/api/categories", json={"name": "   "}).status_code == 422
    assert client.post("/api/categories", json={"name": "x" * 51}).status_code == 422
    assert client.post("/api/categories", json={"name": f"Des{RLO}serts"}).status_code == 422
    assert client.post("/api/categories", json={"name": "A", "id": 3}).status_code == 422


def test_category_names_are_unique_ignoring_case(client):
    category(client, "Desserts")
    r = client.post("/api/categories", json={"name": "DESSERTS"})
    assert r.status_code == 409
    assert r.json()["detail"] == "Une catégorie porte déjà ce nom"


def test_recipe_with_category_and_counts(client):
    desserts = category(client, "Desserts")
    tarte = recipe(client, "Tarte", category_id=desserts["id"])
    assert tarte["category_id"] == desserts["id"]
    assert tarte["category"] == {"id": desserts["id"], "name": "Desserts"}
    recipe(client, "Mousse", category_id=desserts["id"])
    sans = recipe(client, "Omelette")
    assert sans["category_id"] is None and sans["category"] is None

    counts = {c["name"]: c["recipe_count"] for c in client.get("/api/categories").json()}
    assert counts == {"Desserts": 2}
    listed = {r["title"]: r["category"] for r in client.get("/api/recipes").json()}
    assert listed["Tarte"]["name"] == "Desserts"
    assert listed["Omelette"] is None


def test_change_and_remove_recipe_category(client):
    plats = category(client, "Plats")
    desserts = category(client, "Desserts")
    r = recipe(client, "Crumble", category_id=plats["id"])
    updated = client.put(
        f"/api/recipes/{r['id']}", json={"title": "Crumble", "category_id": desserts["id"]}
    ).json()
    assert updated["category"]["name"] == "Desserts"
    # PUT sans category_id : la recette n'a plus de catégorie
    cleared = client.put(f"/api/recipes/{r['id']}", json={"title": "Crumble"}).json()
    assert cleared["category"] is None


def test_unknown_category_is_refused(client):
    r = client.post("/api/recipes", json={"title": "Tarte", "category_id": 999})
    assert r.status_code == 422
    assert r.json()["detail"] == "Catégorie introuvable"
    tarte = recipe(client, "Tarte")
    r = client.put(f"/api/recipes/{tarte['id']}", json={"title": "Tarte", "category_id": 999})
    assert r.status_code == 422


def test_rename_category(client):
    desserts = category(client, "Desert")
    category(client, "Plats")
    tarte = recipe(client, "Tarte", category_id=desserts["id"])
    r = client.put(f"/api/categories/{desserts['id']}", json={"name": "Desserts"})
    assert r.status_code == 200
    assert r.json() == {"id": desserts["id"], "name": "Desserts", "recipe_count": 1}
    assert client.get(f"/api/recipes/{tarte['id']}").json()["category"]["name"] == "Desserts"
    # Changer seulement les majuscules de son propre nom est permis ; prendre un autre nom, non
    r = client.put(f"/api/categories/{desserts['id']}", json={"name": "DESSERTS"})
    assert r.status_code == 200
    r = client.put(f"/api/categories/{desserts['id']}", json={"name": "plats"})
    assert r.status_code == 409
    assert client.put("/api/categories/999", json={"name": "X"}).status_code == 404


def test_delete_category_keeps_its_recipes(client):
    desserts = category(client, "Desserts")
    tarte = recipe(client, "Tarte", category_id=desserts["id"])
    assert client.delete(f"/api/categories/{desserts['id']}").status_code == 204
    assert client.get("/api/categories").json() == []
    kept = client.get(f"/api/recipes/{tarte['id']}").json()
    assert kept["category_id"] is None and kept["category"] is None
    assert client.delete(f"/api/categories/{desserts['id']}").status_code == 404


def test_categories_are_private(client_for):
    alice = client_for("alice")
    bob = client_for("bob")
    desserts = category(alice, "Desserts")
    assert bob.get("/api/categories").json() == []
    # Bob ne peut ni voir, ni renommer, ni supprimer, ni utiliser la catégorie d'Alice
    assert bob.put(f"/api/categories/{desserts['id']}", json={"name": "X"}).status_code == 404
    assert bob.delete(f"/api/categories/{desserts['id']}").status_code == 404
    r = bob.post("/api/recipes", json={"title": "Tarte", "category_id": desserts["id"]})
    assert r.status_code == 422
    # Bob peut créer sa propre catégorie du même nom
    assert bob.post("/api/categories", json={"name": "Desserts"}).status_code == 201


def test_categories_require_login(enable_auth, anon_client):
    assert anon_client.get("/api/categories").status_code == 401
    assert anon_client.post("/api/categories", json={"name": "X"}).status_code == 401
