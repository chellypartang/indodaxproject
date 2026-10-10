"""Market data layer — Indodax public API (universe + IDR tickers + trades) with
OKX / Coinbase klines as the historical-candle source (Indodax has no OHLC endpoint),
falling back to candles built from recent Indodax trades.

All calls are async httpx with short TTL in-memory caches so bursts (force refresh,
coin detail views) never hammer upstream APIs.
"""

import asyncio
import time
from typing import Any

import httpx

INDODAX_BASE = "https://indodax.com"
OKX_BASE = "https://www.okx.com"
COINBASE_BASE = "https://api.exchange.coinbase.com"

_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"


class TTLCache:
    def __init__(self) -> None:
        self._d: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        hit = self._d.get(key)
        if hit and hit[0] > time.monotonic():
            return hit[1]
        self._d.pop(key, None)
        return None

    def set(self, key: str, value: Any, ttl: float) -> None:
        self._d[key] = (time.monotonic() + ttl, value)


_cache = TTLCache()


async def fetch_json(client: httpx.AsyncClient, url: str, params: dict | None = None) -> Any:
    res = await client.get(url, params=params, headers={"User-Agent": _UA}, timeout=20.0)
    res.raise_for_status()
    return res.json()


# --- Indodax ---


async def get_pairs(client: httpx.AsyncClient) -> list[dict]:
    """IDR-market spot pairs (cached 6h)."""
    cached = _cache.get("indodax_pairs")
    if cached is not None:
        return cached
    raw = await fetch_json(client, f"{INDODAX_BASE}/api/pairs")
    pairs = [p for p in raw if p.get("base_currency") == "idr"]
    _cache.set("indodax_pairs", pairs, 6 * 3600)
    return pairs


async def get_ticker_all(client: httpx.AsyncClient) -> dict[str, dict[str, float]]:
    """Every IDR ticker keyed by ticker_id (btc_idr), values as floats (cached 45s)."""
    cached = _cache.get("ticker_all")
    if cached is not None:
        return cached
    raw = await fetch_json(client, f"{INDODAX_BASE}/api/ticker_all")
    out: dict[str, dict[str, float]] = {}
    for ticker_id, t in (raw.get("tickers") or {}).items():
        try:
            out[ticker_id] = {
                "last": float(t.get("last") or 0),
                "high": float(t.get("high") or 0),
                "low": float(t.get("low") or 0),
                "buy": float(t.get("buy") or 0),
                "sell": float(t.get("sell") or 0),
                "vol_idr": float(t.get("vol_idr") or 0),
                "vol_coin": float(t.get(f"vol_{ticker_id.split('_')[0]}") or 0),
            }
        except (ValueError, TypeError, AttributeError):
            continue
    _cache.set("ticker_all", out, 45)
    return out


async def get_trades(client: httpx.AsyncClient, pair_id: str) -> list[dict]:
    cached = _cache.get(f"trades_{pair_id}")
    if cached is not None:
        return cached
    try:
        raw = await fetch_json(client, f"{INDODAX_BASE}/api/trades/{pair_id}")
        trades = [
            {"ts": int(t["date"]), "price": float(t["price"]), "amount": float(t["amount"])}
            for t in raw
        ]
        trades.reverse()  # oldest first
        _cache.set(f"trades_{pair_id}", trades, 120)
        return trades
    except Exception:
        return []


# --- Global candles (OKX primary, Coinbase fallback, Indodax trades last resort) ---


async def okx_candles(client: httpx.AsyncClient, inst_id: str, bar: str, limit: int) -> list[dict]:
    cached = _cache.get(f"okx_{inst_id}_{bar}")
    if cached is not None:
        return cached
    try:
        raw = await fetch_json(
            client, f"{OKX_BASE}/api/v5/market/candles", {"instId": inst_id, "bar": bar, "limit": limit}
        )
        if str(raw.get("code")) != "0":
            return []
        rows = raw.get("data") or []
        candles = [
            {"ts": int(r[0]) / 1000, "o": float(r[1]), "h": float(r[2]), "l": float(r[3]),
             "c": float(r[4]), "v": float(r[5])}
            for r in rows
        ]
        candles.reverse()  # OKX returns newest first
        _cache.set(f"okx_{inst_id}_{bar}", candles, 600)
        return candles
    except Exception:
        return []


async def coinbase_candles(client: httpx.AsyncClient, coin: str, granularity: int) -> list[dict]:
    cached = _cache.get(f"cb_{coin}_{granularity}")
    if cached is not None:
        return cached
    try:
        raw = await fetch_json(
            client, f"{COINBASE_BASE}/products/{coin.upper()}-USD/candles", {"granularity": granularity}
        )
        candles = [
            {"ts": float(r[0]), "o": float(r[3]), "h": float(r[2]), "l": float(r[1]),
             "c": float(r[4]), "v": float(r[5])}
            for r in raw
        ]
        candles.reverse()
        _cache.set(f"cb_{coin}_{granularity}", candles, 600)
        return candles
    except Exception:
        return []


def candles_from_trades(trades: list[dict], bucket_minutes: int = 15) -> list[dict]:
    """Bucket raw trades into OHLCV candles."""
    if len(trades) < 8:
        return []
    bucket = bucket_minutes * 60
    out: dict[int, dict] = {}
    for t in trades:
        slot = int(t["ts"] // bucket) * bucket
        c = out.get(slot)
        if c is None:
            out[slot] = {"ts": slot, "o": t["price"], "h": t["price"], "l": t["price"],
                         "c": t["price"], "v": t["amount"]}
        else:
            c["h"] = max(c["h"], t["price"])
            c["l"] = min(c["l"], t["price"])
            c["c"] = t["price"]
            c["v"] += t["amount"]
    return [out[k] for k in sorted(out)]


async def get_candles(client: httpx.AsyncClient, coin: str, pair_id: str) -> dict | None:
    """1H + 1D candles for a coin (USD space), or None when every source fails."""
    symbol = coin.upper()
    inst = f"{symbol}-USDT"
    h1 = await okx_candles(client, inst, "1H", 200)
    d1 = await okx_candles(client, inst, "1D", 60)
    if len(h1) >= 30:
        return {"h1": h1, "d1": d1, "source": "okx", "price_ref": h1[-1]["c"]}

    h1c = await coinbase_candles(client, coin, 3600)
    d1c = await coinbase_candles(client, coin, 86400)
    if len(h1c) >= 30:
        return {"h1": h1c, "d1": d1c, "source": "coinbase", "price_ref": h1c[-1]["c"]}

    trades = await get_trades(client, pair_id)
    tc = candles_from_trades(trades, 15)
    if len(tc) >= 12:
        return {"h1": tc, "d1": [], "source": "indodax_trades", "price_ref": tc[-1]["c"]}
    return None


async def ping_indodax(client: httpx.AsyncClient) -> bool:
    try:
        await fetch_json(client, f"{INDODAX_BASE}/api/ticker/btcidr")
        return True
    except Exception:
        return False


# Keep a module-level semaphore for candidate fan-out (politeness toward OKX)
candidate_sem = asyncio.Semaphore(6)
