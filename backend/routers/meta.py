"""Meta routes — server-anchored time, next snapshot runs, Indodax sync status."""

from fastapi import APIRouter

from lib import engine
from lib.dates import WITA, daily_period, now_utc, weekly_period
from models.schemas import MetaStatusOut, SyncStatusOut

router = APIRouter(prefix="/meta", tags=["meta"])


@router.get("/status", response_model=MetaStatusOut)
async def status():
    now = now_utc()
    _, daily_end = daily_period(now)
    next_weekly = weekly_period(now)[1]
    sync_doc = await engine.get_sync()
    sync = SyncStatusOut(
        last_ticker_sync_at=engine.aware_or_none(sync_doc.get("last_ticker_sync_at")),
        last_ticker_ok=bool(sync_doc.get("last_ticker_ok", True)),
        last_ticker_error=sync_doc.get("last_ticker_error"),
        last_generation_at=engine.aware_or_none(sync_doc.get("last_generation_at")),
        last_generation_error=sync_doc.get("last_generation_error"),
        universe_count=sync_doc.get("universe_count", 0),
        candidates_last_run=sync_doc.get("candidates_last_run", 0),
    )
    return MetaStatusOut(
        server_time=now,
        wita_time=now.astimezone(WITA).isoformat(),
        next_daily_run=daily_end,
        next_weekly_run=next_weekly,
        sync=sync,
    )
