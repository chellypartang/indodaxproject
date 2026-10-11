"""Covers: Login gate and dashboard render (regression) - API side.

Verifies admin login works and /api/analysis/current returns a locked daily
snapshot with 10 ranked items (the data backing the dashboard table).
"""
import httpx

from .conftest import api_url

ADMIN_EMAIL = "chellypartang@gmail.com"
ADMIN_PASSWORD = "Chelpar031"


def test_admin_login_and_dashboard_snapshot_has_10_items():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(
            api_url("/auth/login"),
            json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD},
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["email"] == ADMIN_EMAIL
        assert body["role"] == "admin"

        me = c.get(api_url("/auth/me"))
        assert me.status_code == 200, me.text

        snap = c.get(api_url("/analysis/current"), params={"period": "daily"})
        assert snap.status_code == 200, snap.text
        snap_body = snap.json()
        items = snap_body["snapshot"]["items"]
        assert len(items) == 10, f"expected 10 items, got {len(items)}"
        ranks = [i["rank"] for i in items]
        assert ranks == sorted(ranks)
        for item in items:
            assert "score" in item and "est_gain_pct" in item


def test_login_rejects_bad_password():
    with httpx.Client(timeout=30.0) as c:
        resp = c.post(
            api_url("/auth/login"),
            json={"email": ADMIN_EMAIL, "password": "wrong-password"},
        )
        assert resp.status_code in (400, 401), resp.text
