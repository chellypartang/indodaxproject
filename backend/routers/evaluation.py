"""Evaluation + export routes — projection vs Actual High accuracy."""

import csv
import io
from datetime import timedelta

from fastapi import APIRouter, Depends, Query, Response

from lib import engine
from lib.auth import get_current_user
from lib.dates import now_utc
from lib.db import db
from models.schemas import CoinAccuracyResponse, EvalResponse, MonthlyEvalResponse

router = APIRouter(prefix="/evaluation", tags=["evaluation"], dependencies=[Depends(get_current_user)])


@router.get("/daily", response_model=EvalResponse)
async def evaluation_daily(limit: int = Query(14, le=60)):
    latest_doc = await engine.latest_evaluated("daily")
    latest = engine.eval_detail(latest_doc) if latest_doc else None
    return EvalResponse(
        latest=latest,
        history=await engine.evaluation_history("daily", limit),
    )


@router.get("/weekly", response_model=EvalResponse)
async def evaluation_weekly(limit: int = Query(8, le=30)):
    latest_doc = await engine.latest_evaluated("weekly")
    latest = engine.eval_detail(latest_doc) if latest_doc else None
    return EvalResponse(
        latest=latest,
        history=await engine.evaluation_history("weekly", limit),
    )


@router.get("/monthly", response_model=MonthlyEvalResponse)
async def evaluation_monthly():
    recap = await engine.monthly_recap()
    return MonthlyEvalResponse(**recap)


@router.get("/by-coin", response_model=CoinAccuracyResponse)
async def evaluation_by_coin(
    kind: str = Query("daily"),
    min_appearances: int = Query(1, ge=1, le=30),
):
    if kind not in ("daily", "weekly"):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="kind harus 'daily' atau 'weekly'")
    recap = await engine.accuracy_by_coin(kind, min_appearances=min_appearances)
    return CoinAccuracyResponse(**recap)


def _csv_response(filename: str, header: list[str], rows: list[list]) -> Response:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(header)
    writer.writerows(rows)
    return Response(
        content=buf.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"},
    )


@router.get("/export/analysis/{kind}")
async def export_analysis(kind: str, _user: dict = Depends(get_current_user)):
    if kind not in ("daily", "weekly"):
        from fastapi import HTTPException

        raise HTTPException(status_code=422, detail="kind harus 'daily' atau 'weekly'")
    start, _ = engine._snap_coord(kind, now_utc())
    doc = await db.snapshots.find_one({"kind": kind, "period_start": start})
    if not doc:
        from fastapi import HTTPException

        raise HTTPException(status_code=404, detail="Belum ada snapshot untuk periode ini")
    header = [
        "rank", "pair", "coin", "entry_price_idr", "skor_hybrid", "skor_technical",
        "skor_fundamental", "bobot_technical", "bobot_fundamental", "est_gain_pct",
        "target_price_idr", "rsi", "macd_hist", "support_idr", "resistance_idr",
        "trend", "volume_trend", "volume_ratio", "vol_idr_24j",
        "entry_low_idr", "entry_high_idr", "tp1_idr", "tp2_idr", "tp3_idr",
        "tp1_pct", "tp2_pct", "tp3_pct", "stop_loss_idr", "stop_loss_pct", "risk_reward",
        "proj_headroom_pct", "proj_trend_factor", "proj_volume_factor",
        "proj_liquidity_factor", "proj_momentum_pct", "proj_horizon_factor",
        "period_start", "generated_at",
    ]
    rows = []
    for it in doc.get("items") or []:
        tech = it.get("technical") or {}
        proj = it.get("projection") or {}
        lv = it.get("levels") or {}
        rows.append([
            it.get("rank"), it.get("pair"), it.get("name"), it.get("entry_price"),
            it.get("score"), it.get("technical_score"), it.get("fundamental_score"),
            doc["weights"]["technical"], doc["weights"]["fundamental"],
            it.get("est_gain_pct"), it.get("target_price"),
            tech.get("rsi"), tech.get("macd_hist"), tech.get("support"), tech.get("resistance"),
            tech.get("trend"), tech.get("volume_trend"), tech.get("volume_ratio"),
            it.get("vol_idr"),
            lv.get("entry_low"), lv.get("entry_high"),
            lv.get("tp1"), lv.get("tp2"), lv.get("tp3"),
            lv.get("tp1_pct"), lv.get("tp2_pct"), lv.get("tp3_pct"),
            lv.get("stop_loss"), lv.get("stop_loss_pct"), lv.get("risk_reward"),
            proj.get("headroom_pct"), proj.get("trend_factor"), proj.get("volume_factor"),
            proj.get("liquidity_factor"), proj.get("momentum_pct"), proj.get("horizon_factor"),
            doc["period_start"], doc.get("generated_at"),
        ])
    return _csv_response(f"analisis-{kind}.csv", header, rows)


@router.get("/export/evaluation/{kind}")
async def export_evaluation(kind: str, days: int = Query(30, le=180), _user: dict = Depends(get_current_user)):
    from fastapi import HTTPException

    if kind not in ("daily", "weekly"):
        raise HTTPException(status_code=422, detail="kind harus 'daily' atau 'weekly'")
    since = now_utc() - timedelta(days=days)
    docs = await db.snapshots.find(
        {"kind": kind, "actuals_recorded": True, "period_end": {"$gte": since}}
    ).sort("period_end", 1).to_list(120)
    header = [
        "period_start", "period_end", "pair", "coin", "projected_pct", "entry_price_idr",
        "actual_high_idr", "actual_pct", "deviation_pct", "target_hit",
    ]
    rows = []
    for doc in docs:
        by_pair = {it["pair"]: it for it in doc.get("items") or []}
        for tid, a in (doc.get("actuals") or {}).items():
            item = by_pair.get(tid, {})
            rows.append([
                doc["period_start"], doc["period_end"], tid, item.get("name"),
                a.get("projected_pct"), a.get("entry_price"), a.get("actual_high"),
                a.get("actual_pct"), a.get("deviation_pct"), a.get("target_hit"),
            ])
    return _csv_response(f"evaluasi-{kind}.csv", header, rows)
