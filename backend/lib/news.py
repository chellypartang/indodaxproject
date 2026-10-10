"""Fundamental analysis layer — RSS headlines from trusted crypto sources with
automatic keyword-based sentiment scoring, matched per coin.

Chosen default (no external API key): CoinDesk, Cointelegraph, Decrypt.
"""

import re
import time
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from typing import Any
import xml.etree.ElementTree as ET

import httpx

FEEDS: list[tuple[str, str]] = [
    ("CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Cointelegraph", "https://cointelegraph.com/rss"),
    ("Decrypt", "https://decrypt.co/feed"),
]

_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36"

POSITIVE_KEYWORDS = [
    "surge", "surg", "rally", "rallies", "bullish", "gains", "gain", "jumps", "jump", "soars",
    "soar", "rises", "rise", "climbs", "climb", "higher", "record high", "all-time high", "ath",
    "breakout", "adoption", "partnership", "upgrade", "approval", "approved", "etf", "inflow",
    "inflows", "accumulate", "accumulation", "buy", "buying", "buys", "launch", "launches",
    "mainnet", "milestone", "expands", "expansion", "institutional", "whale buys", "support",
    "bullish signal", "uptrend", "positive", "boost", "boosts", "win", "wins", "green",
    "recovery", "recovers", "strengthens", "strong demand", "staking", "burn", "burns",
]

NEGATIVE_KEYWORDS = [
    "crash", "crashes", "plunge", "plunges", "dump", "dumps", "bearish", "losses", "loss",
    "falls", "fall", "drop", "drops", "decline", "declines", "sink", "sinks", "slump",
    "lawsuit", "sues", "sued", "hack", "hacked", "exploit", "breach", "ban", "bans", "banned",
    "outflow", "outflows", "liquidation", "liquidations", "fear", "panic", "sell-off",
    "selloff", "selling", "warns", "warning", "risk", "fraud", "bankruptcy", "insolvent",
    "down", "concern", "concerns", "probe", "investigation", "crackdown", "laws", "tax",
    "sec charges", "delist", "delisting", "bearish signal", "downtrend", "negative", "weak",
]

MACRO_KEYWORDS = [
    "etf", "inflow", "outflow", "fed", "interest rate", "regulation", "sec", "ban", "adoption",
    "institutional", "whale", "halving", "upgrade", "macro", "rate cut", "rate hike", "dollar",
]

_word_re = re.compile(r"[a-z0-9$]+")
_tag_re = re.compile(r"<[^>]+>")


def _clean(text: str) -> str:
    text = _tag_re.sub(" ", text or "")
    text = text.replace("&amp;", "&").replace("&#8217;", "'").replace("&quot;", '"')
    text = text.replace("&lt;", "<").replace("&gt;", ">").replace("&nbsp;", " ")
    return re.sub(r"\s+", " ", text).strip()


def _sentiment_of(text: str) -> float:
    """Keyword polarity in [-1, 1]; 0 when no signal words appear."""
    words = set(_word_re.findall(text.lower()))
    joined = text.lower()
    pos = sum(1 for kw in POSITIVE_KEYWORDS if kw in words or kw in joined)
    neg = sum(1 for kw in NEGATIVE_KEYWORDS if kw in words or kw in joined)
    total = pos + neg
    if total == 0:
        return 0.0
    return (pos - neg) / total


_cache: dict[str, Any] = {"ts": 0.0, "items": []}


async def fetch_news(client: httpx.AsyncClient, ttl_seconds: float = 1800) -> list[dict]:
    """All feed items (cached 30 min): {title, url, source, published_at, summary, sentiment}."""
    now = time.monotonic()
    if _cache["items"] and now - _cache["ts"] < ttl_seconds:
        return _cache["items"]

    items: list[dict] = []
    for source, url in FEEDS:
        try:
            res = await client.get(url, headers={"User-Agent": _UA}, timeout=20.0, follow_redirects=True)
            res.raise_for_status()
            root = ET.fromstring(res.text)
            for item in root.iter("item"):
                title_el = item.find("title")
                link_el = item.find("link")
                date_el = item.find("pubDate")
                desc_el = item.find("description")
                title = _clean(title_el.text or "") if title_el is not None else ""
                if not title:
                    continue
                published = datetime.now(timezone.utc)
                if date_el is not None and date_el.text:
                    try:
                        published = parsedate_to_datetime(date_el.text).astimezone(timezone.utc)
                    except Exception:
                        pass
                summary = _clean(desc_el.text or "")[:280] if desc_el is not None else ""
                text = f"{title} {summary}"
                items.append({
                    "title": title,
                    "url": (link_el.text or "").strip() if link_el is not None else "",
                    "source": source,
                    "published_at": published,
                    "summary": summary,
                    "sentiment": round(_sentiment_of(text), 2),
                })
        except Exception:
            continue  # a dead feed must never block the pipeline

    _cache["ts"] = now
    _cache["items"] = items
    return items


def _matches(item_text: str, coin: str, coin_unit: str) -> bool:
    text = item_text.lower()
    sym = coin.lower()
    if len(sym) >= 3 and re.search(rf"\b{re.escape(sym)}\b", text):
        return True
    unit = (coin_unit or "").lower().strip()
    if len(unit) >= 3 and re.search(rf"\b{re.escape(unit)}\b", text):
        return True
    return False


def fundamental_for_coins(
    items: list[dict],
    coins: list[dict],
    window_hours: int,
    source_credibility: dict[str, float] | None = None,
) -> dict[str, dict]:
    """Per-coin fundamental breakdown: score 0-100, polarity, matched headlines, summary.

    Coins with no specific coverage inherit a dampened market-wide sentiment when any
    macro/major-coin news exists.
    """
    now = datetime.now(timezone.utc)
    horizon = timedelta(hours=window_hours)
    cred = source_credibility or {"CoinDesk": 1.1, "Cointelegraph": 1.0, "Decrypt": 1.0}

    fresh = [it for it in items if now - it["published_at"] <= horizon]
    for it in fresh:
        it["age_h"] = max(0.0, (now - it["published_at"]).total_seconds() / 3600.0)

    # market-wide pool: major-coin or macro items that carry a sentiment signal
    market_pool = [
        it for it in fresh
        if it["sentiment"] != 0.0 and (
            _matches(f"{it['title']} {it['summary']}", "btc", "bitcoin")
            or _matches(f"{it['title']} {it['summary']}", "eth", "ethereum")
            or any(kw in f"{it['title']} {it['summary']}".lower() for kw in MACRO_KEYWORDS)
        )
    ]

    out: dict[str, dict] = {}
    for c in coins:
        coin, unit = c["traded_currency"], c.get("traded_currency_unit") or ""
        matched: list[dict] = []
        for it in fresh:
            if it["sentiment"] == 0.0 and not _matches(f"{it['title']} {it['summary']}", coin, unit):
                continue
            if _matches(f"{it['title']} {it['summary']}", coin, unit):
                matched.append(it)

        matched.sort(key=lambda it: it["published_at"], reverse=True)

        polarity: float | None = None
        if matched:
            wsum = 0.0
            acc = 0.0
            for it in matched[:12]:
                w = cred.get(it["source"], 1.0) * (0.5 ** (it["age_h"] / 24.0))
                acc += it["sentiment"] * w
                wsum += w
            polarity = acc / wsum if wsum else 0.0
            score = 50.0 + 50.0 * polarity
        elif market_pool:
            wsum = 0.0
            acc = 0.0
            for it in market_pool[:12]:
                w = cred.get(it["source"], 1.0) * (0.5 ** (it["age_h"] / 24.0))
                acc += it["sentiment"] * w
                wsum += w
            market_polarity = acc / wsum if wsum else 0.0
            polarity = market_polarity * 0.6
            score = 50.0 + 30.0 * market_polarity
            matched = market_pool[:2]
        else:
            score = 50.0

        positives = sum(1 for it in matched if it["sentiment"] > 0)
        negatives = sum(1 for it in matched if it["sentiment"] < 0)
        coin_specific = matched
        out[coin] = {
            "score": round(max(0.0, min(100.0, score)), 1),
            "polarity": round(polarity, 3) if polarity is not None else None,
            "positives": positives,
            "negatives": negatives,
            "headlines": [
                {
                    "title": it["title"],
                    "source": it["source"],
                    "url": it["url"],
                    "published_at": it["published_at"].isoformat(),
                    "sentiment": it["sentiment"],
                    "matched": it in coin_specific,
                }
                for idx, it in enumerate(matched[:8])
            ],
        }
    return out


def build_summary(fund: dict, window_hours: int) -> str:
    """Short Indonesian narrative for the breakdown panel."""
    n = len(fund.get("headlines") or [])
    pos, neg = fund.get("positives", 0), fund.get("negatives", 0)
    polarity = fund.get("polarity")
    scope = "24 jam" if window_hours <= 24 else f"{window_hours // 24} hari"
    if n == 0:
        return f"Tidak ada berita spesifik {scope} terakhir; skor fundamental memakai basis netral 50."
    direction = "bullish" if (polarity or 0) > 0.1 else ("bearish" if (polarity or 0) < -0.1 else "netral")
    mix = f"{pos} berita bernada positif dan {neg} negatif" if neg else f"{pos} berita bernada positif"
    top = fund["headlines"][0]["title"]
    return f"Sentimen {direction} dari {n} headline {scope} terakhir ({mix}). Sorotan: \u201c{top}\u201d."
