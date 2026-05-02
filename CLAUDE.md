# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Pulse Terminal — Crypto Macro Intelligence Terminal. Monorepo (pnpm + turbo) consolidating seven prior projects into one product. **MCP-first**: the web app is a visualization layer; AI analysis happens in Claude Desktop via the bundled MCP server.

## Read first
- [STATUS.md](./STATUS.md) — live coordination board for the 3 parallel Claude sessions; check before starting work and update on completion / change of direction
- [SESSIONS.md](./SESSIONS.md) — 3-session protocol (who's who, behavior rules)
- [AGENTS.md](./AGENTS.md) — work split into 8 roles, owned files, public contracts
- [README.md](./README.md) — public overview, tabs, MCP setup
- When a session starts, **announce your role** (e.g. "Taking Role 2 — UI Agent") and only modify files inside that role's owned directories. If you need a contract from another role that doesn't exist, **stub it on the consumer side** and add a `// TODO(role-X): ...` comment.

## Stack
- pnpm@9 workspace + turbo
- Next.js 16 + React 19 + TypeScript ([apps/web/](apps/web/)) — dev/build run on **webpack**, not Turbopack (Turbopack panics on this project's path; flags wired in [apps/web/package.json](apps/web/package.json))
- Node + ws + tsx ([apps/realtime/](apps/realtime/)) — also serves the localhost hub HTTP cache
- MCP SDK ([apps/mcp/](apps/mcp/)) — stdio transport, packed as `.dxt` for Claude Desktop
- Cron worker for AI alerts ([apps/alerts/](apps/alerts/))
- Tailwind + design tokens ([packages/ui/](packages/ui/))
- Lightweight Charts **v4.2** ([packages/charts/](packages/charts/)) — DO NOT upgrade to v5 (v5 removed `addCandlestickSeries` / `addHistogramSeries`)
- Tauri 2.x desktop wrapper ([src-tauri/](src-tauri/)) — optional; web app runs standalone

## Commands

```bash
pnpm install
pnpm dev                     # turbo: boots apps/web (webpack) + apps/realtime concurrently
pnpm build                   # turbo: build all workspaces
pnpm typecheck               # turbo: tsc --noEmit across all workspaces
pnpm lint                    # turbo: lint where configured
pnpm test                    # turbo: vitest run across workspaces that have tests
```

Per-workspace (preferred when iterating on one slice):

```bash
pnpm --filter @pulse/web dev          # next dev --webpack -p 3000
pnpm --filter @pulse/web typecheck
pnpm --filter @pulse/realtime dev     # tsx watch
pnpm --filter @pulse/sources test     # vitest run
pnpm --filter @pulse/sources test src/anomalies.test.ts   # single file
pnpm --filter @pulse/sources test -t "scanAnomalies"      # by name
pnpm --filter @pulse/mcp build && pnpm --filter @pulse/mcp pack-dxt
```

Production (pm2 — runs hub + alerts + web 24/7):

```bash
pnpm pulse:build             # next build for web (only thing that compiles)
pnpm pulse:start             # pm2 starts pulse-web, pulse-realtime, pulse-alerts
pnpm pulse:status            # color-coded health from /api/health + /health + alerts tail
pnpm pulse:logs              # pm2 logs --lines 50
pnpm pulse:restart / :stop
```

The MCP server is **not** in pm2 — Claude Desktop spawns it via stdio. Realtime is run under `node --import tsx` (see [ecosystem.config.cjs](ecosystem.config.cjs)) because `@pulse/sources` ships TypeScript source-only with no emit.

## Architecture

**Data flow (MCP-first):**

```
upstream APIs (CoinGecko, DefiLlama, Binance, Bybit, OKX, Yahoo, …)
        │
        ▼
packages/sources         ← single source of truth for every external call
        │
        ├─► apps/realtime ──► WS :8080 (live funding/OI to web)
        │                 └─► HTTP cache :8081 (snapshot + funding/oi/health)
        │
        ├─► apps/alerts (cron) ──► JSONL log + optional Discord/Slack webhook
        │
        ├─► apps/web (Next API routes) ──► browser
        │       └─► reads PULSE_HUB_URL (default http://127.0.0.1:8081) when available
        │
        └─► apps/mcp (stdio) ──► Claude Desktop
                └─► queries hub :8081 first, falls back to direct fetch on ECONNREFUSED
```

Why the hub cache exists: each MCP tool call would otherwise hit external APIs cold. The realtime app keeps a hot in-memory snapshot (refreshed ~90s) plus live WS funding/OI maps and serves them over `127.0.0.1:8081`. Target MCP latency is < 50ms per call.

**`@pulse/sources` is split** ([packages/sources/package.json](packages/sources/package.json) `exports`):
- `import … from "@pulse/sources"` — **browser-safe**: types, `format`, `_helpers`, anomaly types
- `import … from "@pulse/sources/server"` — **server-only**: every fetch adapter (overview, stablecoins, etf+farside, futures, dex, tvl, funding, macro, portfolio, snapshot, options, dual-assets)

Rule of thumb: anything that runs in a Next API route, `apps/realtime`, `apps/alerts`, or `apps/mcp` imports from `/server`. React components import from the bare path.

**Native modules:** `better-sqlite3` (used by dual-assets storage) is excluded from webpack via [apps/web/next.config.js](apps/web/next.config.js) `serverExternalPackages` + a forced `commonjs better-sqlite3` external. Don't bundle it.

**Web app tabs** (see [apps/web/app/](apps/web/app/)): `/`, `/markets`, `/fundflow`, `/derivatives`, `/backtest`, `/options`, `/design` (component showcase).

**MCP tools** (17 — full list in [README.md](./README.md)): data, derivatives, options, dual-assets, analysis (`detect_anomalies`, `grade_signal`).

## Conventions
- Internal packages namespaced `@pulse/*`. Path aliases live in [tsconfig.base.json](tsconfig.base.json).
- All API calls go through `@pulse/sources` (server entry for adapters) — never `fetch()` upstream APIs from a component or app directly.
- All user-facing labels are **English only**. The `@pulse/i18n` package was removed 2026-04-30 — do not reintroduce bilingual / Thai strings or `<Bilingual>` / `useT`.
- Design tokens come from `@pulse/ui/tokens` — never hard-code colors, fonts, or shadows.
- Use `clsx` for conditional classes.
- Workspace TS source uses NodeNext-style `.js` import suffixes; webpack maps them back via `resolve.extensionAlias`.
- Strict TypeScript everywhere.

## Visual identity
Purple/cyan glassmorphism (Pulse Command aesthetic).
- Background: `#04050a`
- Accents: `#7c5cff` (purple) + `#22d3ee` (cyan)
- Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (numbers)

## Do NOT
- Touch files outside your assigned role's directory (see [AGENTS.md](./AGENTS.md))
- Hard-code colors, fonts, or labels
- Reintroduce bilingual / Thai strings — product is English-only as of 2026-04-30
- Upgrade Lightweight Charts past v4.2
- Add new top-level dependencies without coordinating — prefer workspace packages
- Fetch data outside `packages/sources`
- Switch `apps/web` to Turbopack — it panics on this project's path; the `--webpack` flag is intentional
- Bundle `better-sqlite3` into webpack output
- Import server-only adapters from `@pulse/sources` bare path in browser code — use `@pulse/sources/server` in Node contexts only

## Reference projects
All seven originals (`Crypto-Fundflow-Analyzer`, `CryptoTerminal`, `Funding_Oi`, `Pulse Command`, `Bybit Api`, `Option Scan`, `option-dashboard`) have been ported and **removed from disk**. Migration map is in [AGENTS.md](./AGENTS.md#migration-source-map-all-complete--originals-removed-from-disk).
