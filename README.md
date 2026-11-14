# Mes Recettes

[![CI](https://github.com/Morgan-Steunou/mes-recettes/actions/workflows/ci.yml/badge.svg)](https://github.com/Morgan-Steunou/mes-recettes/actions/workflows/ci.yml)

Application web de gestion de recettes : interface **Vue 3** (TypeScript) + API **FastAPI** + templates **Jinja2** + base **PostgreSQL**, dans un seul projet.

Déjà en place : comptes utilisateurs et authentification par token (désactivés pour l'instant, voir « Comptes et connexion »), fiches recettes (titre, description, portions, temps, étapes) avec validation sécurisée des champs, migrations Alembic, design clair / sombre responsive, tests pytest et Playwright, lint automatique à chaque commit, Docker.

## Premiers pas

1. **Configurer** : copier `.env.example` en `.env`, choisir un mot de passe de base, générer une `SECRET_KEY`, puis créer la base et la base de test (voir « Démarrage rapide » et `docs/architecture.md`).

2. **Installer et lancer** (voir « Démarrage rapide »), activer le hook avec `pre-commit install`.

3. **Suivre le plan de développement** : `docs/plan.md`.

Dans Docker, l'application utilise les ports 8001 (API), 5174 (interface) et 5434 (base) de la machine ; sans Docker, 8000 et 5173. Pour les changer, modifier `docker/docker-compose.yml` (et `code/vite.config.ts` pour le serveur de dev hors Docker).

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
│   ├── src/                # Vue 3 + TypeScript : interface (Vite, Vue Router, Pinia)
│   ├── public/             # Fichiers statiques (favicon...)
│   ├── templates/          # Templates Jinja2 (layouts, pages, partials, emails)
│   ├── tests/              # Tests Python de l'API (pytest)
│   ├── e2e/                # Tests de bout en bout dans le navigateur (Playwright)
│   ├── index.html          # Page d'entrée de l'interface Vue
│   ├── package.json  tsconfig.json  vite.config.ts  eslint.config.ts  # Outillage TypeScript
│   └── pyproject.toml  requirements.txt  requirements-dev.txt  # Outillage Python
├── docker/                 # Dockerfile, docker-compose.yml (dev) et docker-compose.prod.yml (prod)
├── docs/                   # Documentation
├── tasks.py                # Commandes du projet (python tasks.py --help), Windows, Linux, macOS
├── Makefile                # Raccourcis vers tasks.py (make <commande>, Linux et macOS)
└── .env.example            # Configuration (Python et Vue)
```

## Démarrage rapide

Prérequis : Python 3.12+ (3.14 recommandé : version de la CI et des images Docker), Node.js 22+ (24 recommandé : version de la CI et des images Docker), PostgreSQL 18 (ou Docker, qui fournit tout).

Créer l'utilisateur et la base de l'application (une fois), puis reporter le mot de passe dans `.env` (`POSTGRES_PASSWORD`) et générer une `SECRET_KEY` (voir `.env.example`) :

```bash
psql -U postgres -c "CREATE ROLE mes_recettes LOGIN PASSWORD 'changez-moi';" -c "CREATE DATABASE mes_recettes OWNER mes_recettes;"
```

Les tables sont créées (et mises à jour) automatiquement au démarrage de l'API, par les migrations Alembic.

Les commandes du projet passent par **`tasks.py`** (Python seul, rien à installer), depuis la racine. Elles sont identiques sous Windows, Linux et macOS ; sous Linux et macOS, `make <commande>` fait la même chose (et `python3` remplace `python`).

```bash
cp .env.example .env
python tasks.py install   # environnement Python, dépendances npm, navigateur des tests E2E, hook pre-commit

# Dans deux terminaux :
python tasks.py api       # http://localhost:8000  (doc API : /docs)
python tasks.py web       # http://localhost:5173
```

`python tasks.py --help` liste toutes les commandes. `api` lance uvicorn avec `--reload-dir app --reload-dir templates`, pour ne pas surveiller aussi `node_modules/`.

Avec Docker, depuis la racine : `python tasks.py up` (ou `docker compose -f docker/docker-compose.yml up --build`). PostgreSQL tourne alors dans le conteneur `db` (données dans le volume Docker `pgdata`), avec les identifiants `POSTGRES_*` du `.env`.

## Mise en production

`docker/docker-compose.prod.yml` lance l'application telle qu'en production, sur une machine avec Docker :

```bash
# .env à la racine : POSTGRES_PASSWORD et SECRET_KEY propres à la production, DOMAIN=mon-domaine.fr
docker compose --env-file .env -f docker/docker-compose.prod.yml up -d --build      # ou : python tasks.py prod-up
docker compose --env-file .env -f docker/docker-compose.prod.yml exec api python -m app.cli create-user mon-identifiant
```

- **HTTPS** : Caddy (service `proxy`, cible `proxy` du Dockerfile) est le seul service publié, sur les ports 80 et 443. Il obtient et renouvelle tout seul un certificat Let's Encrypt pour `DOMAIN` : le domaine doit pointer vers la machine, et les ports 80 et 443 être ouverts. HTTP est redirigé vers HTTPS, et l'en-tête HSTS est envoyé (sauf sur `localhost`). Caddy ajoute aussi les en-têtes de sécurité à toutes les réponses : `Content-Security-Policy` stricte (uniquement les ressources de l'application, sans script ni style en ligne), `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` et `Cross-Origin-Opener-Policy`, et retire l'en-tête `Server`. Si l'interface charge un jour des ressources externes (polices, CDN, API d'un autre domaine), il faut élargir la CSP dans la cible `proxy` du Dockerfile. Les certificats sont gardés dans le volume `caddy-data`. Avec `DOMAIN=localhost` (valeur de `.env.example`), Caddy utilise sa propre autorité : le navigateur affiche un avertissement, c'est normal pour un essai sur son poste.
- **nginx** (cible `web-prod`) sert l'interface buildée et relaie `/api` vers l'API. Il n'est joignable que par Caddy, dont il reprend l'adresse réelle du client (`X-Forwarded-For`, utilisé par la limitation des connexions). Caddy ne voit que nginx : l'API et la base sont sur un réseau à part.
- **migrate** applique les migrations une seule fois, puis s'arrête ; l'API ne démarre qu'après (`RUN_MIGRATIONS_ON_STARTUP=false`).
- **api** tourne sans les droits root, avec `ENVIRONMENT=production` : elle refuse de démarrer avec `DEBUG=true` ou des origines CORS `*` / `localhost`, et `/docs` est désactivé.
- **Santé** : `/api/health` (le processus répond) et `/api/health/ready` (la base aussi, sinon 503), utilisé par le `HEALTHCHECK` de l'image.
- **Connexion** : après 5 échecs pour un même compte depuis une même adresse IP (ou 20 depuis une même adresse, tous comptes confondus) en 15 minutes, `/api/auth/token` répond 429. Les compteurs sont en mémoire : avec plusieurs instances de l'API, la limite est multipliée par leur nombre.

### Logs

En production, l'API écrit **une ligne JSON par événement** sur la sortie standard (`docker compose logs api`), prête pour un outil de collecte (Loki, Elasticsearch, CloudWatch…). nginx écrit aussi ses logs d'accès en JSON. En développement, les logs de l'API sont en texte lisible. Réglages : `LOG_LEVEL` (`INFO`) et `LOG_FORMAT` (`json` ou `text`, par défaut `json` en production).

- **Identifiant de requête** : nginx en crée un pour chaque requête, l'API le reprend dans toutes ses lignes (`request_id`) et le renvoie dans l'en-tête `X-Request-ID`. Avec l'identifiant d'une erreur signalée par un utilisateur, `docker compose logs api web | grep <identifiant>` retrouve toute la requête.
- **Une ligne par requête** (`event: http.request`) : méthode, chemin (sans la chaîne de requête), statut, durée, adresse du client. Les vérifications de santé ne sont journalisées qu'en `DEBUG`.
- **Événements de sécurité** : `auth.login.success`, `auth.login.failure` et `auth.login.throttled` (avec l'identifiant tenté et l'adresse IP), `auth.session.started`, `auth.session.revoked`, `auth.session.revoked_all`, et `auth.session.reuse_detected` (refresh token volé probable, niveau `WARNING`). Jamais de mot de passe ni de token.

Exemple :

```json
{"time": "2026-11-14T15:42:07.123+00:00", "level": "WARNING", "logger": "app.api.routes.auth", "message": "Échec de connexion", "request_id": "9f2c…", "event": "auth.login.failure", "username": "alice", "client_ip": "203.0.113.7"}
```

### Sauvegardes de la base

Le service **backup** sauvegarde la base chaque jour à `BACKUP_HOUR` heure UTC (3 h par défaut), avec `pg_dump`, dans le volume Docker `backups`. Chaque sauvegarde est relue avant d'être gardée, et celles de plus de `BACKUP_KEEP_DAYS` jours (14) sont supprimées. Au démarrage, s'il n'y a pas de sauvegarde de moins de 24 h, il en fait une tout de suite ; en cas d'échec, il réessaie toutes les 10 minutes. Le conteneur est signalé « unhealthy » si la dernière sauvegarde a plus de 26 h.

```bash
python tasks.py prod-backup            # sauvegarde tout de suite
python tasks.py prod-backups           # liste les sauvegardes
python tasks.py prod-restore latest    # restaure la plus récente (ou <nom du fichier>)
# Linux / macOS : make prod-backup, make prod-backups, make prod-restore FILE=latest
```

`prod-restore` arrête l'API, sauvegarde d'abord l'état actuel (filet de sécurité), restaure en une seule transaction (en cas d'erreur, la base reste telle qu'avant), applique les migrations si la sauvegarde est plus ancienne que le code, puis redémarre l'API, même en cas d'échec.

**À faire soi-même** : le volume `backups` est sur la même machine que la base. Une panne de disque ou la perte du serveur emporte les deux : copier régulièrement les sauvegardes ailleurs (autre serveur, stockage objet). Sur l'hôte, elles sont dans le volume `mes-recettes-prod_backups` (`docker volume inspect mes-recettes-prod_backups` donne le chemin). Tester une restauration de temps en temps.

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

Dans l'interface, on reste connecté 30 jours sans utilisation : le token d'accès (15 minutes) est gardé en mémoire et renouvelé automatiquement grâce à un cookie de session `HttpOnly`. Pour déconnecter un utilisateur de tous ses appareils : `python -m app.cli revoke-sessions mon-identifiant`.

Utiliser l'API directement : demander un token, puis l'envoyer dans l'en-tête `Authorization` de chaque requête (valable 15 minutes). La page `/docs` propose aussi un bouton **Authorize**.

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

`python tasks.py <commande>` depuis la racine, ou `make <commande>` sous Linux et macOS.

| Commande        | Action |
|-----------------|--------|
| `test`          | Tests Python (pytest, SQLite en mémoire). Arguments transmis à pytest : `python tasks.py test -k auth -x` |
| `test-pg`       | Mêmes tests sur PostgreSQL (base `mes_recettes_test`, schéma effacé puis recréé par les migrations) ; identifiants lus dans le `.env` |
| `cov`           | Tests Python avec mesure de couverture (rapport détaillé : `code/htmlcov/index.html`) ; échoue sous le seuil de 90 % |
| `e2e`           | Tests de bout en bout Playwright, dans le mode du `.env` (arguments transmis : `python tasks.py e2e --headed` ; tester l'autre mode : `AUTH_ENABLED=true npx playwright test` dans `code/`) |
| `npm run test:e2e:ui` (dans `code/`) | Tests Playwright en mode interactif (pas à pas, avec le navigateur visible) |
| `lint`          | Ruff + Prettier + ESLint sur tout le projet |
| `audit`         | Failles connues dans les dépendances : `pip-audit` (Python) et `npm audit` (JavaScript) |
| `up` / `down`   | Pile de développement avec Docker |
| `prod-up`, `prod-down`, `prod-backup`, `prod-backups`, `prod-restore <fichier>` | Pile de production et sauvegardes (voir « Mise en production ») |
| `rename <identifiant> "<Nom>"` | Renomme l'application (identifiant, base, cookies, nom affiché ; relire ensuite avec `git diff`) |
| `npm run lint` / `npm run format` (dans `code/`) | ESLint avec corrections / formatage Prettier |
| `npm run type-check` (dans `code/`) | Vérification des types TypeScript (`vue-tsc`, aussi lancée par `npm run build`) |
| `code\.venv\Scripts\pre-commit run --all-files` (racine) | Les trois outils sur tout le projet |
| `npm run build` (dans `code/`) | Build de production de l'interface : tout le code regroupé dans un seul fichier JS et un seul fichier CSS (`code/dist/assets/`), réglage `build` de `vite.config.ts`. Échoue si les types sont incorrects |

## Qualité du code

| Outil | Rôle | Configuration |
|-------|------|---------------|
| Ruff | Linter Python | `code/pyproject.toml` |
| TypeScript | Vérification des types (`vue-tsc`, lancé par `npm run build`) | `code/tsconfig.app.json` (interface), `code/tsconfig.node.json` (configs, tests E2E) |
| ESLint | Erreurs de code Vue / TypeScript (pas la mise en forme) | `code/eslint.config.ts` |
| Prettier | Mise en forme Vue / TypeScript / CSS | `code/.prettierrc.json` |

**Lint automatique à chaque commit** (`.pre-commit-config.yaml`) : une fois `pre-commit install` lancé, chaque `git commit` passe les fichiers commités dans Ruff, Prettier et ESLint, et refuse les caractères Unicode invisibles d’inversion de sens (attaque « Trojan Source » : écrire leur échappement, par exemple `\u202e`).

- Si un outil **corrige** un fichier (formatage, import inutilisé…), le commit est interrompu : relisez la correction, refaites `git add`, puis recommitez.
- S'il reste une **erreur** à corriger à la main, le commit est bloqué et l'erreur est affichée.
- Pour passer outre exceptionnellement : `git commit --no-verify`.

## Intégration continue

GitHub Actions (`.github/workflows/ci.yml`) vérifie chaque push sur `main`, chaque pull request, et tourne aussi chaque lundi pour repérer les failles publiées entre-temps :

| Job | Vérification |
|-----|--------------|
| Lint | `pre-commit run --all-files` (Ruff, Prettier, ESLint, Trojan Source) |
| Tests API | `pytest`, deux fois : sur SQLite en mémoire et sur PostgreSQL 18. Sur PostgreSQL, `alembic check` d'abord : un modèle modifié sans migration fait échouer le job. Couverture mesurée sur les deux bases (résumé dans la page du run, rapport HTML en artefact) : échec sous 90 % |
| Audit des dépendances | `pip-audit` sur `requirements-dev.txt` et `npm audit` (à partir de « moderate ») : échoue si une dépendance a une faille connue |
| Renommage | `python tasks.py rename ci-demo "Démo CI"` : plus aucune trace de l'ancien nom, puis tests API, build et lint de l'interface, fichiers Compose valides |
| Build interface | `npm run build` (le dossier `dist/` est conservé 7 jours en artefact) |
| Tests E2E | Playwright contre un PostgreSQL 18 de service (base `mes_recettes_test`), comptes désactivés puis activés (`AUTH_ENABLED=false` / `true`), rapport en artefact |
| Build images Docker | Cibles `api`, `web`, `web-prod`, `proxy` et `backup` du `docker/Dockerfile` (sans publication) |
| Pile de production | Démarre `docker-compose.prod.yml` et vérifie à travers Caddy et nginx : certificat HTTPS, redirection de HTTP, en-têtes de sécurité, interface, `/api/health/ready`, connexion, blocage après 5 échecs (même avec un faux `X-Forwarded-For`), `/docs` fermé, Caddy sans accès à l'API, logs JSON (identifiant de requête dans la réponse et dans les logs de nginx et de l'API, événements de connexion, aucun mot de passe) ; puis sauvegarde, suppression d'un compte, `make prod-restore FILE=latest` et vérification que le compte est revenu |

Le job E2E ne démarre que si les tests API et le build passent. Pour rendre la CI obligatoire avant fusion : *Settings → Branches → Branch protection rule* sur `main`, cocher « Require status checks to pass ».

**Mises à jour des dépendances** (`.github/dependabot.yml`) : chaque lundi, Dependabot ouvre des pull requests pour Python, npm, les actions GitHub et les images Docker. Mises à jour mineures et correctives regroupées par écosystème, une PR par version majeure ; la CI vérifie chacune. Ruff est exclu : il est aussi épinglé dans `.pre-commit-config.yaml`, à mettre à jour à la main aux deux endroits.

Voir `docs/architecture.md` pour le détail de l'organisation.
