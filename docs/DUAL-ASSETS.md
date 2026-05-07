# Pulse Dual Assets

Pulse Terminal owns the Bybit Dual Assets runtime. The standalone `Dual-assets_MD`
project was ported into the existing Pulse stack; Pulse does not iframe, link out
to, or require a second app for `/dual-assets`.

## Scope

- Data source: real Bybit public Advanced Earn DualAssets endpoints
- Default pair: `SOL-USDT`
- Default directions: `BuyLow,SellHigh`
- Default durations: `8h,1d`
- UI labels: `8 Hours`, `1 Day`, `Buy Low`, `Sell High`
- Track APY visibility threshold: `55%`
- Hot APR alert threshold: `100%`
- SQLite DB: `apps/alerts/data/dual-assets.sqlite`

`DUAL_ASSETS_MIN_TRACK_APR` is the ingest/API/UI/MCP visibility filter. It is not
the alert threshold. Existing historical rows below the threshold remain in
SQLite, but default read paths hide them.

`DUAL_ASSETS_APR_ALERT` only controls hot APR webhook alerts.

## Runtime Path

```text
Bybit public endpoints
  -> packages/sources/src/dual-assets/tracker.ts
  -> apps/alerts/data/dual-assets.sqlite
  -> apps/web/app/api/dual-assets/*
  -> /dual-assets UI + apps/mcp/src/tools/dual-assets.ts
```

The alerts worker is the writer. Web API routes and MCP tools read the same
SQLite contract from `@pulse/sources/server`.

No `BYBIT_API_KEY` or `BYBIT_API_SECRET` is required for read-only tracking.
Those keys are only reserved for a future write/place-order path.

## API

- `GET /api/dual-assets/settings`
- `GET /api/dual-assets/snapshots?coin_pair=SOL-USDT&duration=8h&limit=100`
- `GET /api/dual-assets/snapshots?coin_pair=SOL-USDT&duration=1d&limit=100`
- `GET /api/dual-assets/best-hour?coin_pair=SOL-USDT&duration=8h,1d&direction=BuyLow,SellHigh&days=7`
- `GET /api/dual-assets/summary?coin_pair=SOL-USDT&duration=8h,1d&direction=BuyLow,SellHigh&days=30`

Expected settings defaults:

```json
{
  "minTrackAprPct": 55,
  "aprAlertPct": 100,
  "authRequiredForTracking": false
}
```

Default snapshot reads apply `apr_pct >= 55` and dedupe visible rows to the best
APR row per time, pair, direction, target, and duration. Use `duration=none` or
`direction=none` to intentionally return an empty result, matching the UI
multi-toggle behavior.

## MCP Tools

- `get_dual_assets_settings`
- `get_dual_assets_apr`
- `get_best_dual_assets_hour`
- `get_dual_assets_daily_summary`

MCP defaults match the API: `SOL-USDT`, `8h,1d`, `BuyLow,SellHigh`, and Track
APY `>=55`.

## Local Verification

```bash
pnpm typecheck
pnpm test
pnpm build
curl "http://localhost:3000/api/dual-assets/settings"
curl "http://localhost:3000/api/dual-assets/snapshots?coin_pair=SOL-USDT&duration=8h&limit=100"
curl "http://localhost:3000/api/dual-assets/snapshots?coin_pair=SOL-USDT&duration=1d&limit=100"
```

Expected:

- settings include `minTrackAprPct:55` and `aprAlertPct:100`
- snapshot rows do not include `apr_pct < 55`
- both `BuyLow` and `SellHigh` can appear
- `8h` and `1d` filters return independent rows

## Production Verification

```bash
curl https://cryptopulse.buzz/api/health
curl https://cryptopulse.buzz/api/dual-assets/settings
curl "https://cryptopulse.buzz/api/dual-assets/snapshots?coin_pair=SOL-USDT&duration=8h&limit=100"
curl "https://cryptopulse.buzz/api/dual-assets/snapshots?coin_pair=SOL-USDT&duration=1d&limit=100"
```
