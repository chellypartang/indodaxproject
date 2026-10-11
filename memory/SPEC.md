# SPEC — Indo Crypto Lens

## What the app is
Full-stack crypto analysis terminal for Indodax IDR pairs using **Hybrid Analysis**:
Technical (RSI-14, MACD 12/26/9, SMA20/50, Support/Resistance, volume trend) + Fundamental
(RSS headlines from CoinDesk / Cointelegraph / Decrypt with keyword sentiment scoring).
Locked Top 10 Bullish snapshots (daily 06:00 WITA, weekly Monday 06:00 WITA), evaluation
of projections vs Actual High, admin-only auth + user management, CSV export,
dark/light mode. UI copy is Indonesian-first; WITA = Asia/Makassar (UTC+8).

## Data model (Mongo `app` db)
- `users` — {id(uuid), email(unique), name, role: admin|user, password_hash (pbkdf2_sha256), created_at, last_login_at}
- `snapshots` — {id(uuid), kind: daily|weekly, period_start, period_end (aware UTC; unique per kind+period_start),
  generated_at, weights {technical, fundamental}, items[10] {rank, pair (ticker_id, e.g. btc_idr), coin, name, logo,
  score, technical_score, fundamental_score, est_gain_pct, entry_price, target_price, technical{rsi, macd*, sma20, sma50,
  support, resistance, range_position, volume_trend, trend, change_pct, score, source, timeframe_note},
  fundamental{score, polarity, positives, negatives, headlines[], summary}},
  actuals{}, actuals_running{}, actuals_recorded, approximated, evaluated_at} — **the snapshot lock**: reads serve stored docs
- `settings` — {key: weights_daily|weights_weekly, technical, fundamental, updated_at}
- `watchlist` — {user_id, pair, coin, name, logo, created_at} — unique per (user_id, pair), max 25 per user; enriched on read with live ticker + current daily snapshot rank/score
- `price_history` — {ts, prices{ticker_id: last}} sampled every 15 min, TTL 45 days
- `sync_status` — singleton (_id: "sync") {last_ticker_sync_at, last_ticker_ok, last_ticker_error, last_generation_at, last_generation_error, universe_count, candidates_last_run}
- `status_checks` — template demo routes, unused by the app

## Data pipeline
- Indodax public API: `/api/pairs` (universe, 6h cache), `/api/ticker_all` (45s cache), `/api/trades/{pair}` fallback candles
- Candles: OKX `1H/1D` (primary) → Coinbase `1H/1D` fallback → Indodax trades→15m candles last resort; USD levels scaled to IDR via last-price ratio
- News: RSS fetch cached 30 min; per-coin matching by symbol/name; market-wide dampened fallback
- Scheduler (`lib/scheduler.py`, 30s tick in FastAPI lifespan): samples tickers every 15 min (running Actual High tracking + price history), finalizes snapshots past period_end (records actuals from running max high), ensures current daily+weekly snapshot exist (generation at 06:00 WITA rollover or lazily on cold start, guarded by asyncio lock + unique index)

## API (all under /api, routers mounted in server.py)
- `/auth/login|logout|me` — httpOnly JWT cookie session (SESSION_SECRET in .env)
- `/users` GET, POST (invite → returns initial_password once), `/{id}/password` PATCH (reset), `/{id}` DELETE — admin only
- `/analysis/current?kind=` , `/analysis/history?kind=&limit=`, `/analysis/snapshot/{id}`, `/analysis/coin/{pair}?kind=` (live, 2-min cache), `/analysis/coin/{pair}/history?hours=` (price samples for the IDR line chart, max 168h), `/analysis/coin/{pair}/candles?bucket=15..240&hours=1..168` (Indodax-native OHLC candles), `/analysis/refresh` POST (admin, force regenerate)
- `/evaluation/daily|weekly|monthly`, `/evaluation/by-coin?kind=&min_appearances=` (per-coin model reliability, sorted by hit rate → sample size → |deviation|), `/evaluation/export/analysis/{kind}`, `/evaluation/export/evaluation/{kind}?days=30` (CSV)
- `/watchlist` GET (enriched list), POST {pair} (idempotent upsert, 404 on unknown pair, 400 past 25), `/watchlist/{pair}` DELETE — per-user, any role
- `/settings/weights` GET, `/settings/weights/{kind}` PUT (admin, must sum 100)
- `/meta/status` — server-anchored next runs + sync health

## Frontend
React 19 + TanStack Query + react-router. Pages: `/login`, `/` (dashboard, tabs Harian/Mingguan, watchlist panel pinned above the Top 10), `/coin/:pair`
(TradingView Advanced Chart widget + breakdowns + star toggle), `/evaluasi` (tabs Harian/Mingguan/Bulanan/**Per Koin** + recharts trends),
`/admin/pengguna`, `/admin/pengaturan` (weight sliders + regenerate). Guards: RequireAuth/RequireAdmin via `useMe()`.
Watchlist state lives in `hooks/useWatchlist.tsx` (`useWatchlist`, `useToggleWatchlist`, `StarToggle`); the panel is `components/watchlist-panel.tsx` — its cards are `div role="button"`, never `<button>`, because the star toggle nests inside them.

### base-ui gotchas hit in this app (keep these)
- `DropdownMenuLabel` is base-ui `Menu.GroupLabel` and **throws at runtime** ("MenuGroupContext is missing") unless wrapped in `DropdownMenuGroup`. The header account menu in `components/app-shell.tsx` wraps it — do not unwrap.
- Nested interactive controls: a clickable card containing its own button must be `div role="button"` + `onKeyDown`, not `<button>`.
Theme: next-themes, default dark; fonts Outfit/Plus Jakarta Sans/JetBrains Mono; palette in `src/index.css`.

## Export & reporting
- CSV: `/api/evaluation/export/analysis/{kind}` (dashboard snapshot) and `/api/evaluation/export/evaluation/{kind}?days=` (evaluation ledger)
- PDF: browser print (`window.print()`) with `PrintButton` on Dashboard / Evaluasi / Coin detail. `components/print-report.tsx` renders a paper-only report header; `@media print` in index.css forces the light report palette even in dark mode, hides nav/side rails/TradingView, and sets A4 margins + repeating table headers

## Projection formula (est_gain_pct) — volume & trend are explicit factors
`lib/indicators.py :: estimate_gain_pct()` returns `(est, breakdown)`:

```
est = ( headroom x trend_factor x volume_factor x liquidity_factor + momentum ) x horizon
```
- **headroom** — % distance from price to resistance (capped 12%), scaled by the technical score
- **trend_factor** — 1.18 bullish / 1.00 netral / 0.78 bearish, then ×1.08 for a full bullish MA stack
  (price > SMA20 > SMA50) or ×0.90 for a full bearish stack; clamped to 0.70–1.30
- **volume_factor** — from `volume_ratio` (recent vs prior average volume): ≥2.0→1.30, ≥1.5→1.20,
  ≥1.2→1.10, ≥0.8→1.00, ≥0.5→0.88, else 0.75. A breakout on rising volume is worth more than one on fading volume
- **liquidity_factor** — damps thin markets using 24h IDR turnover: ≥5 M rupiah→1.00 … <10 jt→0.75
- **momentum** — RSI above 50 (×0.03) + 0.2 when the MACD histogram is positive
- **horizon** — ×1.6 weekly, ×1.0 daily. Cap is horizon-aware: **30% daily / 60% weekly** — a flat 30%
  ceiling pinned nearly every weekly candidate at the cap and destroyed the descending ranking
- The breakdown is persisted on each snapshot item as `projection` (nullable: snapshots locked before
  this shipped have no breakdown) and surfaced in the UI as "Komposisi Proyeksi" plus the Volume/Tren
  dashboard columns and the `proj_*` CSV columns
- `technical.volume_ratio` carries the raw numeric ratio alongside the `volume_trend` label

## Trade levels (entry / TP1-2-3 / stop loss)
`lib/indicators.py :: trade_levels()` → persisted per snapshot item as `levels` (nullable for
snapshots locked before this shipped), shown as the "Rencana Trading" card on the coin page, as the
`Entry / TP 1·2·3` + `Stop Loss` dashboard columns, and as CSV columns (`tp1_idr`…`risk_reward`):
- **TP ladder** proportional to the projection so it is always monotonic: TP1 = 0.5×est, **TP2 = est
  (identical to `target_price`)**, TP3 = 1.75×est. A real resistance falling inside the ladder is
  reported as `key_resistance`
- **Entry zone**: `entry × 0.985 … × 1.005`, floored at support when support sits below price
- **Stop loss**: anchored at `support × 0.985` when support is below price, clamped to the period risk
  cap (8% daily / 14% weekly) and to a 1.5% minimum. When **no valid support exists below price** the
  stop falls back to *half* the cap (4% / 7%), not the full cap — least information must not buy the
  most risk
- **risk_reward** = (TP2 − entry) / (entry − SL). A thin projection honestly yields a poor R/R

## Charts
- **Globally-listed coins** (candles sourced from OKX/Coinbase): TradingView Advanced Chart — symbol derived from that same venue (`okx` → `OKX:{COIN}USDT`, `coinbase` → `COINBASE:{COIN}USD`), plus the `PriceHistoryChart` IDR line below it for the Indodax-quoted view
- **Indodax-only coins** (`indodax_trades`/`indodax_ticker` source): no TradingView at all — `IndodaxCandleChart` is the primary chart, a real candlestick series built server-side by `engine.indodax_candles()` from `/api/trades/{pair}` (last 500 trades → true OHLCV buckets, typically 17-20h of history for thin coins) and backfilled for older buckets from our `price_history` samples. A short note card above explains why TradingView is absent and links to a manual TradingView search. Bucket selector: 15m / 1h; window fixed at 24h (the Indodax trade feed does not reach further)
- Recharts has no candlestick series, so `IndodaxCandleChart` draws a range `Bar` (`[low, high]`) with a custom shape: wick line plus an open/close body, mapping prices into the bar's pixel box. Hollow body = bearish, filled = bullish
- **Evaluation trends**: recharts line/bar over snapshot history, 30-day monthly recap, and per-coin reliability bars

## Roles & credentials
- **Admin**: chellypartang@gmail.com / Chelpar031 (also in backend/.env as ADMIN_EMAIL/ADMIN_PASSWORD; seeded idempotently on startup + by seed.py)
- Invited users get an admin-generated initial password (shown once in the invite dialog; no SMTP)

## Known limits
- Evaluation populates after the first 06:00 WITA rollover finalizes a snapshot (verified working: 11 Oct rollover produced 90% hit rate / +20.63% avg deviation)
- Actual High = union of 15-min ticker samples + rollover snapshot; if the server was down past a rollover, `approximated: true`
- TradingView widget needs internet in the browser; Indodax-only coins fall back to the native price chart by design
- Micro-cap coins (price under ~Rp 100) can rank high because `est_gain_pct` rewards volatility — rounding makes their % moves look extreme
