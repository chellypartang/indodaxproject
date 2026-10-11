"""Covers: Admin pages reachable for the admin account (regression) - API side.

Verifies /api/users includes the seeded admin with role admin, and
/api/settings/weights returns the documented defaults (70/30 daily, 50/50 weekly).
"""
import httpx

from .conftest import api_url

ADMIN_EMAIL = "chellypartang@gmail.com"
ADMIN_PASSWORD = "Chelpar031"


def _login(c: httpx.Client):
    resp = c.post(
        api_url("/auth/login"),
        json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
    )
    assert resp.status_code == 200, resp.text


def test_admin_users_list_contains_seeded_admin():
    with httpx.Client(timeout=30.0) as c:
        _login(c)
        resp = c.get(api_url("/users"))
        assert resp.status_code == 200, resp.text
        users = resp.json()
        admin_rows = [u for u in users if u["email"] == ADMIN_EMAIL]
        assert len(admin_rows) == 1, f"admin row not found/unique: {users}"
        assert admin_rows[0]["role"] == "admin"


def test_settings_weights_defaults():
    with httpx.Client(timeout=30.0) as c:
        _login(c)
        resp = c.get(api_url("/settings/weights"))
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["daily"]["technical"] == 70
        assert body["daily"]["fundamental"] == 30
        assert body["weekly"]["technical"] == 50
        assert body["weekly"]["fundamental"] == 50


def test_users_endpoint_requires_auth():
    with httpx.Client(timeout=30.0) as c:
        resp = c.get(api_url("/users"))
        assert resp.status_code in (401, 403), resp.text
