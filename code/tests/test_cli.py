"""Commandes d'administration (python -m app.cli) : création de compte, sessions, migrations."""
import io
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app import cli
from app.api.routes.auth import REFRESH_COOKIE
from app.core.security import verify_password
from app.main import app
from app.models.recipe import RecipeModel
from app.models.user import UserModel
from tests.conftest import PASSWORD


@pytest.fixture
def run_cli(session_factory, monkeypatch, capsys):
    """Lance la CLI comme en ligne de commande, sur la base de test.

    Renvoie (code de sortie, sortie). Les migrations sont remplacées par un compteur : la base
    de test est déjà prête (SQLite) ou migrée par les fixtures (PostgreSQL).
    """
    migrations = []
    monkeypatch.setattr(cli, "SessionLocal", session_factory)
    monkeypatch.setattr(cli, "init_db", lambda: migrations.append(1))

    def _run(*args: str, stdin: str = "") -> tuple[int, str]:
        monkeypatch.setattr(sys, "argv", ["python -m app.cli", *args])
        monkeypatch.setattr(sys, "stdin", io.StringIO(stdin))
        try:
            cli.main()
            code = 0
        except SystemExit as e:
            # sys.exit("message") : le message part sur la sortie d'erreur, code 1
            code = e.code if isinstance(e.code, int) else 1
            if isinstance(e.code, str):
                print(e.code, file=sys.stderr)
        out = capsys.readouterr()
        return code, out.out + out.err

    _run.migrations = migrations
    return _run


def test_create_user_from_stdin(run_cli, session_factory):
    code, out = run_cli("create-user", "alice", "--password-stdin", stdin=f"{PASSWORD}\n")

    assert code == 0
    assert "Compte « alice » créé" in out
    with session_factory() as db:
        user = db.scalar(select(UserModel).where(UserModel.username == "alice"))
    assert verify_password(PASSWORD, user.hashed_password)
    assert run_cli.migrations  # migrations appliquées avant la création


def test_create_user_asks_password_twice(run_cli, monkeypatch):
    answers = iter([PASSWORD, PASSWORD])
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: next(answers))
    code, out = run_cli("create-user", "alice")
    assert code == 0 and "créé" in out


def test_create_user_rejects_mismatched_confirmation(run_cli, monkeypatch):
    answers = iter([PASSWORD, "autre-mot-de-passe"])
    monkeypatch.setattr(cli.getpass, "getpass", lambda _prompt: next(answers))
    code, out = run_cli("create-user", "alice")
    assert code == 1 and "ne correspondent pas" in out


@pytest.mark.parametrize(
    "username, password, message",
    [("alice", "court", "password"), ("a", PASSWORD, "username"), ("al ice", PASSWORD, "username")],
)
def test_create_user_rejects_invalid_data(run_cli, username, password, message):
    code, out = run_cli("create-user", username, "--password-stdin", stdin=password)
    assert code == 1
    assert "Données invalides" in out and message in out


def test_create_user_refuses_duplicate(run_cli, create_user):
    create_user("alice")
    code, out = run_cli("create-user", "ALICE", "--password-stdin", stdin=PASSWORD)
    assert code == 1 and "déjà utilisé" in out


def test_create_user_if_not_exists_is_idempotent(run_cli, create_user, session_factory):
    create_user("alice")
    code, out = run_cli(
        "create-user", "alice", "--password-stdin", "--if-not-exists", stdin="nouveau-mot-de-passe"
    )
    assert code == 0 and "existe déjà" in out
    # Le mot de passe n'est pas modifié
    with session_factory() as db:
        user = db.scalar(select(UserModel).where(UserModel.username == "alice"))
    assert verify_password(PASSWORD, user.hashed_password)


def test_first_account_claims_orphan_recipes(run_cli, session_factory):
    with session_factory() as db:
        db.add_all([RecipeModel(title="Ancienne 1"), RecipeModel(title="Ancienne 2")])
        db.commit()

    code, out = run_cli("create-user", "alice", "--password-stdin", stdin=PASSWORD)

    assert code == 0 and "2 recette(s) existante(s) rattachée(s)" in out
    with session_factory() as db:
        assert db.scalar(select(RecipeModel).where(RecipeModel.owner_id.is_(None))) is None


def test_revoke_sessions_logs_user_out(enable_auth, run_cli, create_user):
    create_user("alice")
    client = TestClient(app, base_url="https://testserver")
    client.post("/api/auth/token", data={"username": "alice", "password": PASSWORD})
    token = client.cookies[REFRESH_COOKIE]

    code, out = run_cli("revoke-sessions", "alice")

    assert code == 0 and "1 session(s) de « alice » révoquée(s)" in out
    refresh = TestClient(app, base_url="https://testserver").post(
        "/api/auth/refresh", headers={"Cookie": f"{REFRESH_COOKIE}={token}"}
    )
    assert refresh.status_code == 401


def test_revoke_sessions_unknown_user(run_cli):
    code, out = run_cli("revoke-sessions", "inconnu")
    assert code == 1 and "Aucun compte" in out


def test_migrate(run_cli):
    code, out = run_cli("migrate")
    assert code == 0 and "Base de données à jour" in out
    assert run_cli.migrations == [1]


def test_command_is_required(run_cli):
    code, _ = run_cli()
    assert code == 2
