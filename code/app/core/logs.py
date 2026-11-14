"""Logs de l'API : JSON en production (une ligne par événement), texte lisible en développement.

Chaque ligne porte l'identifiant de la requête en cours (request_id), repris de l'en-tête
X-Request-ID posé par nginx, ou créé ici. Il est renvoyé au client dans le même en-tête :
toutes les lignes d'une requête (nginx, API) se retrouvent avec cet identifiant.

Événements métier : logger.info("message", extra={"event": "auth.login.success", ...}).
Les champs d'« extra » deviennent des champs du JSON. Ne jamais y mettre de mot de passe
ni de token.
"""
import json
import logging
import re
import time
import uuid
from contextvars import ContextVar
from datetime import UTC, datetime

from app.core.config import settings

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

# Attributs standard d'un LogRecord : tout le reste vient d'« extra »
_STANDARD_ATTRS = set(vars(logging.LogRecord("", 0, "", 0, "", (), None))) | {
    "message",
    "asctime",
    "request_id",
    "color_message",  # ajouté par uvicorn
    "taskName",
}
# Identifiant reçu accepté tel quel seulement s'il est court et sans caractère spécial
_VALID_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")


def _extras(record: logging.LogRecord) -> dict:
    return {k: v for k, v in vars(record).items() if k not in _STANDARD_ATTRS}


class RequestIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        entry = {
            "time": datetime.fromtimestamp(record.created, UTC).isoformat(timespec="milliseconds"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
            "request_id": getattr(record, "request_id", "-"),
            **_extras(record),
        }
        if record.exc_info:
            entry["exception"] = self.formatException(record.exc_info)
        return json.dumps(entry, ensure_ascii=False, default=str)


class TextFormatter(logging.Formatter):
    def __init__(self) -> None:
        super().__init__("%(asctime)s %(levelname)-7s %(name)s [%(request_id)s] %(message)s")

    def format(self, record: logging.LogRecord) -> str:
        line = super().format(record)
        extras = _extras(record)
        if extras:
            line += "  " + " ".join(f"{k}={v}" for k, v in extras.items())
        return line


def setup_logging() -> None:
    """Configure les logs de l'application et d'uvicorn (une seule sortie : stdout)."""
    handler = logging.StreamHandler()
    handler.addFilter(RequestIdFilter())
    handler.setFormatter(JsonFormatter() if settings.log_json else TextFormatter())

    root = logging.getLogger()
    root.handlers = [handler]
    root.setLevel(settings.log_level.upper())
    # uvicorn passe par la même sortie. Son log d'accès est remplacé par celui du middleware
    # ci-dessous, qui connaît l'identifiant de requête et la durée.
    for name in ("uvicorn", "uvicorn.error"):
        logging.getLogger(name).handlers = []
        logging.getLogger(name).propagate = True
    logging.getLogger("uvicorn.access").disabled = True
    # Bibliothèques trop bavardes au niveau INFO (client HTTP des tests)
    logging.getLogger("httpx2").setLevel(logging.WARNING)


access_logger = logging.getLogger("app.access")


class RequestLogMiddleware:
    """Middleware ASGI : identifiant de requête, en-tête X-Request-ID, log d'accès."""

    def __init__(self, app) -> None:
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)

        received = dict(scope["headers"]).get(b"x-request-id", b"").decode("latin-1")
        request_id = received if _VALID_REQUEST_ID.match(received) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        start = time.perf_counter()
        status = 500

        async def send_with_id(message):
            nonlocal status
            if message["type"] == "http.response.start":
                status = message["status"]
                message.setdefault("headers", [])
                message["headers"] = [
                    *message["headers"],
                    (b"x-request-id", request_id.encode("latin-1")),
                ]
            await send(message)

        try:
            await self.app(scope, receive, send_with_id)
        except Exception:
            access_logger.exception(
                "Erreur non gérée",
                extra={"event": "http.error", "method": scope["method"], "path": scope["path"]},
            )
            raise
        finally:
            path = scope["path"]
            client = scope.get("client")
            # Vérifications de santé (toutes les 10 s par Docker) : seulement en DEBUG
            level = logging.DEBUG if path.startswith(f"{settings.api_prefix}/health") else (
                logging.WARNING if status >= 500 else logging.INFO
            )
            access_logger.log(
                level,
                f"{scope['method']} {path} {status}",
                extra={
                    "event": "http.request",
                    "method": scope["method"],
                    "path": path,
                    "status": status,
                    "duration_ms": round((time.perf_counter() - start) * 1000, 1),
                    "client_ip": client[0] if client else None,
                },
            )
            request_id_var.reset(token)
