# syntax=docker/dockerfile:1
# Images de l'application, construites depuis le dossier code/ :
#   docker build -f docker/Dockerfile --target api      code  -> API FastAPI (:8000), dev et prod
#   docker build -f docker/Dockerfile --target web      code  -> Serveur de dev Vue / Vite (:5173)
#   docker build -f docker/Dockerfile --target web-prod code  -> Interface buildée servie par nginx (:8080)
#   docker build -f docker/Dockerfile --target proxy    code  -> HTTPS par Caddy devant nginx (:80, :443)
#   docker build -f docker/Dockerfile --target backup   code  -> Sauvegardes quotidiennes de PostgreSQL
# Dans les conteneurs, le code est dans /srv/code.

FROM python:3.14-slim AS api
WORKDIR /srv/code
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY app/ app/
COPY templates/ templates/
# Migrations de la base : au démarrage de l'API en dev, par « python -m app.cli migrate » en prod
COPY alembic.ini .
COPY migrations/ migrations/
# L'API ne tourne pas en root
RUN useradd --system --uid 10001 --no-create-home app
USER app
EXPOSE 8000
# Disponibilité, base de données comprise (utilisé par depends_on: service_healthy)
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/ready', timeout=3)"]
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

FROM node:24-alpine AS web
WORKDIR /srv/code
COPY package*.json ./
RUN npm install
COPY index.html vite.config.ts tsconfig*.json env.d.ts ./
COPY public/ public/
COPY src/ src/
EXPOSE 5173
CMD ["npm", "run", "dev"]

# --- Production : build de l'interface, puis fichiers statiques servis par nginx ---------

FROM node:24-alpine AS web-build
WORKDIR /srv/code
COPY package*.json ./
RUN npm ci
COPY index.html vite.config.ts tsconfig*.json env.d.ts ./
COPY public/ public/
COPY src/ src/
RUN npm run build

# nginx sans root (écoute sur 8080) : sert l'interface et relaie /api vers l'API.
# API_UPSTREAM : adresse de l'API vue depuis ce conteneur (service « api » de Compose par défaut).
FROM nginxinc/nginx-unprivileged:stable-alpine AS web-prod
ENV API_UPSTREAM=http://api:8000
COPY <<'EOF' /etc/nginx/templates/default.conf.template
# Log d'accès en JSON, une ligne par requête, avec le même request_id que les logs de l'API
# ($uri : chemin sans la chaîne de requête, qui pourrait contenir des données sensibles)
log_format json_access escape=json '{"time":"$time_iso8601","level":"INFO","logger":"nginx",'
    '"event":"http.request","request_id":"$request_id","method":"$request_method",'
    '"path":"$uri","status":$status,"duration_s":$request_time,"bytes":$body_bytes_sent,'
    '"client_ip":"$remote_addr","user_agent":"$http_user_agent"}';

# Protocole vu par le client : celui transmis par Caddy (https), sinon celui de la connexion
map $http_x_forwarded_proto $client_proto {
    default $http_x_forwarded_proto;
    ""      $scheme;
}

server {
    listen 8080;
    server_name _;
    root /usr/share/nginx/html;
    server_tokens off;
    client_max_body_size 1m;

    # Derrière Caddy : adresse réelle du client lue dans X-Forwarded-For, seulement si la
    # requête vient d'un réseau privé (les réseaux Docker). Caddy remplace ce qu'envoie le client.
    set_real_ip_from 10.0.0.0/8;
    set_real_ip_from 172.16.0.0/12;
    set_real_ip_from 192.168.0.0/16;
    real_ip_header X-Forwarded-For;

    access_log /dev/stdout json_access;

    location /api/ {
        proxy_pass ${API_UPSTREAM};
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        # Adresse du client, utilisée par l'API pour limiter les tentatives de connexion
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $client_proto;
        # Identifiant de requête créé par nginx (celui envoyé par le client est remplacé),
        # repris dans les logs de l'API et renvoyé dans l'en-tête X-Request-ID
        proxy_set_header X-Request-ID $request_id;
    }

    # Fichiers buildés : leur nom contient un hash, ils peuvent être gardés en cache
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Application monopage : toute autre adresse renvoie index.html (Vue Router)
    location / {
        try_files $uri $uri/ /index.html;
        add_header Cache-Control "no-cache";
    }
}
EOF
COPY --from=web-build /srv/code/dist/ /usr/share/nginx/html/
EXPOSE 8080

# --- Production : HTTPS par Caddy, devant nginx ------------------------------------------
# DOMAIN : nom de domaine public (certificat Let's Encrypt obtenu et renouvelé automatiquement,
# le domaine doit pointer vers la machine, ports 80 et 443 ouverts) ; « localhost » : certificat
# de l'autorité interne de Caddy, pour les essais. HTTP est redirigé vers HTTPS.
# HSTS seulement pour un vrai domaine : sur localhost, il forcerait aussi le HTTPS en développement.
# Les en-têtes de sécurité (CSP...) sont posés ici, pas dans nginx : un seul endroit, et pas de
# piège d'héritage de add_header entre les blocs location de nginx.
FROM caddy:2-alpine AS proxy
COPY <<'EOF' /etc/caddy/Caddyfile
{
	# Pas d'installation de l'autorité interne dans le système (inutile dans un conteneur)
	skip_install_trust
}

{$DOMAIN} {
	encode zstd gzip

	@public not host localhost
	header @public Strict-Transport-Security "max-age=31536000"

	# En-têtes de sécurité, sur toutes les réponses (interface et API).
	# CSP : rien qui ne vienne de l'application elle-même, ni script ni style en ligne
	# (le thème initial est dans public/theme-init.js et .css). À élargir si l'interface charge
	# un jour des ressources externes (polices, CDN, API d'un autre domaine...).
	header {
		Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'"
		X-Content-Type-Options "nosniff"
		X-Frame-Options "DENY"
		Referrer-Policy "strict-origin-when-cross-origin"
		Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), usb=()"
		Cross-Origin-Opener-Policy "same-origin"
		# Pas de nom ni de version des serveurs dans les réponses
		-Server
	}

	reverse_proxy web:8080
}
EOF
# Caddy ne tourne pas en root. Ses données (certificats) et sa configuration vont dans
# /srv/caddy, qui lui appartient (les dossiers /data et /config de l'image sont à root).
ENV XDG_DATA_HOME=/srv/caddy/data XDG_CONFIG_HOME=/srv/caddy/config
RUN adduser -S -D -H -u 10002 proxy \
    && mkdir -p /srv/caddy/data /srv/caddy/config \
    && chown -R proxy /srv/caddy
USER proxy
EXPOSE 80 443 443/udp

# --- Production : sauvegardes de la base -------------------------------------------------
# Même version de PostgreSQL que le service « db » (pg_dump doit être au moins aussi récent).
#   backup          : tourne en continu, une sauvegarde par jour à BACKUP_HOUR (UTC)
#   backup now      : une sauvegarde tout de suite
#   backup list     : liste les sauvegardes
#   restore <nom>   : restaure une sauvegarde (« latest » : la plus récente), après en avoir
#                     fait une de l'état actuel
# Fichiers : /backups/<base>-AAAAMMJJ-HHMMSSZ.dump (format custom de pg_dump, compressé).
FROM postgres:18-alpine AS backup
COPY --chmod=755 <<'EOF' /usr/local/bin/backup
#!/bin/sh
set -eu
DIR=/backups
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
HOUR="${BACKUP_HOUR:-3}"
export PGHOST="${POSTGRES_HOST:-db}" PGPORT="${POSTGRES_PORT:-5432}"
export PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"

log() { echo "$(date -u +%Y-%m-%dT%H:%M:%SZ) $*"; }

# Écrit d'abord dans un fichier temporaire : une sauvegarde interrompue ne remplace rien.
# Chaque étape est vérifiée explicitement (« set -e » ne s'applique pas dans un « || »).
backup_now() {
  name="$PGDATABASE-$(date -u +%Y%m%d-%H%M%SZ).dump"
  tmp="$DIR/.$name.part"
  pg_dump --format=custom --no-owner --file="$tmp" || { rm -f "$tmp"; return 1; }
  # Archive relisible de bout en bout, sinon elle ne compte pas comme sauvegarde
  pg_restore --list "$tmp" > /dev/null || { rm -f "$tmp"; return 1; }
  mv "$tmp" "$DIR/$name" || return 1
  find "$DIR" -name "$PGDATABASE-*.dump" -mtime +"$KEEP_DAYS" -delete
  log "Sauvegarde $DIR/$name ($(du -h "$DIR/$name" | cut -f1))"
}

# Une tentative toutes les 10 minutes jusqu'à la réussite (base indisponible...)
backup_until_ok() {
  until backup_now; do
    log "Échec de la sauvegarde, nouvelle tentative dans 10 minutes" >&2
    sleep 600
  done
}

seconds_until_next_run() {
  now=$(date -u +%s)
  next=$(date -u -d "$(date -u +%Y-%m-%d) $(printf %02d "$HOUR"):00:00" +%s)
  [ "$next" -gt "$now" ] || next=$((next + 86400))
  echo $((next - now))
}

case "${1:-daemon}" in
  now) backup_now ;;
  list) ls -lh "$DIR"/*.dump 2>/dev/null || echo "Aucune sauvegarde dans $DIR" ;;
  daemon)
    log "Sauvegarde quotidienne à ${HOUR} h UTC, conservée ${KEEP_DAYS} jours, dans $DIR"
    # Pas de sauvegarde de moins de 24 h (premier démarrage, machine éteinte) : tout de suite
    if [ -z "$(find "$DIR" -name "$PGDATABASE-*.dump" -mmin -1440)" ]; then backup_until_ok; fi
    while true; do
      sleep "$(seconds_until_next_run)"
      backup_until_ok
    done
    ;;
  *) echo "Usage : backup [now|list]" >&2; exit 2 ;;
esac
EOF
COPY --chmod=755 <<'EOF' /usr/local/bin/restore
#!/bin/sh
set -eu
DIR=/backups
export PGHOST="${POSTGRES_HOST:-db}" PGPORT="${POSTGRES_PORT:-5432}"
export PGUSER="$POSTGRES_USER" PGPASSWORD="$POSTGRES_PASSWORD" PGDATABASE="$POSTGRES_DB"

[ $# -eq 1 ] || { echo "Usage : restore <sauvegarde>|latest   (liste : backup list)" >&2; exit 2; }
case "$1" in
  latest) file=$(ls -1t "$DIR/$PGDATABASE"-*.dump 2>/dev/null | head -n 1) ;;
  */*) file="$1" ;;
  *) file="$DIR/$1" ;;
esac
[ -n "$file" ] && [ -f "$file" ] || { echo "Sauvegarde introuvable : $1" >&2; exit 1; }

# Filet de sécurité : l'état actuel est sauvegardé avant d'être remplacé
echo "Sauvegarde de l'état actuel avant restauration..."
backup now

echo "Restauration de $file dans la base $PGDATABASE..."
# Une seule transaction : en cas d'erreur, la base reste telle qu'avant
pg_restore --clean --if-exists --no-owner --single-transaction --exit-on-error \
  --dbname="$PGDATABASE" "$file"
echo "Restauration terminée."
EOF
# Ne tourne pas en root ; le volume /backups lui appartient
RUN mkdir -p /backups && chown postgres:postgres /backups
USER postgres
# Sain tant qu'une sauvegarde a moins de 26 heures
HEALTHCHECK --interval=5m --timeout=10s --start-period=2m \
  CMD find /backups -name '*.dump' -mmin -1560 | grep -q .
ENTRYPOINT []
CMD ["backup"]
