"""Logs structurés : format JSON, identifiant de requête, événements d'authentification."""
import json
import logging
import sys
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient

from app.api.routes.auth import REFRESH_COOKIE
from app.core.config import Settings
from app.core.logs import (
    JsonFormatter,
    RequestIdFilter,
    RequestLogMiddleware,
    TextFormatter,
    request_id_var,
)
from app.main import app
from app.services import session_service
from tests.conftest import PASSWORD

SECRET = "cle-de-test-uniquement-" + "x" * 32


def events(caplog, name: str) -> list[logging.LogRecord]:
    return [r for r in caplog.records if getattr(r, "event", None) == name]


def make_record(**extra) -> logging.LogRecord:
    record = logging.LogRecord(
        "app.test", logging.WARNING, __file__, 1, "Bonjour %s", ("toi",), None
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return record


# --- Format ----------------------------------------------------------------------------------


def test_json_formatter_writes_one_json_object_with_extras():
    token = request_id_var.set("req-42")
    try:
        record = make_record(event="demo.event", user_id=7)
        RequestIdFilter().filter(record)
        line = JsonFormatter().format(record)
    finally:
        request_id_var.reset(token)

    assert "\n" not in line
    entry = json.loads(line)
    assert entry["level"] == "WARNING"
    assert entry["logger"] == "app.test"
    assert entry["message"] == "Bonjour toi"
    assert entry["request_id"] == "req-42"
    assert entry["event"] == "demo.event"
    assert entry["user_id"] == 7
    assert entry["time"].endswith("+00:00")


def test_json_formatter_includes_exception():
    try:
        raise ValueError("boum")
    except ValueError:
        record = make_record()
        record.exc_info = sys.exc_info()
    entry = json.loads(JsonFormatter().format(record))
    assert "ValueError: boum" in entry["exception"]


def test_text_formatter_is_readable():
    record = make_record(event="demo.event")
    RequestIdFilter().filter(record)
    line = TextFormatter().format(record)
    assert "WARNING" in line and "Bonjour toi" in line and "event=demo.event" in line


@pytest.mark.parametrize(
    "environment, log_format, expected",
    [("production", None, True), ("development", None, False), ("development", "json", True),
     ("production", "text", False)],
)
def test_json_by_default_in_production(environment, log_format, expected):
    s = Settings(
        environment=environment,
        debug=environment != "production",
        cors_origins=[] if environment == "production" else ["http://localhost:5173"],
        secret_key=SECRET,
        log_format=log_format,
    )
    assert s.log_json is expected


# --- Identifiant de requête et log d'accès ---------------------------------------------------


def test_response_carries_a_new_request_id(anon_client):
    r = anon_client.get("/api/health")
    request_id = r.headers["x-request-id"]
    assert len(request_id) == 32 and int(request_id, 16) >= 0
    assert anon_client.get("/api/health").headers["x-request-id"] != request_id


def test_request_id_from_proxy_is_kept(anon_client):
    r = anon_client.get("/api/health", headers={"X-Request-ID": "nginx-abc123"})
    assert r.headers["x-request-id"] == "nginx-abc123"


@pytest.mark.parametrize("bad", ["avec espace", "x" * 65, 'guillemet"', "<script>"])
def test_invalid_request_id_is_replaced(anon_client, bad):
    r = anon_client.get("/api/health", headers={"X-Request-ID": bad})
    assert r.headers["x-request-id"] != bad
    assert len(r.headers["x-request-id"]) == 32


def test_each_request_is_logged(enable_auth, anon_client, caplog):
    caplog.set_level(logging.INFO)
    anon_client.get("/api/recipes")

    [record] = events(caplog, "http.request")
    assert record.method == "GET"
    assert record.path == "/api/recipes"
    assert record.status == 401
    assert record.duration_ms >= 0


def test_health_checks_are_not_logged_at_info(anon_client, caplog):
    caplog.set_level(logging.INFO)
    anon_client.get("/api/health")
    assert events(caplog, "http.request") == []


# --- Événements d'authentification -----------------------------------------------------------


def test_login_events_never_contain_password(enable_auth, anon_client, create_user, caplog):
    caplog.set_level(logging.INFO)
    create_user("alice")
    anon_client.post("/api/auth/token", data={"username": "alice", "password": "mauvais-mdp"})
    r = anon_client.post("/api/auth/token", data={"username": "alice", "password": PASSWORD})

    [failure] = events(caplog, "auth.login.failure")
    assert failure.username == "alice"
    assert failure.levelname == "WARNING"
    [success] = events(caplog, "auth.login.success")
    assert success.username == "alice"
    assert events(caplog, "auth.session.started")

    secrets = [PASSWORD, "mauvais-mdp", r.json()["access_token"], r.cookies[REFRESH_COOKIE]]
    formatter = JsonFormatter()
    for record in caplog.records:
        line = formatter.format(record)
        assert not any(secret in line for secret in secrets), line


def test_throttled_login_is_logged(enable_auth, anon_client, create_user, caplog):
    caplog.set_level(logging.INFO)
    create_user("alice")
    for _ in range(6):
        anon_client.post("/api/auth/token", data={"username": "alice", "password": "faux-mdp"})

    [throttled] = events(caplog, "auth.login.throttled")
    assert throttled.username == "alice"


def test_reused_refresh_token_is_logged(enable_auth, create_user, caplog, monkeypatch):
    caplog.set_level(logging.INFO)
    create_user("alice")
    client = TestClient(app, base_url="https://testserver")
    client.post("/api/auth/token", data={"username": "alice", "password": PASSWORD})
    stolen = client.cookies[REFRESH_COOKIE]
    client.post("/api/auth/refresh")

    monkeypatch.setattr(session_service, "REUSE_GRACE", timedelta(seconds=-1))
    TestClient(app, base_url="https://testserver").post(
        "/api/auth/refresh", headers={"Cookie": f"{REFRESH_COOKIE}={stolen}"}
    )

    [reuse] = events(caplog, "auth.session.reuse_detected")
    assert reuse.levelname == "WARNING"
    assert reuse.session_id


def test_logout_is_logged(enable_auth, create_user, caplog):
    caplog.set_level(logging.INFO)
    create_user("alice")
    client = TestClient(app, base_url="https://testserver")
    client.post("/api/auth/token", data={"username": "alice", "password": PASSWORD})
    client.post("/api/auth/logout")

    [revoked] = events(caplog, "auth.session.revoked")
    assert revoked.reason == "logout"


def test_unhandled_error_is_logged_with_traceback(caplog):
    async def broken_app(scope, receive, send):
        raise RuntimeError("boum")

    client = TestClient(RequestLogMiddleware(broken_app), raise_server_exceptions=False)
    caplog.set_level(logging.INFO)
    r = client.get("/api/recipes", headers={"X-Request-ID": "req-boum"})

    assert r.status_code == 500
    [error] = events(caplog, "http.error")
    assert error.levelname == "ERROR"
    assert "RuntimeError: boum" in JsonFormatter().format(error)
    [access] = events(caplog, "http.request")
    assert access.status == 500 and access.levelname == "WARNING"
