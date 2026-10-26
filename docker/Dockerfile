# Une image par partie de l'application, construites depuis le dossier code/ :
#   docker build -f docker/Dockerfile --target api code   -> API FastAPI (:8000)
#   docker build -f docker/Dockerfile --target web code   -> Serveur de dev Vue / Vite (:5173)
# Dans les conteneurs, le code est dans /srv/code et la base dans /srv/data (comme sur la machine).

FROM python:3.12-slim AS api
WORKDIR /srv/code
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ app/
COPY templates/ templates/
# Migrations de la base, appliquées au démarrage de l'API
COPY alembic.ini .
COPY migrations/ migrations/
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM node:22-alpine AS web
WORKDIR /srv/code
COPY package*.json ./
RUN npm install
COPY index.html vite.config.js jsconfig.json ./
COPY public/ public/
COPY src/ src/
EXPOSE 5173
CMD ["npm", "run", "dev"]
