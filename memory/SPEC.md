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
- `/analysis/current?kind=` , `/analysis/history?kind=&limit=`, `/analysis/snapshot/{id}`, `/analysis/coin/{pair}?kind=` (live, 2-min cache), `/analysis/coin/{pair}/history?hours=` (Indodax price samples for the coin trend chart, max 168h), `/analysis/refresh` POST (admin, force regenerate)
- `/evaluation/daily|weekly|monthly`, `/evaluation/export/analysis/{kind}`, `/evaluation/export/evaluation/{kind}?days=30` (CSV)
- `/settings/weights` GET, `/settings/weights/{kind}` PUT (admin, must sum 100)
- `/meta/status` — server-anchored next runs + sync health

## Frontend
React 19 + TanStack Query + react-router. Pages: `/login`, `/` (dashboard, tabs Harian/Mingguan), `/coin/:pair`
(TradingView Advanced Chart widget + breakdowns), `/evaluasi` (Harian/Mingguan/Bulanan + recharts trends),
`/admin/pengguna`, `/admin/pengaturan` (weight sliders + regenerate). Guards: RequireAuth/RequireAdmin via `useMe()`.
Theme: next-themes, default dark; fonts Outfit/Plus Jakarta Sans/JetBrains Mono; palette in `src/index.css`.

## Export & reporting
- CSV: `/api/evaluation/export/analysis/{kind}` (dashboard snapshot) and `/api/evaluation/export/evaluation/{kind}?days=` (evaluation ledger)
- PDF: browser print (`window.print()`) with `PrintButton` on Dashboard / Evaluasi / Coin detail. `components/print-report.tsx` renders a paper-only report header; `@media print` in index.css forces the light report palette even in dark mode, hides nav/side rails/TradingView, and sets A4 margins + repeating table headers

## Charts
- **TradingView Advanced Chart** (coin page): symbol derived from the exchange our candles came from — `okx` → `OKX:{COIN}USDT`, `coinbase` → `COINBASE:{COIN}USD`. Indodax-only coins (`indodax_trades`/`indodax_ticker` source) render `NoGlobalChart` explanatory fallback instead, so the widget never shows its "symbol not available" error
- **Price history** (coin page): `PriceHistoryChart` recharts area chart over our own 15-min Indodax samples (24h daily / 168h weekly); shows a "collecting samples" state under 2 points
- **Evaluation trends**: recharts line/bar over snapshot history + 30-day monthly recap

## Roles & credentials
- **Admin**: chellypartang@gmail.com / Chelpar031 (also in backend/.env as ADMIN_EMAIL/ADMIN_PASSWORD; seeded idempotently on startup + by seed.py)
- Invited users get an admin-generated initial password (shown once in the invite dialog; no SMTP)

## Known limits
- Evaluation populates after the first 06:00 WITA rollover finalizes a snapshot (verified working: 11 Oct rollover produced 90% hit rate / +20.63% avg deviation)
- Actual High = union of 15-min ticker samples + rollover snapshot; if the server was down past a rollover, `approximated: true`
- TradingView widget needs internet in the browser; Indodax-only coins fall back to the native price chart by design
- Micro-cap coins (price under ~Rp 100) can rank high because `est_gain_pct` rewards volatility — rounding makes their % moves look extreme
