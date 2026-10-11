"""Platform-cron plumbing: bearer auth + run-id idempotency.

The Emergent platform reads .emergent/crons.yml and calls these endpoints on schedule,
independently of whether anyone has the app open. Handlers must ack 2xx fast and do the
real work in the background.
"""

import hmac
import logging
import os

from fastapi import Header, HTTPException, Request

from lib.dates import now_utc
from lib.db import db

logger = logging.getLogger(__name__)


def verify_cron_auth(authorization: str | None) -> None:
    """Constant-time bearer check against WEBHOOK_CRON_SECRET; 401 on any mismatch."""
    secret = os.environ.get("WEBHOOK_CRON_SECRET", "")
    if not secret:
        logger.error("WEBHOOK_CRON_SECRET is not configured")
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Unauthorized")
    token = authorization.split(" ", 1)[1].strip()
    if not hmac.compare_digest(token, secret):
        raise HTTPException(status_code=401, detail="Unauthorized")


async def read_envelope(request: Request) -> dict:
    """Parse the webhook envelope; an empty body is tolerated (manual invocation)."""
    try:
        body = await request.body()
        if not body:
            return {}
        payload = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid JSON body")
    if payload is None:
        return {}
    if not isinstance(payload, dict):
        raise HTTPException(status_code=400, detail="Envelope must be an object")
    return payload


async def claim_run(job: str, run_id: str | None) -> bool:
    """True when this delivery is new, False when it is a duplicate of one already claimed."""
    if not run_id:
        return True  # no id to dedupe on (manual call) — let it through
    try:
        await db.cron_runs.insert_one(
            {"_id": f"{job}:{run_id}", "job": job, "run_id": run_id, "claimed_at": now_utc()}
        )
        return True
    except Exception:
        return False  # duplicate key -> already delivered
