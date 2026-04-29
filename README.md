# Pulse Terminal

> Crypto Macro Intelligence Terminal — multi-source flow analysis, derivatives intel, AI via MCP.

Monorepo consolidating seven prior projects — all ported, originals removed from disk.

**Architecture:** MCP-first. The web app is a visualization layer; AI analysis happens in Claude Desktop via the bundled MCP server, using your Claude Pro/Max subscription (no Anthropic API key needed).

---

## Quick start (development)

```bash
pnpm install
cp .env.example .env.local           # only needed if using portfolio/Coinglass
pnpm dev                             # turbo: web + realtime concurrently
```

- Web → http://localhost:3000
- Realtime WS → ws://localhost:8080
- Hub HTTP cache → http://127.0.0.1:8081 (after Phase B v0)

## Production (24/7 on your machine, pm2)

```bash
npm install -g pm2
pnpm pulse:build                     # builds realtime + alerts + web
pnpm pulse:start                     # boots all 3 under pm2
pm2 save                             # persist process list
pm2 startup                          # generate auto-start command (run as printed)

# Day-to-day
pnpm pulse:status                    # color-coded health + per-process stats
pnpm pulse:logs                      # tail all logs
pnpm pulse:restart
pnpm pulse:stop
```

The MCP server is **not** in pm2 — it's spawned by Claude Desktop on demand via stdio.

## Tabs

| URL                  | Purpose |
|----------------------|---------|
| `/`                  | Overview — hero, MetricStrip, MacroOverlay (DXY/SPX/Gold), PortfolioPanel, AlertsFeed |
| `/markets`           | Top 20 coins + click-to-load candlestick (15m/1h/4h/1d) |
| `/fundflow`          | Stablecoins · ETF · Derivatives · TVL · DEX panels |
| `/derivatives`       | Live funding-rate stream (WS, real-time) |
| `/backtest`          | Hit-rate per anomaly pattern (4h/24h/72h/7d lookahead) |
| `/design`            | Visual catalog of `@pulse/ui` + `@pulse/charts` |

## Structure

```
apps/
├── web/        Next.js 16 dashboard (App Router, 6 tabs, 11+ API routes)
├── realtime/   WS server (Binance/Bybit/OKX native streams) + HTTP cache (Phase B v0)
├── alerts/     Cron worker — runs scanAnomalies every 15min, JSONL log + webhook
└── mcp/        MCP server for Claude Desktop (17 tools, stdio transport, .dxt bundle)

packages/
├── ui/         Design tokens + 9 React components (purple/cyan glassmorphism)
├── sources/    Data adapters — every external API + format helpers + anomaly scanner
│               · "@pulse/sources" — browser-safe (types, format, helpers, anomaly types)
│               · "@pulse/sources/server" — Node-only (farside, portfolio, signed adapters)
├── charts/     6 chart components (LWC v4.2 · recharts · SVG)
└── i18n/       Bilingual ไทย/EN — dict, LocaleProvider, Bilingual, t/useT
```

## MCP setup (Claude Desktop)

```bash
pnpm --filter @pulse/mcp build
pnpm --filter @pulse/mcp pack-dxt
# Drop apps/mcp/dist/*.dxt into Claude Desktop → Settings → MCP servers
```

Available tools (17):

- **Data** — `get_market_overview`, `get_stablecoin_flows`, `get_etf_flows`, `get_futures`, `get_dex_leaderboard`, `get_tvl_breakdown`, `get_fundflow_snapshot`
- **Derivatives** — `get_funding_summary`, `get_oi_snapshot` (cross-venue: Binance / Bybit / OKX / Deribit)
- **Options (Phase 5A)** — `get_options_chain`, `get_iv_smile`, `get_options_arbitrage`
- **Bybit Dual Assets (Phase 5A)** — `get_dual_assets_apr`, `get_best_dual_assets_hour`, `get_dual_assets_daily_summary`
- **Analysis** — `detect_anomalies`, `grade_signal` (Phase 4 — rubric-returner for grading findings)

Tools query the local hub at `:8081` for sub-50ms latency, with graceful fallback to direct upstream fetch when the hub is unreachable.

## How to contribute

Work is split into 8 roles + Phase 3 sub-phases so multiple Claude Code sessions can run in parallel without colliding. See [AGENTS.md](./AGENTS.md) for current status board, contracts, and what's safe to touch. Cross-session sync uses the template in [SYNC.md](./SYNC.md).

## Reference projects

All seven prior projects have been ported and the source folders removed:

| Original | Now lives at |
|---|---|
| `Crypto-Fundflow-Analyzer` | `apps/web` + `apps/mcp` + `packages/sources` |
| `Funding_Oi` | `apps/realtime` + `packages/sources/funding` |
| `CryptoTerminal` | `apps/web/markets` + `packages/charts` |
| `Pulse Command` | `packages/ui` |
| `Bybit Api` (Python) | `packages/sources/src/dual-assets/` (TS + better-sqlite3) |
| `option-dashboard` (Vite) | `packages/sources/src/options/` + `apps/web/app/options/` |
| `Option Scan` (Streamlit) | not ported — low priority, removed |
