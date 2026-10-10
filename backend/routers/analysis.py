"""Analysis routes — locked snapshot reads, history, admin force-refresh, live coin detail."""

import asyncio

from fastapi import APIRouter, Depends, HTTPException, Query

from lib import engine
from lib.auth import get_current_user, require_admin
from lib.dates import now_utc
from lib.db import db
from models.schemas import (
    CurrentAnalysis,
    RefreshIn,
    Snapshot,
    SnapshotSummary,
    SnapshotItem,
)

router = APIRouter(prefix="/analysis", tags=["analysis"])

_KINDS = ("daily", "weekly")


def _check_kind(kind: str) -> str:
    if kind not in _KINDS:
        raise HTTPException(status_code=422, detail="kind harus 'daily' atau 'weekly'")
    return kind


@router.get("/current", response_model=CurrentAnalysis)
async def current_analysis(kind: str = Query("daily")):
    _check_kind(kind)
    start, end = engine._snap_coord(kind, now_utc())
    doc = await db.snapshots.find_one({"kind": kind, "period_start": start})
    if doc:
        return CurrentAnalysis(
            kind=kind,
            period_start=start,
            period_end=end,
            generating=False,
            snapshot=Snapshot(**engine.snapshot_out(doc)),
        )
    # Nothing locked yet for this window — kick generation in the background and say so.
    asyncio.create_task(engine.ensure_current(now_utc()))
    return CurrentAnalysis(kind=kind, period_start=start, period_end=end, generating=True, snapshot=None)


@router.get("/history", response_model=list[SnapshotSummary])
async def history(kind: str = Query("daily"), limit: int = Query(14, le=60)):
    _check_kind(kind)
    docs = await db.snapshots.find({"kind": kind}).sort("period_end", -1).to_list(limit)
    return [SnapshotSummary(**engine.snapshot_summary(d)) for d in docs]


@router.get("/snapshot/{snapshot_id}", response_model=Snapshot)
async def get_snapshot(snapshot_id: str):
    doc = await db.snapshots.find_one({"id": snapshot_id})
    if not doc:
        raise HTTPException(status_code=404, detail="Snapshot tidak ditemukan")
    return Snapshot(**engine.snapshot_out(doc))


@router.post("/refresh", response_model=Snapshot)
async def refresh(body: RefreshIn, _admin: dict = Depends(require_admin)):
    doc = await engine.generate_snapshot(body.kind, force=True)
    return Snapshot(**engine.snapshot_out(doc))


@router.get("/coin/{pair}", response_model=SnapshotItem)
async def coin_detail(pair: str, kind: str = Query("daily"), _user: dict = Depends(get_current_user)):
    _check_kind(kind)
    item = await engine.live_coin_detail(pair, kind)
    if not item:
        raise HTTPException(status_code=404, detail="Pair tidak ditemukan di market Indodax")
    return SnapshotItem(**item)
