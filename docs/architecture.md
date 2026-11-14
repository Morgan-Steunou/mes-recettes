# Architecture

```
Navigateur ──> Interface Vue (code/src/, Vite :5173) ──/api──> API FastAPI (code/app/, :8000) ──> code/templates/ (Jinja2)
                                                                                              └─> PostgreSQL (:5432)
```

Organisation du projet :
- `code/` : tout le code source. Les fichiers de chaque outil sont à sa racine (`package.json`, `tsconfig.json`, `vite.config.ts` pour Vue ; `pyproject.toml`, `requirements.txt` pour Python), et chaque langage a son dossier (`src/` pour Vue, `app/` pour Python). Les commandes `npm`, `pytest`, `uvicorn` se lancent depuis `code/`.
- `docker/` : `Dockerfile` (cibles `api`, `web`, `web-prod`, `proxy` et `backup`, construites avec `code/` comme contexte), `Dockerfile.dockerignore`, `docker-compose.yml` (développement : services `db`, `api`, `web`) et `docker-compose.prod.yml` (production : `db`, `migrate`, `api`, `web` servi par nginx, `proxy` : HTTPS par Caddy, `backup` : sauvegardes quotidiennes) ; chemins relatifs à `docker/`.
- À la racine : ce qui n'est pas du code — `.env`, `docs/`, `Makefile`.

Un seul `.env`, à la racine, sert aux deux : Python lit toutes les variables, Vue (via `envDir: '..'` dans `vite.config.ts`) uniquement celles préfixées par `VITE_`, déclarées dans `code/env.d.ts` pour TypeScript.

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
Les comptes s'activent avec `AUTH_ENABLED` (`.env`, `false` par défaut). **Désactivés**, l'application est ouverte : `get_current_user` renvoie `None` sans demander de token, les recettes sont créées sans propriétaire (`owner_id` vide), les routes `/api/auth/*` répondent 404 et l'interface masque la connexion. `GET /api/health` indique le mode (`"auth": true/false`) : l'interface le lit au démarrage (`src/stores/auth.ts`, `loadMode`, appelé par `restore`), il n'y a donc qu'un réglage, côté API. À la réactivation, le premier compte créé récupère les recettes sans propriétaire.

**Activés**, toutes les routes `/api/recipes` exigent un **token d'accès**, envoyé dans l'en-tête `Authorization: Bearer <token>`. Seules `/api/health`, `/api/health/ready`, `/api/auth/token`, `/api/auth/refresh`, `/api/auth/logout` et la page `/` sont publiques.

1. `POST /api/auth/token` (formulaire OAuth2 : `username`, `password`) vérifie les identifiants, renvoie `{"access_token", "token_type": "bearer", "expires_in"}` et ouvre une session : cookie `mes_recettes_refresh` (le refresh token).
2. Le token d'accès est un JWT signé (HS256) avec `SECRET_KEY` (`.env`, obligatoire : l'API refuse de démarrer sans). Il contient l'id de l'utilisateur et expire après `ACCESS_TOKEN_EXPIRE_MINUTES` (15 par défaut).
3. `get_current_user` (`api/deps.py`) vérifie la signature, l'expiration, et que le compte existe toujours et est actif. Sinon : 401.
4. `GET /api/auth/me` renvoie l'utilisateur du token.
5. `POST /api/auth/refresh` échange le cookie contre un nouveau token d'accès et un nouveau cookie ; `POST /api/auth/logout` révoque la session et efface le cookie.

Sessions (`services/session_service.py`, table `refresh_tokens`) :
- Le refresh token est un jeton aléatoire de 256 bits, dans un cookie `HttpOnly` (illisible par le JavaScript de la page), `Secure`, `SameSite=Strict` (jamais envoyé par un autre site), limité au chemin `/api/auth`. Son nom contient celui de l'application, car les cookies de `localhost` sont partagés entre tous les ports. La base n'en garde que l'empreinte SHA-256.
- Chaque refresh token ne sert qu'une fois (rotation) : il est révoqué et remplacé à chaque renouvellement. Une connexion forme une « famille » de tokens. Présenter un token déjà remplacé, plus de 30 secondes après, signifie qu'il a été copié : toute la famille est révoquée et il faut se reconnecter. Dans les 30 secondes, il est simplement refusé (deux onglets qui renouvellent en même temps).
- Une session expire après `REFRESH_TOKEN_EXPIRE_DAYS` (30) jours sans utilisation. Compte désactivé : le renouvellement échoue.
- `python -m app.cli revoke-sessions <identifiant>` déconnecte un utilisateur de tous ses appareils.
- `REFRESH_COOKIE_SECURE=false` seulement pour essayer l'application en HTTP sur une autre adresse que `localhost` (les navigateurs acceptent les cookies `Secure` sur `http://localhost`).

Sécurité :
- Mots de passe hachés avec Argon2 (`pwdlib`), jamais stockés en clair.
- Même message et même temps de réponse que l'identifiant existe ou non (pas d'énumération des comptes).
- Chaque recette appartient à un utilisateur (`owner_id`) : un utilisateur ne voit pas les recettes des autres, et reçoit 404 (pas 403) s'il tente d'y accéder, pour ne pas révéler leur existence.
- Pas d'inscription publique : les comptes sont créés par la commande `python -m app.cli create-user <identifiant>`. Le premier compte créé récupère les recettes sans propriétaire (créées avant l'activation des comptes).
- Tentatives de connexion limitées (`core/rate_limit.py`) : après `LOGIN_MAX_FAILURES` échecs (5) pour un couple adresse IP + identifiant, ou `LOGIN_MAX_FAILURES_PER_IP` (20) pour une adresse IP, sur `LOGIN_FAILURE_WINDOW_SECONDS` (15 min), réponse 429 avec `Retry-After`, même avec le bon mot de passe. Un compte n'est jamais bloqué pour tout le monde. Une connexion réussie efface les échecs de ce compte. Compteurs en mémoire, propres à chaque processus. En production, l'adresse du client vient de `X-Forwarded-For` (`FORWARDED_ALLOW_IPS`) : Caddy le remplit avec l'adresse de connexion (en ignorant celui du client), nginx le reprend (`real_ip_header`) puis le transmet à l'API.
- Un token d'accès déjà délivré reste valable jusqu'à son expiration (15 min) après une déconnexion ou une révocation ; désactiver le compte coupe l'accès immédiatement.

Logs (`core/logs.py`) : `setup_logging()` configure une seule sortie (stdout) pour l'application et uvicorn, en JSON (`JsonFormatter`) ou en texte (`TextFormatter`) selon `LOG_FORMAT`. `RequestLogMiddleware` (middleware ASGI, le plus externe) reprend l'en-tête `X-Request-ID` posé par nginx s'il est valide (64 caractères maximum, lettres, chiffres, `.` `_` `-`), sinon en crée un, le garde dans une `ContextVar` lue par `RequestIdFilter` pour toutes les lignes de la requête, le renvoie dans la réponse, et écrit une ligne `http.request` (le log d'accès d'uvicorn est désactivé). Les événements métier passent par `logger.info(message, extra={"event": ..., ...})` : les champs d'`extra` deviennent des champs du JSON.

Côté interface : `src/stores/auth.ts` garde le token d'accès en mémoire seulement (jamais dans `localStorage`). Au chargement de la page, `restore()` appelle `/auth/refresh` pour reprendre la session, et le routeur attend la réponse avant la première page. `src/services/api.ts` ajoute le token à chaque requête, le renouvelle 30 secondes avant son expiration, et sur un 401 le renouvelle puis rejoue la requête une fois ; si la session est terminée, retour à `/login?expired=1`. Un verrou partagé entre onglets (`navigator.locks`) évite deux renouvellements simultanés avec le même cookie. Le routeur protège les pages `meta.requiresAuth`.

### Validation des champs texte
Les règles sont dans `schemas/recipe.py` (le frontend ne fait que les répéter pour le confort) : espaces de début / fin retirés, longueur max (titre 150, description 2000, étapes 10 000), nombres bornés (portions 1 à 100, temps 0 à 1 440 minutes), ingrédients limités à 100 par recette (nom 100 caractères, unité 30, quantité strictement positive et finie), caractères de contrôle et caractères de direction Unicode refusés, champs inconnus refusés. Le HTML n'est pas filtré mais stocké tel quel : il est échappé à l'affichage par Vue (`{{ }}`) et Jinja2 (autoescape). Ne jamais afficher une donnée utilisateur avec `v-html` ou `| safe`. Les erreurs 422 ne renvoient pas la valeur reçue (`input`), voir `validation_error_handler` dans `main.py`.

### Base de données
PostgreSQL, via SQLAlchemy et le pilote `psycopg` (3). La connexion est construite dans `core/config.py` à partir des variables `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD` du `.env` ; `DATABASE_URL` (URL SQLAlchemy complète), si elle est définie, est prioritaire.

- En local : serveur PostgreSQL installé sur la machine (`localhost:5432`).
- Avec Docker : conteneur `db` (image `postgres:18-alpine`), mêmes variables `.env` ; Compose remplace `POSTGRES_HOST` par `db`. Les données sont dans le volume `pgdata` (supprimé seulement par `docker compose down -v`). Accessible depuis la machine sur `127.0.0.1:5434` (pgAdmin, psql). Les deux bases sont distinctes.
- Tests : base SQLite en mémoire (rapide, sans serveur), via un remplacement de `get_db` dans `tests/conftest.py`. Avec `TEST_DATABASE_URL`, les mêmes tests tournent sur PostgreSQL (`python tasks.py test-pg`, et en CI).

Le schéma est géré par **Alembic** (`code/migrations/versions/`). `init_db()` applique les migrations manquantes au démarrage de l'API, sauf avec `RUN_MIGRATIONS_ON_STARTUP=false` ; à la main : `python -m app.cli migrate` ou `alembic upgrade head` (depuis `code/`). En production, le service `migrate` de `docker-compose.prod.yml` les applique une seule fois avant l'API, pour que plusieurs instances ne les lancent pas en même temps. Après une modification d'un modèle : `alembic revision --autogenerate -m "description"`, relire la migration générée, puis la commiter. `alembic check` vérifie que modèles et migrations correspondent.

## Interface Vue (`code/src/`)
| Dossier       | Rôle |
|---------------|------|
| `views/`      | Pages associées à une route |
| `components/` | Composants réutilisables |
| `router/`     | Déclaration des routes (Vue Router) |
| `stores/`     | État global (Pinia) |
| `composables/` | Logique réutilisable entre composants (thème) |
| `services/`   | Appels à l'API |
| `utils/`      | Fonctions d'affichage partagées (ex. durées des recettes) |
| `types/`      | Types TypeScript des données de l'API (miroir de `app/schemas/`) |
| `assets/`     | CSS, images |

Le code est en **TypeScript** (`<script setup lang="ts">` dans les `.vue`), en mode strict. `npm run type-check` (`vue-tsc`) vérifie les types ; `npm run build` le lance avant Vite, donc la CI et l'image Docker de production échouent sur une erreur de type. Les types de `src/types/api.ts` sont écrits à la main : à mettre à jour avec les schémas Pydantic. Seul `public/theme-init.js` reste en JavaScript : il est servi tel quel, sans passer par Vite.

Pages des recettes : `/` (liste, `HomeView`), `/recettes/:id` (fiche, `RecipeDetailView`), `/recettes/nouvelle` et `/recettes/:id/modifier` (même formulaire, `RecipeFormView`). Après un enregistrement, le formulaire ouvre la fiche. La fiche adapte les quantités au nombre de portions choisi et permet de cocher ingrédients et étapes pendant la préparation (rien n'est enregistré). Le formulaire envoie tous les champs (un champ vide devient `null`), car la modification remplace la recette entière. La suppression demande une confirmation.

Ingrédients : table `recipe_ingredients` (nom, quantité, unité, `position` pour l'ordre), envoyés et renvoyés dans le champ `ingredients` de la recette. Une modification remplace toute la liste. Dans le formulaire (`IngredientsEditor`), les lignes vides sont ignorées, une quantité s'écrit « 250 », « 0,5 » ou « 1/2 » (`utils/recipe.ts`).

Historique des repas : table `recipe_cookings` (date `cooked_on`, note de 1 à 5 et commentaire facultatifs), routes `/api/recipes/{id}/cookings` (lister, ajouter, retirer). Les recettes renvoient un résumé calculé, `cooked_count` et `last_cooked_on`, en une seule requête pour toute la liste. La date par défaut est celle du jour ; une date future est refusée (un jour de tolérance pour les fuseaux horaires). Côté interface, `CookingLog` sur la fiche et `utils/dates.ts`, qui lit les dates de jour dans le fuseau du navigateur.

Historique global : `GET /api/cookings` (paramètres `since` et `until` inclus, `limit` 50 par défaut et 200 au plus, `offset`) renvoie `{ items, total, recipe_count }`, chaque repas avec le titre de sa recette ; `total` et `recipe_count` portent sur toute la période, pas seulement sur la page. Page `/historique` (`HistoryView`) : repas regroupés par mois, périodes prédéfinies gardées dans l'adresse (`?periode=30j`, `3m`, `annee`), « Refaire » qui ouvre la fiche, chargement des repas plus anciens par paquets de 50.

## Templates (`code/templates/`)
Templates Jinja2 rendus par l'API : pages serveur, emails, etc.

## Tests
### API (`code/tests/`)
Tests Python (pytest) de l'API, sur une base SQLite en mémoire : rapides, sans serveur. Ils ne dépendent pas du `.env` : comptes désactivés par défaut (fixture `auth_disabled`), activés par la fixture `enable_auth` (`test_auth.py`, `test_sessions.py`...) ; `test_api.py` tourne dans les deux modes. `python tasks.py test-pg` (ou la variable `TEST_DATABASE_URL`) les lance sur PostgreSQL, avec le schéma créé par les migrations : la CI fait les deux.

Couverture (`pytest-cov`, réglages `[tool.coverage]` de `code/pyproject.toml`) : code de `app/`, branches comprises. `python tasks.py cov` affiche le résumé et écrit le rapport détaillé dans `code/htmlcov/` ; la CI la mesure sur SQLite et sur PostgreSQL et échoue sous `fail_under` (90 %). Les parties non couvertes sont surtout celles qui ne tournent qu'au démarrage réel (migrations au lancement de l'API, `init_db` sur SQLite). L'interface n'a pas de tests unitaires : elle est couverte par les tests E2E Playwright, sans mesure de couverture.

### Bout en bout (`code/e2e/`)
Tests Playwright : un vrai navigateur (Chromium) pilote l'application complète (interface → API → PostgreSQL).

- `playwright.config.ts` démarre sa propre API (port 8010) et sa propre interface (port 5180), branchées sur la base **`mes_recettes_test`** du PostgreSQL local. Les données de développement ne sont pas touchées, et Docker ou le serveur de dev peuvent tourner en même temps.
- Les tests suivent le mode du `.env` (`AUTH_ENABLED`), lu auprès de l'API (fixture `authEnabled`) : `auth.spec.ts` ne tourne qu'avec les comptes, `no-auth.spec.ts` que sans. Tester l'autre mode : `AUTH_ENABLED=true npx playwright test`.
- `e2e/fixtures.ts` vide la liste des recettes (et les catégories) avant chaque test ; les tests importent `test` et `expect` depuis ce fichier.
- En cas d'échec, une capture d'écran et une trace sont gardées dans `test-results/` ; `npm run test:e2e:report` ouvre le rapport HTML.

Prérequis : la base de test, à créer une fois (avec l'administrateur `postgres`) :

```bash
psql -U postgres -h localhost -c "CREATE DATABASE mes_recettes_test OWNER mes_recettes;"
```
