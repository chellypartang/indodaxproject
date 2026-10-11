"""Technical indicator math — pure functions on OHLCV candles.

A candle is a dict {ts, o, h, l, c, v} with float prices (any currency; levels are
scaled to IDR by the engine) sorted oldest -> newest.
"""

from typing import Any


def sma(values: list[float], period: int) -> float | None:
    if len(values) < period:
        return None
    return sum(values[-period:]) / period


def ema_series(values: list[float], period: int) -> list[float]:
    if not values:
        return []
    k = 2 / (period + 1)
    out = [values[0]]
    for v in values[1:]:
        out.append(v * k + out[-1] * (1 - k))
    return out


def rsi(closes: list[float], period: int = 14) -> float | None:
    """Wilder's RSI."""
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))]
    gains = [max(d, 0.0) for d in deltas]
    losses = [max(-d, 0.0) for d in deltas]
    avg_g = sum(gains[:period]) / period
    avg_l = sum(losses[:period]) / period
    for i in range(period, len(deltas)):
        avg_g = (avg_g * (period - 1) + gains[i]) / period
        avg_l = (avg_l * (period - 1) + losses[i]) / period
    if avg_l == 0:
        return 100.0
    rs = avg_g / avg_l
    return 100.0 - 100.0 / (1.0 + rs)


def macd(closes: list[float], fast: int = 12, slow: int = 26, signal: int = 9) -> dict | None:
    """Latest MACD line, signal and histogram (plus previous histogram for slope)."""
    if len(closes) < slow + signal:
        return None
    f = ema_series(closes, fast)
    s = ema_series(closes, slow)
    line = [a - b for a, b in zip(f, s)]
    sig = ema_series(line[-(slow + signal):], signal)
    if len(sig) < 2:
        return None
    return {
        "macd": line[-1],
        "signal": sig[-1],
        "hist": line[-1] - sig[-1],
        "hist_prev": line[-2] - sig[-2],
    }


def technical_detail(candles: list[dict], timeframe: str = "daily", source: str = "okx") -> dict[str, Any]:
    """Full technical breakdown + composite score (0-100) for one timeframe.

    daily  -> 1H candles (last 24h window focus)
    weekly -> 1D candles (multi-day trend focus)
    """
    closes = [c["c"] for c in candles]
    highs = [c["h"] for c in candles]
    lows = [c["l"] for c in candles]
    vols = [c["v"] for c in candles]
    last = closes[-1]

    lookback_high = min(len(candles), 24 if timeframe == "daily" else 14)
    lookback_low = min(len(candles), 24 if timeframe == "daily" else 14)
    lookback_res = min(len(candles), 72 if timeframe == "daily" else 30)

    support = min(lows[-lookback_low:])
    resistance = max(highs[-lookback_res:])
    s20 = sma(closes, 20)
    s50 = sma(closes, 50)
    r = rsi(closes) or 50.0
    m = macd(closes) or {"macd": 0.0, "signal": 0.0, "hist": 0.0, "hist_prev": 0.0}

    v_recent = sum(vols[-6:]) / max(1, len(vols[-6:]))
    v_prior = sum(vols[-30:-6]) / max(1, len(vols[-30:-6])) if len(vols) >= 30 else v_recent
    vol_ratio = v_recent / v_prior if v_prior > 0 else 1.0
    if vol_ratio >= 1.3:
        volume_trend = "naik"
    elif vol_ratio >= 0.8:
        volume_trend = "stabil"
    else:
        volume_trend = "turun"

    bars_back = min(len(closes), 25 if timeframe == "daily" else 8)
    change_pct = (last / closes[-bars_back] - 1) * 100 if len(closes) >= bars_back and closes[-bars_back] else 0.0

    # --- composite score: trend (60) + momentum (43) + support/resistance (20) + volume (15) = 138 max
    trend_pts = 0
    if s20 and last > s20:
        trend_pts += 25
    if s50 and last > s50:
        trend_pts += 20
    if s20 and s50 and s20 > s50:
        trend_pts += 15

    if 45 <= r <= 65:
        mom_pts = 20
    elif 65 < r <= 75:
        mom_pts = 14
    elif 35 <= r < 45:
        mom_pts = 8
    elif r > 75:  # overbought — chase risk
        mom_pts = 7
    else:
        mom_pts = 0
    if m["hist"] > 0:
        mom_pts += 15
    if m["hist"] > m["hist_prev"]:
        mom_pts += 8

    span = resistance - support
    pos = (last - support) / span if span > 0 else 0.5
    sr_pts = 20 if pos < 0.35 else (12 if pos < 0.7 else 4)
    vol_pts = 15 if vol_ratio >= 1.3 else (8 if vol_ratio >= 0.8 else 3)

    score = round(min(100.0, (trend_pts + mom_pts + sr_pts + vol_pts) / 138.0 * 100.0), 1)

    if s20 and s50:
        trend = "bullish" if (last > s20 and m["hist"] > 0) else ("bearish" if (last < s20 and m["hist"] < 0) else "netral")
    else:
        trend = "netral"

    note = {
        ("daily", "okx"): "Candle 1H (OKX), window 24 jam",
        ("weekly", "okx"): "Candle 1D (OKX), window 30 hari",
        ("daily", "coinbase"): "Candle 1H (Coinbase), window 24 jam",
        ("weekly", "coinbase"): "Candle 1D (Coinbase), window 30 hari",
        ("daily", "indodax_trades"): "Candle 15m dari trade Indodax (window ~6 jam)",
        ("weekly", "indodax_trades"): "Candle 15m dari trade Indodax (window terbatas)",
    }.get((timeframe, source), f"Candle ({source})")

    return {
        "rsi": round(r, 1),
        "macd": m["macd"],
        "macd_signal": m["signal"],
        "macd_hist": m["hist"],
        "sma20": s20,
        "sma50": s50,
        "support": support,
        "resistance": resistance,
        "range_position": round(pos, 3),
        "volume_trend": volume_trend,
        "volume_ratio": round(vol_ratio, 3),
        "trend": trend,
        "change_pct": round(change_pct, 2),
        "score": score,
        "source": source,
        "timeframe_note": note,
    }


def trade_levels(detail: dict, entry: float, est_gain_pct: float, kind: str) -> dict:
    """Actionable trade plan: entry zone, a TP1/TP2/TP3 ladder, stop loss and risk/reward.

    - TP ladder is proportional to the model's projection, so TP2 always equals the
      projected target and the ladder stays monotonic (TP1 < TP2 < TP3).
      Where a real resistance level sits inside the ladder it is reported as the key level.
    - Stop loss is anchored just under support, but clamped so risk never exceeds
      max_risk (8% daily / 14% weekly) nor falls under 1.5%.
    """
    support = detail.get("support")
    resistance = detail.get("resistance")

    # --- take-profit ladder
    tp1_pct = round(est_gain_pct * 0.5, 2)
    tp2_pct = round(est_gain_pct, 2)
    tp3_pct = round(est_gain_pct * 1.75, 2)

    # --- entry zone: a small band around price, never below support
    entry_low = entry * 0.985
    if support and support < entry:
        entry_low = max(entry_low, support)
    entry_high = entry * 1.005

    # --- stop loss
    max_risk = 14.0 if kind == "weekly" else 8.0
    min_risk = 1.5
    if support and support < entry:
        # anchor just under the support that actually held
        sl = max(support * 0.985, entry * (1 - max_risk / 100.0))
    else:
        # no support below price: fall back to a moderate stop, not the widest allowed —
        # the least information should not buy the most risk
        sl = entry * (1 - (max_risk / 2.0) / 100.0)
    sl = min(sl, entry * (1 - min_risk / 100.0))   # always keep a real stop
    sl_pct = (sl / entry - 1) * 100.0

    risk = entry - sl
    reward = entry * tp2_pct / 100.0
    risk_reward = round(reward / risk, 2) if risk > 0 else None

    key_level = None
    if resistance and entry * (1 + tp1_pct / 100.0) <= resistance <= entry * (1 + tp3_pct / 100.0):
        key_level = round(resistance, 8)

    return {
        "entry": round(entry, 8),
        "entry_low": round(entry_low, 8),
        "entry_high": round(entry_high, 8),
        "tp1": round(entry * (1 + tp1_pct / 100.0), 8),
        "tp2": round(entry * (1 + tp2_pct / 100.0), 8),
        "tp3": round(entry * (1 + tp3_pct / 100.0), 8),
        "tp1_pct": tp1_pct,
        "tp2_pct": tp2_pct,
        "tp3_pct": tp3_pct,
        "stop_loss": round(sl, 8),
        "stop_loss_pct": round(sl_pct, 2),
        "risk_reward": risk_reward,
        "max_risk_pct": max_risk,
        "support": round(support, 8) if support else None,
        "resistance": round(resistance, 8) if resistance else None,
        "key_resistance": key_level,
    }


def estimate_gain_pct(
    detail: dict,
    entry_idr: float,
    kind: str,
    vol_idr: float | None = None,
) -> tuple[float, dict]:
    """Deterministic upside estimate (%) with an auditable factor breakdown.

    est = headroom(to resistance) x trend x volume x liquidity + momentum, x horizon

    - headroom   : distance from price to resistance, scaled by the technical score
    - trend      : explicit multiplier from the MA/MACD trend verdict + MA stacking
    - volume     : explicit multiplier from the recent-vs-prior volume ratio
                   (a breakout on rising volume is worth more than one on fading volume)
    - liquidity  : damps thin markets, where any projection is mostly noise (uses 24h IDR turnover)
    - momentum   : small RSI/MACD kicker
    - horizon    : weekly windows get more room to run than daily ones
    """
    score = float(detail.get("score") or 50.0)

    # --- headroom to resistance
    headroom = 0.0
    if detail.get("resistance") and entry_idr:
        dist = (detail["resistance"] - entry_idr) / entry_idr * 100.0
        headroom = max(0.1, min(12.0, dist)) * (0.6 + score / 125.0)

    # --- TREND factor (explicit)
    trend = detail.get("trend") or "netral"
    trend_factor = {"bullish": 1.18, "netral": 1.0, "bearish": 0.78}.get(trend, 1.0)
    sma20, sma50 = detail.get("sma20"), detail.get("sma50")
    if sma20 and sma50 and entry_idr:
        if entry_idr > sma20 > sma50:
            trend_factor *= 1.08  # full bullish MA stack
        elif entry_idr < sma20 < sma50:
            trend_factor *= 0.90  # full bearish MA stack
    trend_factor = round(min(1.30, max(0.70, trend_factor)), 3)

    # --- VOLUME factor (explicit): participation behind the move
    ratio = detail.get("volume_ratio")
    if ratio is None:
        volume_factor = 1.0
    elif ratio >= 2.0:
        volume_factor = 1.30
    elif ratio >= 1.5:
        volume_factor = 1.20
    elif ratio >= 1.2:
        volume_factor = 1.10
    elif ratio >= 0.8:
        volume_factor = 1.0
    elif ratio >= 0.5:
        volume_factor = 0.88
    else:
        volume_factor = 0.75

    # --- liquidity damping: a thin orderbook cannot be trusted to deliver the move
    if vol_idr is None:
        liquidity_factor = 1.0
    elif vol_idr >= 5_000_000_000:
        liquidity_factor = 1.0
    elif vol_idr >= 1_000_000_000:
        liquidity_factor = 0.97
    elif vol_idr >= 100_000_000:
        liquidity_factor = 0.92
    elif vol_idr >= 10_000_000:
        liquidity_factor = 0.85
    else:
        liquidity_factor = 0.75

    # --- momentum kicker
    momentum = 0.0
    if detail.get("rsi"):
        momentum += max(0.0, float(detail["rsi"]) - 50.0) * 0.03
    if (detail.get("macd_hist") or 0) > 0:
        momentum += 0.2

    horizon_factor = 1.6 if kind == "weekly" else 1.0
    # Cap scales with the horizon: a 30% ceiling on a weekly window pinned nearly every
    # strong candidate at the cap and destroyed the descending ranking.
    cap = 60.0 if kind == "weekly" else 30.0
    raw = (headroom * trend_factor * volume_factor * liquidity_factor + momentum) * horizon_factor
    est = round(max(0.2, min(cap, raw)), 2)

    breakdown = {
        "headroom_pct": round(headroom, 2),
        "trend_factor": trend_factor,
        "volume_factor": round(volume_factor, 3),
        "liquidity_factor": round(liquidity_factor, 3),
        "momentum_pct": round(momentum, 2),
        "horizon_factor": horizon_factor,
        "volume_ratio": round(float(ratio), 2) if ratio is not None else None,
        "vol_idr": vol_idr,
        "trend": trend,
        "final_pct": est,
    }
    return est, breakdown

