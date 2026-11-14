"""Limitation des tentatives de connexion échouées (protection contre la force brute).

Deux compteurs sur une fenêtre glissante :
- par couple (adresse IP, identifiant) : bloque l'essai de mots de passe sur un compte ;
- par adresse IP, tous identifiants confondus : bloque l'essai d'une liste de comptes.
Un compte n'est jamais bloqué pour tout le monde : un attaquant ne peut pas empêcher
son propriétaire de se connecter depuis une autre adresse.

Les compteurs sont en mémoire, propres à chaque processus : avec plusieurs instances de
l'API, la limite réelle est multipliée par leur nombre. Pour une limite commune, les
déplacer dans un stockage partagé (Redis) ou limiter aussi au niveau du reverse proxy.
"""
import time
from collections import deque
from threading import Lock

from app.core.config import settings


class LoginThrottle:
    def __init__(self, max_failures: int, max_failures_per_ip: int, window_seconds: int):
        self.max_failures = max_failures
        self.max_failures_per_ip = max_failures_per_ip
        self.window = window_seconds
        self._failures: dict[tuple, deque[float]] = {}
        self._lock = Lock()

    @staticmethod
    def _keys(ip: str, username: str) -> tuple[tuple, tuple]:
        return ("pair", ip, username.strip().lower()), ("ip", ip)

    def _recent(self, key: tuple, now: float) -> deque[float]:
        """Échecs encore dans la fenêtre (les plus anciens sont oubliés)."""
        failures = self._failures.get(key, deque())
        while failures and failures[0] <= now - self.window:
            failures.popleft()
        if not failures:
            self._failures.pop(key, None)
        return failures

    def retry_after(self, ip: str, username: str) -> int | None:
        """Secondes à attendre avant de pouvoir réessayer, ou None si la tentative est permise."""
        now = time.monotonic()
        pair_key, ip_key = self._keys(ip, username)
        waits = []
        with self._lock:
            for key, limit in ((pair_key, self.max_failures), (ip_key, self.max_failures_per_ip)):
                failures = self._recent(key, now)
                if len(failures) >= limit:
                    # Débloqué quand l'échec qui fait dépasser la limite sort de la fenêtre
                    waits.append(failures[-limit] + self.window - now)
        return max(1, int(max(waits)) + 1) if waits else None

    def record_failure(self, ip: str, username: str) -> None:
        now = time.monotonic()
        with self._lock:
            for key in self._keys(ip, username):
                self._recent(key, now)
                self._failures.setdefault(key, deque()).append(now)

    def record_success(self, ip: str, username: str) -> None:
        """Une connexion réussie efface les échecs de ce couple (pas ceux de l'adresse IP)."""
        pair_key, _ = self._keys(ip, username)
        with self._lock:
            self._failures.pop(pair_key, None)

    def clear(self) -> None:
        with self._lock:
            self._failures.clear()


login_throttle = LoginThrottle(
    settings.login_max_failures,
    settings.login_max_failures_per_ip,
    settings.login_failure_window_seconds,
)
