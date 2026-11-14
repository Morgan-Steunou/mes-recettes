#!/usr/bin/env python3
"""Commandes du projet, identiques sous Windows, Linux et macOS.

Depuis la racine du projet :
    python tasks.py <commande> [arguments]      (Linux / macOS : python3, ou make <commande>)
    python tasks.py --help                      liste des commandes

Uniquement la bibliothèque standard de Python : utilisable avant même « install ».
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent
CODE = ROOT / "code"
WINDOWS = os.name == "nt"
VENV_BIN = CODE / ".venv" / ("Scripts" if WINDOWS else "bin")

COMPOSE = ["docker", "compose", "-f", "docker/docker-compose.yml"]
# --env-file .env : le .env de la racine sert aussi aux variables du fichier Compose (DOMAIN)
PROD_COMPOSE = ["docker", "compose", "--env-file", ".env", "-f", "docker/docker-compose.prod.yml"]


# --- Outils --------------------------------------------------------------------------------


def venv_tool(name: str) -> str:
    """Programme installé dans code/.venv (pytest, uvicorn, pre-commit...)."""
    path = VENV_BIN / (name + (".exe" if WINDOWS else ""))
    if not path.exists():
        sys.exit(f"{path} introuvable : lancer d'abord « python tasks.py install ».")
    return str(path)


def program(name: str) -> str:
    """Programme du système (npm, npx, docker), y compris npm.cmd sous Windows."""
    path = shutil.which(name)
    if path is None:
        sys.exit(f"« {name} » introuvable : est-il installé et dans le PATH ?")
    return path


def run(cmd: list[str], cwd: Path = ROOT, env: dict | None = None, check: bool = True) -> int:
    """Lance une commande en affichant sa ligne ; s'arrête à la première erreur si check."""
    print("$", " ".join(cmd), flush=True)
    try:
        # check=False : le code de sortie est traité ci-dessous (arrêt avec ce même code)
        env = {**os.environ, **(env or {})}
        code = subprocess.run(cmd, cwd=cwd, env=env, check=False).returncode
    except KeyboardInterrupt:
        # Ctrl+C sur un serveur de développement : arrêt normal
        code = 130
    if check and code != 0:
        sys.exit(code)
    return code


def read_env() -> dict[str, str]:
    """Variables du .env de la racine (format simple CLE=valeur, comme Docker Compose)."""
    values: dict[str, str] = {}
    path = ROOT / ".env"
    if not path.exists():
        return values
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        values[key.strip()] = value
    return values


# --- Commandes -----------------------------------------------------------------------------
# Le texte de chaque docstring est l'aide affichée par « python tasks.py --help ».


def install(args):
    """Installe les dépendances Python et JavaScript (et le navigateur des tests E2E)"""
    if not VENV_BIN.exists():
        run([sys.executable, "-m", "venv", ".venv"], cwd=CODE)
    run([venv_tool("python"), "-m", "pip", "install", "-r", "requirements-dev.txt"], cwd=CODE)
    run([program("npm"), "install"], cwd=CODE)
    run([program("npx"), "playwright", "install", "chromium"], cwd=CODE)
    # Hook de lint à chaque commit : seulement dans un dépôt Git (sinon pre-commit échoue)
    if (ROOT / ".git").exists():
        run([venv_tool("pre-commit"), "install"])
    else:
        print("Pas de dépôt Git : hook pre-commit non installé (après « git init » : "
              "python tasks.py install).")


def api(args):
    """Lance l'API en mode développement (http://localhost:8000)"""
    run(
        [venv_tool("uvicorn"), "app.main:app", "--reload", "--reload-dir", "app",
         "--reload-dir", "templates"],
        cwd=CODE,
    )


def web(args):
    """Lance l'interface Vue (http://localhost:5173)"""
    run([program("npm"), "run", "dev"], cwd=CODE)


def test(args):
    """Lance les tests Python (arguments transmis à pytest, ex. : test -k auth)"""
    run([venv_tool("pytest"), *args.extra], cwd=CODE)


def test_pg(args):
    """Lance les tests Python sur PostgreSQL (base mes_recettes_test, effacée au début)"""
    env = {**read_env(), **os.environ}
    user = env.get("POSTGRES_USER", "mes_recettes")
    password = quote(env.get("POSTGRES_PASSWORD", ""), safe="")
    host = env.get("POSTGRES_HOST", "localhost")
    port = env.get("POSTGRES_PORT", "5432")
    url = f"postgresql+psycopg://{quote(user, safe='')}:{password}@{host}:{port}/mes_recettes_test"
    run([venv_tool("pytest"), *args.extra], cwd=CODE, env={"TEST_DATABASE_URL": url})


def cov(args):
    """Tests Python avec mesure de couverture (rapport détaillé : code/htmlcov/index.html)"""
    run([venv_tool("pytest"), "--cov", "--cov-report=term", "--cov-report=html", *args.extra],
        cwd=CODE)


def e2e(args):
    """Lance les tests de bout en bout Playwright (arguments transmis à Playwright)"""
    run([program("npx"), "playwright", "test", *args.extra], cwd=CODE)


def lint(args):
    """Vérifie le style du code (Ruff, Prettier, ESLint) sur tout le projet"""
    run([venv_tool("pre-commit"), "run", "--all-files"])


def audit(args):
    """Cherche les failles connues dans les dépendances Python et JavaScript"""
    python = run([venv_tool("pip-audit"), "-r", "requirements-dev.txt"], cwd=CODE, check=False)
    javascript = run([program("npm"), "audit", "--audit-level=moderate"], cwd=CODE, check=False)
    sys.exit(python or javascript)


def up(args):
    """Lance tout avec Docker (développement)"""
    run([*COMPOSE, "up", "--build"])


def down(args):
    """Arrête les conteneurs de développement"""
    run([*COMPOSE, "down"])


def prod_up(args):
    """Lance la pile de production (HTTPS sur DOMAIN, voir docker/docker-compose.prod.yml)"""
    run([*PROD_COMPOSE, "up", "-d", "--build"])


def prod_down(args):
    """Arrête la pile de production (les volumes et les sauvegardes sont gardés)"""
    run([*PROD_COMPOSE, "down"])


def prod_backup(args):
    """Sauvegarde la base de production tout de suite"""
    run([*PROD_COMPOSE, "exec", "-T", "backup", "backup", "now"])


def prod_backups(args):
    """Liste les sauvegardes de la base de production"""
    run([*PROD_COMPOSE, "exec", "-T", "backup", "backup", "list"])


def prod_restore(args):
    """Restaure une sauvegarde de production (nom du fichier, ou « latest »)"""
    # Arrête l'API, sauvegarde l'état actuel puis restaure, applique les migrations (sauvegarde
    # plus ancienne que le code), et redémarre l'API même en cas d'échec
    run([*PROD_COMPOSE, "stop", "api"])
    status = run([*PROD_COMPOSE, "exec", "-T", "backup", "restore", args.file], check=False)
    if status == 0:
        status = run([*PROD_COMPOSE, "run", "--rm", "migrate"], check=False)
    run([*PROD_COMPOSE, "start", "api"])
    sys.exit(status)


# --- Renommage -------------------------------------------------------------------------------

# Dossiers générés ou propres à la machine : jamais modifiés
RENAME_SKIP_DIRS = {".git", ".venv", "node_modules", "dist", "test-results", "playwright-report",
                    "blob-report", ".pytest_cache", ".ruff_cache", "__pycache__"}
BINARY_SUFFIXES = {".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp", ".woff", ".woff2", ".pdf",
                   ".pyc", ".db", ".dump"}
IDENTIFIER = re.compile(r"[a-z][a-z0-9]*(-[a-z0-9]+)*")


def current_names() -> tuple[str, str]:
    """Nom actuel : identifiant (code/package.json) et nom affiché (APP_NAME par défaut)."""
    identifier = json.loads((CODE / "package.json").read_text(encoding="utf-8"))["name"]
    config = (CODE / "app" / "core" / "config.py").read_text(encoding="utf-8")
    match = re.search(r'^\s*app_name: str = "([^"]+)"', config, re.MULTILINE)
    if match is None:
        sys.exit("Nom affiché introuvable (app_name dans code/app/core/config.py).")
    return identifier, match.group(1)


def project_text_files():
    for path in ROOT.rglob("*"):
        if any(part in RENAME_SKIP_DIRS for part in path.relative_to(ROOT).parts):
            continue
        if path.is_file() and path.suffix.lower() not in BINARY_SUFFIXES:
            yield path


def rename(args):
    """Renomme l'application (identifiant et nom affiché), ex. : rename mes-recettes "Mes Recettes\""""
    new_id, new_name = args.identifier, args.name.strip()
    if not IDENTIFIER.fullmatch(new_id):
        sys.exit(f"Identifiant « {new_id} » invalide : minuscules, chiffres et tirets (ex. mes-recettes).")
    # Le nom affiché va dans du Python, du HTML et du JSON : pas de caractère à échapper
    if not new_name or any(c in new_name for c in '"\\<>&'):
        sys.exit("Nom affiché vide, ou contenant l'un des caractères \" \\ < > &.")
    old_id, old_name = current_names()
    # Formes du nom : identifiant (mes-recettes : paquet npm, projet Docker, clés du navigateur),
    # snake_case (mes_recettes : base, utilisateur PostgreSQL, cookie), nom affiché (Mes Recettes)
    pairs = [(old_id, new_id), (old_id.replace("-", "_"), new_id.replace("-", "_")),
             (old_name, new_name)]
    pairs = [(old, new) for old, new in pairs if old != new]
    if not pairs:
        print("L'application porte déjà ce nom : rien à faire.")
        return

    changed = []
    for path in project_text_files():
        raw = path.read_bytes()
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError:
            continue
        new_text = text
        for old, new in pairs:
            new_text = new_text.replace(old, new)
        if new_text != text:
            path.write_bytes(new_text.encode("utf-8"))  # fins de ligne conservées
            changed.append(path.relative_to(ROOT).as_posix())

    print(f"« {old_name} » ({old_id}) renommée en « {new_name} » ({new_id}).")
    print(f"{len(changed)} fichier(s) modifié(s) :")
    for name in sorted(changed):
        print(f"  {name}")
    # Contrôle : plus aucune trace de l'ancien nom
    leftovers = [
        f"{path.relative_to(ROOT).as_posix()}:{n}: {line.strip()}"
        for path in project_text_files()
        for n, line in enumerate(path.read_text(encoding="utf-8", errors="ignore").splitlines(), 1)
        if any(old in line for old, _ in pairs)
    ]
    if leftovers:
        print("Mentions de l'ancien nom restantes :", *leftovers, sep="\n  ")
        sys.exit(1)
    print(f"Base PostgreSQL : {new_id.replace('-', '_')} (tests : {new_id.replace('-', '_')}_test).")
    print("Penser aussi aux noms dans le .env, aux bases PostgreSQL existantes et au dépôt Git.")
    # Remplacement de texte brut : un nom qui est aussi un mot courant (« notes »...) peut
    # toucher d'autres textes, d'où la relecture
    print("Relire les modifications avant de les commiter : git diff")


COMMANDS = [install, api, web, test, test_pg, cov, e2e, lint, audit, up, down, prod_up, prod_down,
            prod_backup, prod_backups, prod_restore, rename]
WITH_EXTRA_ARGS = {test, test_pg, cov, e2e}


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="python tasks.py", description=__doc__.splitlines()[0],
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    commands = parser.add_subparsers(dest="command", required=True, metavar="<commande>")
    for func in COMMANDS:
        sub = commands.add_parser(func.__name__.replace("_", "-"), help=func.__doc__)
        sub.set_defaults(func=func)
        if func is prod_restore:
            sub.add_argument("file", help="fichier de sauvegarde (voir prod-backups), ou latest")
        if func is rename:
            sub.add_argument("identifier", help="identifiant en kebab-case, ex. mes-recettes")
            sub.add_argument("name", help="nom affiché, ex. « Mes Recettes »")
    # Arguments non reconnus (ex. « test -k auth -x ») : transmis tels quels à pytest ou
    # Playwright, refusés pour les autres commandes
    args, extra = parser.parse_known_args()
    if extra and args.func not in WITH_EXTRA_ARGS:
        parser.error(f"arguments non reconnus : {' '.join(extra)}")
    args.extra = extra
    args.func(args)


if __name__ == "__main__":
    main()
