"""Platform-cron endpoints — the authoritative snapshot scheduler.

Schedules live in .emergent/crons.yml and are fired by the Emergent platform, so the
06:00 WITA snapshot runs even when nobody has the web app open and no browser session
exists. Each handler authenticates, dedupes on the webhook run id, hands the real work
to a background task, and acks immediately.
"""

import asyncio
import logging

from fastapi import APIRouter, Header, Request

from lib import engine
from lib.cron import claim_run, read_envelope, verify_cron_auth
from lib.dates import now_utc
from lib.db import db
from lib.scheduler import sample_market

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/cron", tags=["cron"])


async def _record(job: str, run_id: str | None, status: str, detail: str | None = None) -> None:
    await db.cron_log.insert_one({
        "job": job, "run_id": run_id, "status": status, "detail": detail, "at": now_utc(),
    })


async def _run_snapshot(kind: str, run_id: str | None) -> None:
    """Background worker: close any finished window, then lock the new one."""
    try:
        await engine.finalize_due(now_utc())
        doc = await engine.generate_snapshot(kind, force=True)
        await _record(f"{kind}-snapshot", run_id, "ok", f"{len(doc.get('items') or [])} item")
        logger.info("cron %s-snapshot done: %d items", kind, len(doc.get("items") or []))
    except Exception as exc:
        logger.exception("cron %s-snapshot failed", kind)
        await _record(f"{kind}-snapshot", run_id, "error", str(exc)[:500])


async def _run_sample(run_id: str | None) -> None:
    try:
        now = now_utc()
        await sample_market(now)
        finalized = await engine.finalize_due(now)
        await engine.ensure_current(now)  # catch up a window missed while the pod was down
        await _record("market-sampler", run_id, "ok", f"{finalized} snapshot difinalisasi")
    except Exception as exc:
        logger.exception("cron sample failed")
        await _record("market-sampler", run_id, "error", str(exc)[:500])


@router.post("/daily-snapshot", status_code=202)
async def cron_daily_snapshot(
    request: Request,
    authorization: str | None = Header(default=None),
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    verify_cron_auth(authorization)
    envelope = await read_envelope(request)
    run_id = request.headers.get("X-Webhook-Id") or envelope.get("run_id")
    if not await claim_run("daily-snapshot", run_id):
        return {"status": "duplicate", "run_id": run_id}
    asyncio.create_task(_run_snapshot("daily", run_id))
    return {"status": "accepted", "job": "daily-snapshot", "run_id": run_id}


@router.post("/weekly-snapshot", status_code=202)
async def cron_weekly_snapshot(
    request: Request,
    authorization: str | None = Header(default=None),
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    verify_cron_auth(authorization)
    envelope = await read_envelope(request)
    run_id = request.headers.get("X-Webhook-Id") or envelope.get("run_id")
    if not await claim_run("weekly-snapshot", run_id):
        return {"status": "duplicate", "run_id": run_id}
    asyncio.create_task(_run_snapshot("weekly", run_id))
    return {"status": "accepted", "job": "weekly-snapshot", "run_id": run_id}


@router.post("/sample", status_code=202)
async def cron_sample(
    request: Request,
    authorization: str | None = Header(default=None),
):
    # Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
    verify_cron_auth(authorization)
    envelope = await read_envelope(request)
    run_id = request.headers.get("X-Webhook-Id") or envelope.get("run_id")
    if not await claim_run("market-sampler", run_id):
        return {"status": "duplicate", "run_id": run_id}
    asyncio.create_task(_run_sample(run_id))
    return {"status": "accepted", "job": "market-sampler", "run_id": run_id}
