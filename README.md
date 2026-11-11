# Mes Recettes

Application web de gestion de recettes : interface **Vue 3** + API **FastAPI** + templates **Jinja2** + base **PostgreSQL**, dans un seul projet.

Déjà en place : comptes utilisateurs et authentification par token (désactivés pour l'instant, voir « Comptes et connexion »), fiches recettes (titre, description, portions, temps, étapes) avec validation sécurisée des champs, migrations Alembic, design clair / sombre responsive, tests pytest et Playwright, lint automatique à chaque commit, Docker.

## Premiers pas

1. **Configurer** : copier `.env.example` en `.env`, choisir un mot de passe de base, générer une `SECRET_KEY`, puis créer la base et la base de test (voir « Démarrage rapide » et `docs/architecture.md`).

2. **Installer et lancer** (voir « Démarrage rapide »), activer le hook avec `pre-commit install`.

3. **Suivre le plan de développement** : `docs/plan.md`.

Dans Docker, l'application utilise les ports 8001 (API), 5174 (interface) et 5434 (base) de la machine ; sans Docker, 8000 et 5173. Pour les changer, modifier `docker/docker-compose.yml` (et `code/vite.config.js` pour le serveur de dev hors Docker).

## Structure

```
mes-recettes/
├── code/                   # Tout le code source et son outillage
│   ├── app/                # Python : API FastAPI
│   │   ├── api/            # Routes HTTP
│   │   ├── core/           # Configuration, base de données, moteur de templates
│   │   ├── models/         # Tables (SQLAlchemy)
│   │   ├── schemas/        # Validation (Pydantic)
│   │   ├── services/       # Logique métier
│   │   └── main.py         # Point d'entrée
│   ├── src/                # Vue 3 : interface (Vite, Vue Router, Pinia)
│   ├── public/             # Fichiers statiques (favicon...)
│   ├── templates/          # Templates Jinja2 (layouts, pages, partials, emails)
│   ├── tests/              # Tests Python de l'API (pytest)
│   ├── e2e/                # Tests de bout en bout dans le navigateur (Playwright)
│   ├── index.html          # Page d'entrée de l'interface Vue
│   ├── package.json  vite.config.js  eslint.config.js          # Outillage JavaScript
│   └── pyproject.toml  requirements.txt  requirements-dev.txt  # Outillage Python
├── docker/                 # Dockerfile, docker-compose.yml (api, web, db PostgreSQL)
├── docs/                   # Documentation
├── Makefile
└── .env.example            # Configuration (Python et Vue)
```

## Démarrage rapide

Prérequis : Python 3.11+, Node.js 20+, PostgreSQL 18 (ou Docker, qui fournit tout).

Créer l'utilisateur et la base de l'application (une fois), puis reporter le mot de passe dans `.env` (`POSTGRES_PASSWORD`) et générer une `SECRET_KEY` (voir `.env.example`) :

```bash
psql -U postgres -c "CREATE ROLE mes_recettes LOGIN PASSWORD 'changez-moi';" -c "CREATE DATABASE mes_recettes OWNER mes_recettes;"
```

Les tables sont créées (et mises à jour) automatiquement au démarrage de l'API, par les migrations Alembic.

```bash
cp .env.example .env
make install

# Dans deux terminaux :
make api    # http://localhost:8000  (doc API : /docs)
make web    # http://localhost:5173
```

Sans `make` (Windows), depuis le dossier `code/` :

```bash
cd code
python -m venv .venv
.venv\Scripts\activate          # Linux/macOS : source .venv/bin/activate
pip install -r requirements-dev.txt
npm install
npx playwright install chromium   # navigateur des tests E2E (une fois par machine)
cd ..; code\.venv\Scripts\pre-commit install; cd code   # lint automatique à chaque commit (une fois par clone)

# Terminal 1 : API
uvicorn app.main:app --reload --reload-dir app --reload-dir templates
# Terminal 2 : interface
npm run dev
```

`--reload-dir` limite la surveillance des fichiers au code Python (sinon uvicorn surveille aussi `node_modules/`).

Avec Docker, depuis la racine : `docker compose -f docker/docker-compose.yml up --build` (ou `make up`). PostgreSQL tourne alors dans le conteneur `db` (données dans le volume Docker `pgdata`), avec les identifiants `POSTGRES_*` du `.env`.

## Comptes et connexion

**Les comptes sont désactivés pour l'instant** (`AUTH_ENABLED=false` dans le `.env`) : l'application est ouverte sans connexion, la page de connexion et les routes `/api/auth` sont masquées, et les recettes n'ont pas de propriétaire. Tout le code des comptes reste en place.

**Réactiver les comptes :**

1. Mettre `AUTH_ENABLED=true` dans le `.env`.
2. Redémarrer l'API (avec Docker : `docker compose -f docker/docker-compose.yml up -d api`). L'interface lit le réglage auprès de l'API, il suffit de recharger la page.
3. Créer son compte (ci-dessous). Le premier compte créé dans une base récupère les recettes créées sans compte.

L'API est alors protégée : il faut un compte pour utiliser l'application. Il n'y a pas d'inscription publique, les comptes se créent en ligne de commande (le mot de passe est demandé de façon masquée, 8 caractères minimum) :

```bash
# Application lancée sans Docker (depuis code/)
python -m app.cli create-user mon-identifiant

# Application lancée avec Docker (depuis la racine)
docker compose -f docker/docker-compose.yml exec api python -m app.cli create-user mon-identifiant
```

Le premier compte créé dans une base récupère les recettes créées sans compte. Chaque utilisateur ne voit ensuite que ses propres recettes.

Utiliser l'API directement : demander un token, puis l'envoyer dans l'en-tête `Authorization` de chaque requête (valable 60 minutes). La page `/docs` propose aussi un bouton **Authorize**.

```bash
curl -X POST http://localhost:8000/api/auth/token -d "username=mon-identifiant" -d "password=..."
curl http://localhost:8000/api/recipes -H "Authorization: Bearer <access_token>"
```

## Administration de PostgreSQL

Avec pgAdmin 4 (installé avec PostgreSQL) ou `psql`, deux serveurs distincts :

| Serveur | Hôte : port | Utilisateur / mot de passe (`.env`) |
|---------|-------------|--------------------------------------|
| PostgreSQL installé sur la machine | `localhost:5432` | `postgres` / `POSTGRES_SUPERUSER_PASSWORD` (admin), ou `mes_recettes` / `POSTGRES_PASSWORD` |
| Conteneur Docker `db` | `localhost:5434` | `mes_recettes` / `POSTGRES_PASSWORD` |

Le port 5434 du conteneur n'est ouvert que sur la machine (`127.0.0.1`), pas sur le réseau.

## Commandes utiles

| Commande        | Action |
|-----------------|--------|
| `make test`     | Tests Python (pytest) |
| `make e2e` / `npm run test:e2e` (dans `code/`) | Tests de bout en bout Playwright, dans le mode du `.env` (tester l'autre mode : `AUTH_ENABLED=true npx playwright test` dans `code/`) |
| `npm run test:e2e:ui` (dans `code/`) | Tests Playwright en mode interactif (pas à pas, avec le navigateur visible) |
| `make lint`     | Ruff + Prettier + ESLint sur tout le projet |
| `npm run lint` / `npm run format` (dans `code/`) | ESLint avec corrections / formatage Prettier |
| `code\.venv\Scripts\pre-commit run --all-files` (racine) | Les trois outils sur tout le projet |
| `npm run build` (dans `code/`) | Build de production de l'interface : tout le code regroupé dans un seul fichier JS et un seul fichier CSS (`code/dist/assets/`), réglage `build` de `vite.config.js` |

## Qualité du code

| Outil | Rôle | Configuration |
|-------|------|---------------|
| Ruff | Linter Python | `code/pyproject.toml` |
| ESLint | Erreurs de code Vue / JavaScript (pas la mise en forme) | `code/eslint.config.js` |
| Prettier | Mise en forme Vue / JavaScript / CSS | `code/.prettierrc.json` |

**Lint automatique à chaque commit** (`.pre-commit-config.yaml`) : une fois `pre-commit install` lancé, chaque `git commit` passe les fichiers commités dans Ruff, Prettier et ESLint, et refuse les caractères Unicode invisibles d’inversion de sens (attaque « Trojan Source » : écrire leur échappement, par exemple `\u202e`).

- Si un outil **corrige** un fichier (formatage, import inutilisé…), le commit est interrompu : relisez la correction, refaites `git add`, puis recommitez.
- S'il reste une **erreur** à corriger à la main, le commit est bloqué et l'erreur est affichée.
- Pour passer outre exceptionnellement : `git commit --no-verify`.

Voir `docs/architecture.md` pour le détail de l'organisation.
