# Architecture

```
Navigateur ──> Interface Vue (code/src/, Vite :5173) ──/api──> API FastAPI (code/app/, :8000) ──> code/templates/ (Jinja2)
                                                                                              └─> PostgreSQL (:5432)
```

Organisation du projet :
- `code/` : tout le code source. Les fichiers de chaque outil sont à sa racine (`package.json`, `vite.config.js` pour Vue ; `pyproject.toml`, `requirements.txt` pour Python), et chaque langage a son dossier (`src/` pour Vue, `app/` pour Python). Les commandes `npm`, `pytest`, `uvicorn` se lancent depuis `code/`.
- `docker/` : `Dockerfile` (cibles `api` et `web`, construites avec `code/` comme contexte), `Dockerfile.dockerignore` et `docker-compose.yml` (services `db`, `api`, `web` ; chemins relatifs à `docker/`).
- À la racine : ce qui n'est pas du code — `.env`, `docs/`, `Makefile`.

Un seul `.env`, à la racine, sert aux deux : Python lit toutes les variables, Vue (via `envDir: '..'` dans `vite.config.js`) uniquement celles préfixées par `VITE_`.

## API Python (`code/app/`)
| Dossier     | Rôle |
|-------------|------|
| `api/`      | Routes HTTP (un fichier par ressource dans `routes/`), regroupées dans `router.py` |
| `core/`     | Configuration (`config.py`), base de données (`database.py`), sécurité : mots de passe et tokens (`security.py`), moteur de templates (`templating.py`) |
| `models/`   | Modèles SQLAlchemy : tables de la base de données |
| `schemas/`  | Modèles Pydantic : validation des entrées / sorties |
| `services/` | Logique métier, indépendante de HTTP |

Autres fichiers : `api/deps.py` (dépendance `get_current_user`), `cli.py` (commandes d'administration), `code/migrations/` et `code/alembic.ini` (migrations Alembic).

Ajouter une ressource : modèle dans `models/` (et l'exporter dans `models/__init__.py`), schéma dans `schemas/`, service dans `services/`, route dans `api/routes/`, puis l'enregistrer dans `api/router.py` — avec `dependencies=protected` si elle est réservée aux utilisateurs connectés — et créer sa migration (`alembic revision --autogenerate -m "..."`).

### Authentification
Les comptes s'activent avec `AUTH_ENABLED` (`.env`, `false` par défaut). **Désactivés**, l'application est ouverte : `get_current_user` renvoie `None` sans demander de token, les items sont créés sans propriétaire (`owner_id` vide), les routes `/api/auth/*` répondent 404 et l'interface masque la connexion. `GET /api/health` indique le mode (`"auth": true/false`) : l'interface le lit au démarrage (`src/stores/auth.js`, `loadMode`), il n'y a donc qu'un réglage, côté API. À la réactivation, le premier compte créé récupère les items sans propriétaire.

**Activés**, toutes les routes `/api/items` exigent un **token d'accès**, envoyé dans l'en-tête `Authorization: Bearer <token>`. Seules `/api/health`, `/api/auth/token` et la page `/` sont publiques.

1. `POST /api/auth/token` (formulaire OAuth2 : `username`, `password`) vérifie les identifiants et renvoie `{"access_token", "token_type": "bearer", "expires_in"}`.
2. Le token est un JWT signé (HS256) avec `SECRET_KEY` (`.env`, obligatoire : l'API refuse de démarrer sans). Il contient l'id de l'utilisateur et expire après `ACCESS_TOKEN_EXPIRE_MINUTES` (60 par défaut).
3. `get_current_user` (`api/deps.py`) vérifie la signature, l'expiration, et que le compte existe toujours et est actif. Sinon : 401.
4. `GET /api/auth/me` renvoie l'utilisateur du token.

Sécurité :
- Mots de passe hachés avec Argon2 (`pwdlib`), jamais stockés en clair.
- Même message et même temps de réponse que l'identifiant existe ou non (pas d'énumération des comptes).
- Chaque item appartient à un utilisateur (`owner_id`) : un utilisateur ne voit pas les items des autres, et reçoit 404 (pas 403) s'il tente d'y accéder, pour ne pas révéler leur existence.
- Pas d'inscription publique : les comptes sont créés par la commande `python -m app.cli create-user <identifiant>`. Le premier compte créé récupère les items sans propriétaire (créés avant l'activation des comptes).
- Limites actuelles : pas de limitation du nombre de tentatives de connexion (à confier au reverse proxy en production), pas de révocation d'un token avant son expiration (désactiver le compte coupe l'accès immédiatement).

Côté interface : `src/stores/auth.js` garde le token (dans `localStorage`, pour rester connecté après un rechargement), `src/services/api.js` l'ajoute à chaque requête et renvoie vers `/login` sur un 401 ; le routeur protège les pages `meta.requiresAuth`.

### Validation des champs texte
Les règles sont dans `schemas/item.py` (le frontend ne fait que les répéter pour le confort) : espaces de début / fin retirés, longueur max (nom 100, description 1000), caractères de contrôle et caractères de direction Unicode refusés, champs inconnus refusés. Le HTML n'est pas filtré mais stocké tel quel : il est échappé à l'affichage par Vue (`{{ }}`) et Jinja2 (autoescape). Ne jamais afficher une donnée utilisateur avec `v-html` ou `| safe`.

### Base de données
PostgreSQL, via SQLAlchemy et le pilote `psycopg` (3). La connexion est construite dans `core/config.py` à partir des variables `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` du `.env` ; `DATABASE_URL` (URL SQLAlchemy complète), si elle est définie, est prioritaire.

- En local : serveur PostgreSQL installé sur la machine (`localhost:5432`).
- Avec Docker : conteneur `db` (image `postgres:18-alpine`), mêmes variables `.env` ; Compose remplace `POSTGRES_HOST` par `db`. Les données sont dans le volume `pgdata` (supprimé seulement par `docker compose down -v`). Accessible depuis la machine sur `127.0.0.1:5434` (pgAdmin, psql). Les deux bases sont distinctes.
- Tests : base SQLite en mémoire (rapide, sans serveur), via un remplacement de `get_db` dans `tests/conftest.py`.

Le schéma est géré par **Alembic** (`code/migrations/versions/`). `init_db()` applique les migrations manquantes au démarrage de l'API ; à la main : `alembic upgrade head` (depuis `code/`). Après une modification d'un modèle : `alembic revision --autogenerate -m "description"`, relire la migration générée, puis la commiter. `alembic check` vérifie que modèles et migrations correspondent.

## Interface Vue (`code/src/`)
| Dossier       | Rôle |
|---------------|------|
| `views/`      | Pages associées à une route |
| `components/` | Composants réutilisables |
| `router/`     | Déclaration des routes (Vue Router) |
| `stores/`     | État global (Pinia) |
| `services/`   | Appels à l'API |
| `assets/`     | CSS, images |

## Templates (`code/templates/`)
Templates Jinja2 rendus par l'API : pages serveur, emails, etc.

## Tests
### API (`code/tests/`)
Tests Python (pytest) de l'API, sur une base SQLite en mémoire : rapides, sans serveur. Ils ne dépendent pas du `.env` : comptes désactivés par défaut (fixture `auth_disabled`), activés par la fixture `enable_auth` (`test_auth.py`) ; `test_api.py` tourne dans les deux modes.

### Bout en bout (`code/e2e/`)
Tests Playwright : un vrai navigateur (Chromium) pilote l'application complète (interface → API → PostgreSQL).

- `playwright.config.js` démarre sa propre API (port 8010) et sa propre interface (port 5180), branchées sur la base **`mes_recettes_test`** du PostgreSQL local. Les données de développement ne sont pas touchées, et Docker ou le serveur de dev peuvent tourner en même temps.
- Les tests suivent le mode du `.env` (`AUTH_ENABLED`), lu auprès de l'API (fixture `authEnabled`) : `auth.spec.js` ne tourne qu'avec les comptes, `no-auth.spec.js` que sans. Tester l'autre mode : `AUTH_ENABLED=true npx playwright test`.
- `e2e/fixtures.js` vide la table des items avant chaque test ; les tests importent `test` et `expect` depuis ce fichier.
- En cas d'échec, une capture d'écran et une trace sont gardées dans `test-results/` ; `npm run test:e2e:report` ouvre le rapport HTML.

Prérequis : la base de test, à créer une fois (avec l'administrateur `postgres`) :

```bash
psql -U postgres -h localhost -c "CREATE DATABASE mes_recettes_test OWNER mes_recettes;"
```
