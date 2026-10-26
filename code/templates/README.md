# templates/

Templates Jinja2 utilisés par le backend (rendu côté serveur).

- `layouts/` : gabarits de base dont héritent les autres templates
- `partials/` : morceaux réutilisables (`{% include %}`)
- `pages/`   : pages HTML servies directement par le backend
- `emails/`  : contenus d'emails transactionnels

Rendu depuis le code Python :

```python
from app.core.templating import render
html = render("emails/welcome.html", user_name="Morgan")
```
