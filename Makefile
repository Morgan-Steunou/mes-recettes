.PHONY: install api web test e2e lint up down

COMPOSE = docker compose -f docker/docker-compose.yml

install:  ## Installe les dépendances Python et JavaScript (et le navigateur des tests E2E)
	cd code && python -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
	cd code && npm install && npx playwright install chromium
	code/.venv/bin/pre-commit install

api:      ## Lance l'API en mode développement (http://localhost:8000)
	cd code && .venv/bin/uvicorn app.main:app --reload --reload-dir app --reload-dir templates

web:      ## Lance l'interface Vue (http://localhost:5173)
	cd code && npm run dev

test:     ## Lance les tests Python
	cd code && .venv/bin/pytest

e2e:      ## Lance les tests de bout en bout Playwright (base mes_recettes_test)
	cd code && npm run test:e2e

lint:     ## Vérifie le style du code
	code/.venv/bin/pre-commit run --all-files

up:       ## Lance tout avec Docker
	$(COMPOSE) up --build

down:
	$(COMPOSE) down
