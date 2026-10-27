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


def test_items_crud(client):
    r = client.post("/api/items", json={"name": "Premier item"})
    assert r.status_code == 201
    item_id = r.json()["id"]

    assert client.get(f"/api/items/{item_id}").json()["name"] == "Premier item"
    assert client.delete(f"/api/items/{item_id}").status_code == 204
    assert client.get(f"/api/items/{item_id}").status_code == 404


def test_item_update(client):
    item_id = client.post("/api/items", json={"name": "Avant"}).json()["id"]

    r = client.put(f"/api/items/{item_id}", json={"name": "Après", "description": "Modifié"})
    assert r.status_code == 200
    assert r.json() == {"id": item_id, "name": "Après", "description": "Modifié"}
    assert client.get(f"/api/items/{item_id}").json()["name"] == "Après"

    assert client.put(f"/api/items/{item_id}", json={"name": ""}).status_code == 422
    assert client.put("/api/items/999", json={"name": "X"}).status_code == 404


@pytest.mark.parametrize(
    "body",
    [
        {"name": "   "},  # espaces uniquement
        {"name": "a" * 101},
        {"name": "abc\x00def"},  # caractère de contrôle
        {"name": "rouge\x1b[31m"},  # séquence ANSI (injection dans les logs)
        {"name": "abc\u202edef"},  # inversion du sens d'écriture
        {"name": "ligne 1\nligne 2"},  # pas de retour à la ligne dans le nom
        {"name": "ok", "description": "a" * 1001},
        {"name": "ok", "description": "a\x07"},
        {"name": "ok", "id": 42},  # champ inconnu
    ],
)
def test_item_invalid_text_rejected(client, body):
    assert client.post("/api/items", json=body).status_code == 422
    item_id = client.post("/api/items", json={"name": "Valide"}).json()["id"]
    assert client.put(f"/api/items/{item_id}", json=body).status_code == 422


def test_item_text_is_cleaned_and_stored_verbatim(client):
    r = client.post(
        "/api/items",
        json={"name": "  <script>alert(1)</script>  ", "description": "Ligne 1\nLigne 2"},
    )
    assert r.status_code == 201
    # Espaces retirés ; le HTML est stocké tel quel (échappé à l'affichage par Vue)
    assert r.json()["name"] == "<script>alert(1)</script>"
    assert r.json()["description"] == "Ligne 1\nLigne 2"

    r = client.post("/api/items", json={"name": "x'); DROP TABLE items;--"})
    assert r.status_code == 201
    assert len(client.get("/api/items").json()) == 2


def test_items_list(client):
    client.post("/api/items", json={"name": "A"})
    client.post("/api/items", json={"name": "B", "description": "Détail"})

    items = client.get("/api/items").json()
    assert [i["name"] for i in items] == ["A", "B"]
    assert items[1]["description"] == "Détail"


def test_index_page(client):
    r = client.get("/")
    assert r.status_code == 200
    assert "<html" in r.text


def test_email_template():
    html = render("emails/welcome.html", user_name="Morgan")
    assert "Morgan" in html
