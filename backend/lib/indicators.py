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
        "trend": trend,
        "change_pct": round(change_pct, 2),
        "score": score,
        "source": source,
        "timeframe_note": note,
    }


def estimate_gain_pct(detail: dict, entry_idr: float, kind: str) -> float:
    """Deterministic upside estimate (%) — distance to resistance, momentum-adjusted."""
    est = 0.0
    if detail.get("resistance") and entry_idr:
        res_idr = detail["resistance"]
        dist = (res_idr - entry_idr) / entry_idr * 100.0
        est += max(0.1, min(12.0, dist)) * (0.6 + detail.get("score", 50.0) / 125.0)
    if detail.get("rsi"):
        est += max(0.0, detail["rsi"] - 50.0) * 0.03
    if detail.get("macd_hist", 0) > 0:
        est += 0.2
    if kind == "weekly":
        est *= 1.6
    if est <= 0 and entry_idr:
        # ticker-only fallback: room back to the 24h high
        pass
    return round(max(0.2, min(30.0, est)), 2)
