"""Per-user coin watchlist — starred Indodax pairs, pinned above the Top 10 on the dashboard.

Entries are enriched on read with the live Indodax ticker and the coin's standing in the
current locked snapshot, so a starred coin stays useful even when it misses the Top 10.
"""

from datetime import datetime, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException

from lib import engine, market
from lib.auth import get_current_user
from lib.dates import now_utc
from lib.db import db
from models.schemas import WatchlistAddIn, WatchlistEntry

router = APIRouter(prefix="/watchlist", tags=["watchlist"])

MAX_ENTRIES = 25


@router.get("", response_model=list[WatchlistEntry])
async def list_watchlist(user: dict = Depends(get_current_user)):
    docs = await db.watchlist.find({"user_id": user["id"]}).sort("created_at", -1).to_list(MAX_ENTRIES)
    if not docs:
        return []

    tickers: dict[str, dict[str, float]] = {}
    pairs_meta: dict[str, dict] = {}
    try:
        async with httpx.AsyncClient(follow_redirects=True) as client:
            tickers = await market.get_ticker_all(client)
            pairs_meta = {p["ticker_id"]: p for p in await market.get_pairs(client)}
    except Exception:
        pass  # degrade to stored fields — never fail the list on an upstream hiccup

    # rank/score from the current locked daily snapshot
    start, _ = engine._snap_coord("daily", now_utc())
    snap = await db.snapshots.find_one({"kind": "daily", "period_start": start}, {"items": 1})
    by_pair = {it["pair"]: it for it in (snap or {}).get("items") or []}

    out: list[WatchlistEntry] = []
    for d in docs:
        pair = d["pair"]
        meta = pairs_meta.get(pair, {})
        t = tickers.get(pair)
        item = by_pair.get(pair)
        out.append(
            WatchlistEntry(
                pair=pair,
                coin=d.get("coin") or pair.split("_")[0],
                name=meta.get("traded_currency_unit") or d.get("name") or pair.split("_")[0].upper(),
                logo=meta.get("url_logo") or d.get("logo") or "",
                created_at=engine.aware_or_none(d.get("created_at")),
                last_price=t["last"] if t else None,
                high_24h=t["high"] if t else None,
                low_24h=t["low"] if t else None,
                vol_idr=t["vol_idr"] if t else None,
                snapshot_rank=item["rank"] if item else None,
                score=item["score"] if item else None,
                est_gain_pct=item["est_gain_pct"] if item else None,
                in_snapshot=bool(item),
            )
        )
    return out


@router.post("", response_model=WatchlistEntry, status_code=201)
async def add_watchlist(body: WatchlistAddIn, user: dict = Depends(get_current_user)):
    pair = body.pair.strip().lower()
    async with httpx.AsyncClient(follow_redirects=True) as client:
        pairs = await market.get_pairs(client)
    meta = next((p for p in pairs if p["ticker_id"] == pair), None)
    if not meta:
        raise HTTPException(status_code=404, detail="Pair tidak ditemukan di market Indodax")

    count = await db.watchlist.count_documents({"user_id": user["id"]})
    existing = await db.watchlist.find_one({"user_id": user["id"], "pair": pair}, {"_id": 1})
    if not existing and count >= MAX_ENTRIES:
        raise HTTPException(status_code=400, detail=f"Maksimal {MAX_ENTRIES} koin di watchlist")

    now = datetime.now(timezone.utc)
    await db.watchlist.update_one(
        {"user_id": user["id"], "pair": pair},
        {
            "$set": {
                "coin": meta["traded_currency"],
                "name": meta.get("traded_currency_unit") or meta["traded_currency"].upper(),
                "logo": meta.get("url_logo") or "",
            },
            "$setOnInsert": {"user_id": user["id"], "pair": pair, "created_at": now},
        },
        upsert=True,
    )
    return WatchlistEntry(
        pair=pair,
        coin=meta["traded_currency"],
        name=meta.get("traded_currency_unit") or meta["traded_currency"].upper(),
        logo=meta.get("url_logo") or "",
        created_at=now,
    )


@router.delete("/{pair}")
async def remove_watchlist(pair: str, user: dict = Depends(get_current_user)):
    res = await db.watchlist.delete_one({"user_id": user["id"], "pair": pair.strip().lower()})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Koin tidak ada di watchlist")
    return {"ok": True}
