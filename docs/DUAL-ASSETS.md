# Bybit Dual Assets — Operator Guide

> Time-series tracker for Bybit's Dual Assets product. Captures APR snapshots every 5 min,
> rolls up daily summaries, exposes them via API + MCP, fires Discord alerts on hot APR.

## What it is

Bybit Dual Assets = a structured product where you commit USDT/SOL at a target strike for a duration,
and earn yield (APR) that varies by strike, duration, and time of day.

The tracker answers:

- **"When in the day is APR best?"** → 24-bucket hour-of-day analysis with Thai recommendation
- **"What was the average APR last week?"** → daily summaries
- **"Did APR move with implied volatility?"** → APR ↔ SOL IV correlation
- **"Notify me when APR > X%"** → Discord webhook on hot entries

## Required env vars

| Var | Required | Default | Notes |
|---|---|---|---|
| `BYBIT_API_KEY` | ✅ yes | — | Read-only key, no trade/withdrawal scope |
| `BYBIT_API_SECRET` | ✅ yes | — | |
| `DUAL_ASSETS_PAIRS` | no | `SOL-USDT` | Comma-separated pairs to track |
| `DUAL_ASSETS_DIRECTIONS` | no | `BuyLow` | `BuyLow` / `SellHigh` (comma-separated) |
| `DUAL_ASSETS_TARGETS` | no | `78,80` | Target strikes (comma-separated) |
| `DUAL_ASSETS_INTERVAL_MS` | no | `300000` | Tick cadence (5 min) |
| `DUAL_ASSETS_APR_ALERT` | no | `100` | Hot threshold % for webhook |
| `DUAL_ASSETS_DB_PATH` | no | `<repo>/apps/alerts/data/dual-assets.sqlite` | Override (use absolute path) |
| `DUAL_ASSETS_ROLLUP_PAIRS` | no | `SOL-USDT` | Pairs to roll up daily |
| `ALERT_WEBHOOK_URL` | no | — | Discord/Slack webhook for hot alerts |

Without `BYBIT_API_KEY` / `BYBIT_API_SECRET`, the tracker logs a warning and stays disabled.
The store still serves graceful empty responses.

## How it runs

Three independent loops in `apps/alerts/src/index.ts`:

| Loop | Cadence | Purpose |
|---|---|---|
| Anomaly scan | every `ALERT_INTERVAL_MS` (default 15 min) | Cross-source ETF/funding/flow anomalies |
| **Dual Assets tick** | every `DUAL_ASSETS_INTERVAL_MS` (default 5 min) | Pull current strikes, write `apr_snapshots`, fire webhook on hot APR |
| **Daily rollup** | once at 00:05 ICT | Aggregate yesterday's rows into `daily_summary` |

## Schema

`apr_snapshots` — per-tick raw rows
```sql
id, timestamp_utc, timestamp_ict, hour_ict (0-23),
coin_pair, direction, target_price, apr_pct, duration,
settlement_utc, index_price, is_vip_only, sol_iv_pct,
created_at
UNIQUE (timestamp_ict, coin_pair, target_price, duration, direction)
```

`daily_summary` — aggregated per (date × coin_pair × target_price)
```sql
id, date, coin_pair, target_price,
avg_apr, max_apr, min_apr,
best_hour_ict, worst_hour_ict,
avg_index_price, sample_count, created_at
UNIQUE (date, coin_pair, target_price)
```

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/dual-assets/snapshots?limit=100` | Recent raw rows newest-first |
| GET | `/api/dual-assets/best-hour?coin_pair=SOL-USDT&target=78&days=7&correlation=1` | Hourly analysis + Thai recommendation |
| GET | `/api/dual-assets/summary?coin_pair=SOL-USDT&target=78&days=30` | Daily aggregated rollups |

All return graceful empty (`count: 0`) when DB is empty (no data yet) or unavailable.

## MCP tools (Claude Desktop)

- `get_dual_assets_apr` — recent snapshots
- `get_best_dual_assets_hour` — hourly analysis with Thai recommendation
- `get_dual_assets_daily_summary` — daily rollups

## Ops

### One-shot tick (manual run, useful for testing)
```bash
node --import tsx scripts/dual-assets-tick.mjs              # tick once
node --import tsx scripts/dual-assets-tick.mjs --rollup     # tick + rollup yesterday & today
node --import tsx scripts/dual-assets-tick.mjs --rollup-only 2026-04-27   # rollup specific date only
```

### Inspect the SQLite directly
```bash
sqlite3 apps/alerts/data/dual-assets.sqlite "SELECT date, target_price, avg_apr, best_hour_ict FROM daily_summary ORDER BY date DESC LIMIT 10"
```

### Verify the cron is alive
```bash
pm2 logs pulse-alerts --lines 20 --nostream | grep dual-assets
```

You should see ticks every 5 min:
```
[dual-assets] tick done in 412ms — saved=2 skipped=0 hot=1
```

## Tests

```bash
pnpm --filter @pulse/sources test -- dual-assets
```
- 11 store tests (saveSnapshot dedup, getRecentSnapshots ordering, getHourlyAvg grouping, getBestHours, getAprIvCorrelation strong-positive / not-enough-data, updateDailySummary)
- 4 analyzer tests (no-data error, Thai recommendation shape, hot/cold threshold, insufficient-data fallback)

Tests use a temp SQLite at `os.tmpdir()/dual-assets-test-*` — never touches the production DB.

## Architecture notes

- **Why SQLite, not JSONL?** Time-series queries (`GROUP BY hour_ict`) need real indexes. See `docs/ADR-004-sqlite-bybit-apr.md` for the migration trigger.
- **Why bake the path resolution?** When Next.js (web) imports the store from `apps/web`, CWD differs from `apps/alerts`. The store walks up to `pnpm-workspace.yaml` to anchor on the repo root.
- **Why `tryGetDb()` swallows open errors?** Web routes must return graceful empty arrays even when no BYBIT keys → no DB exists yet.
- **Webhook is fire-and-forget** — failures log a warn, never crash the cron.
