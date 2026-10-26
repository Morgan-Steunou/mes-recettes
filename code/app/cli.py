"""Commandes d'administration, à lancer depuis code/ :

    python -m app.cli create-user <identifiant>

Le mot de passe est demandé de façon masquée. Pour un script, il peut être fourni sur
l'entrée standard avec --password-stdin (jamais en argument : il resterait dans l'historique).
"""
import argparse
import getpass
import sys

from pydantic import ValidationError

from app.core.database import SessionLocal, init_db
from app.schemas.user import UserCreate
from app.services.user_service import UsernameTakenError, UserService


def read_password(from_stdin: bool) -> str:
    if from_stdin:
        return sys.stdin.readline().rstrip("\r\n")
    password = getpass.getpass("Mot de passe (8 caractères minimum) : ")
    if getpass.getpass("Confirmez le mot de passe : ") != password:
        sys.exit("Les deux mots de passe ne correspondent pas.")
    return password


def create_user(username: str, password_stdin: bool, if_not_exists: bool = False) -> None:
    password = read_password(password_stdin)
    try:
        data = UserCreate(username=username, password=password)
    except ValidationError as e:
        problems = "; ".join(f"{err['loc'][0]} : {err['msg']}" for err in e.errors())
        sys.exit(f"Données invalides — {problems}")

    init_db()
    with SessionLocal() as db:
        service = UserService(db)
        try:
            user = service.create(data)
        except UsernameTakenError:
            if if_not_exists:
                print(f"Le compte « {data.username} » existe déjà : rien à faire.")
                return
            sys.exit(f"L'identifiant « {data.username} » est déjà utilisé.")
        print(f"Compte « {user.username} » créé (id {user.id}).")
        # Les items créés avant la mise en place des comptes reviennent au premier compte
        if service.count() == 1:
            claimed = service.claim_orphan_items(user)
            if claimed:
                print(f"{claimed} item(s) existant(s) rattaché(s) à ce compte.")


def main() -> None:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__.splitlines()[0])
    commands = parser.add_subparsers(dest="command", required=True)
    create = commands.add_parser("create-user", help="Crée un compte utilisateur")
    create.add_argument(
        "username", help="Identifiant (3 à 50 caractères : lettres, chiffres, . _ -)"
    )
    create.add_argument(
        "--password-stdin", action="store_true", help="Lire le mot de passe sur l'entrée standard"
    )
    create.add_argument(
        "--if-not-exists",
        action="store_true",
        help="Ne pas échouer si le compte existe déjà (son mot de passe n'est pas modifié)",
    )
    args = parser.parse_args()
    if args.command == "create-user":
        create_user(args.username, args.password_stdin, args.if_not_exists)


if __name__ == "__main__":
    main()
