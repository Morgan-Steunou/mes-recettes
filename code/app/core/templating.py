"""Moteur de templates Jinja2 pointant vers le dossier racine templates/."""
from fastapi.templating import Jinja2Templates
from jinja2 import Environment, FileSystemLoader, select_autoescape

from app.core.config import settings

# Pour les pages HTML rendues côté serveur (réponses FastAPI)
templates = Jinja2Templates(directory=str(settings.templates_dir))

# Pour générer du contenu hors requête HTTP (emails, documents...)
jinja_env = Environment(
    loader=FileSystemLoader(settings.templates_dir),
    autoescape=select_autoescape(["html", "xml"]),
)


def render(template_name: str, **context) -> str:
    """Rend un template en chaîne de caractères."""
    return jinja_env.get_template(template_name).render(app_name=settings.app_name, **context)
