# Pulse Terminal

> Crypto Macro Intelligence Terminal — multi-source flow analysis, derivatives intel, AI via MCP.

Monorepo consolidating four prior projects (Pulse Command, Crypto-Fundflow-Analyzer, CryptoTerminal, Funding_Oi → all ported, originals archived under `_legacy/`).

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
└── mcp/        MCP server for Claude Desktop (10 tools, stdio transport, .dxt bundle)

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

Available tools: `get_market_overview`, `get_stablecoin_flows`, `get_etf_flows`, `get_futures`, `get_dex_leaderboard`, `get_tvl_breakdown`, `get_funding_summary`, `get_oi_snapshot`, `detect_anomalies`, `get_fundflow_snapshot`. Once Phase B v0 ships, tools query the local hub at `:8081` for sub-50ms latency.

## How to contribute

Work is split into 8 roles + Phase 3 sub-phases so multiple Claude Code sessions can run in parallel without colliding. See [AGENTS.md](./AGENTS.md) for current status board, contracts, and what's safe to touch. Cross-session sync uses the template in [SYNC.md](./SYNC.md).

## Reference projects

Four originals archived under [`_legacy/`](_legacy/) (gitignored):
- `_legacy/Crypto-Fundflow-Analyzer/` (777M) — superseded by `apps/web` + `apps/mcp` + `packages/sources`
- `_legacy/Funding_Oi/` (89M) — superseded by `apps/realtime` + `packages/sources/funding`
- `_legacy/CryptoTerminal/` (1.5M) — superseded by `apps/web/markets` + `packages/charts`
- `_legacy/Pulse Command/` (76K) — superseded by `packages/ui`

Delete `_legacy/` when confident nothing else needs salvaging.
