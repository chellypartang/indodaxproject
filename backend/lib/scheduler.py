"""Background scheduler — ticks every 30s and:

1. every 15 minutes: samples Indodax ticker_all -> price_history + running Actual High
   tracking for live snapshots + sync status refresh
2. finalizes snapshots whose window closed (locks Actual High results)
3. guarantees a locked snapshot exists for the current daily (06:00 WITA) and
   weekly (Monday 06:00 WITA) windows — the 06:00 WITA rollover lands here
"""

import logging
import time

import httpx

from lib import engine, market
from lib.dates import now_utc
from lib.db import db

logger = logging.getLogger(__name__)

TICK_SECONDS = 30
SAMPLE_SECONDS = 15 * 60
_last_sample = 0.0


async def _sample(now) -> None:
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            tickers = await market.get_ticker_all(client)
        await engine.record_running_actuals(tickers, now)
        prices = {tid: t["last"] for tid, t in tickers.items() if t["last"] > 0}
        if prices:
            await db.price_history.insert_one({"ts": now, "prices": prices})
        await engine._set_sync(
            last_ticker_sync_at=now, last_ticker_ok=True, last_ticker_error=None,
            universe_count=len(prices),
        )
    except Exception as exc:
        logger.warning("price sample failed: %s", exc)
        await engine._set_sync(last_ticker_ok=False, last_ticker_error=str(exc)[:500])


async def tick() -> None:
    global _last_sample
    now = now_utc()
    if time.time() - _last_sample >= SAMPLE_SECONDS:
        _last_sample = time.time()
        await _sample(now)
    await engine.finalize_due(now)
    await engine.ensure_current(now)


async def scheduler_loop() -> None:
    logger.info("scheduler started (tick %ss, sample %ss)", TICK_SECONDS, SAMPLE_SECONDS)
    while True:
        try:
            await tick()
        except Exception:
            logger.exception("scheduler tick failed")
        await asyncio.sleep(TICK_SECONDS)


import asyncio  # noqa: E402  (kept at bottom to keep the loop signature readable)
