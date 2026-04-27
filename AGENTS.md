# AGENTS — Work Delegation for Pulse Terminal

> **Path note:** the four reference projects referenced in this doc (`Crypto-Fundflow-Analyzer/`, `CryptoTerminal/`, `Funding_Oi/`, `Pulse Command/`) have been archived under `_legacy/`. When you see them mentioned below, prefix with `_legacy/`.

The build is split into **8 roles**. Each role owns one slice of the monorepo and exposes a clear contract to the others. Multiple Claude Code sessions can work in parallel without colliding because boundaries are file-level.

> **Protocol when starting a session:** announce *"Taking Role N — <name>"*. Only modify files inside that role's owned directories. If you need a contract from another role that doesn't exist yet, **stub it** in the consumer side and add a `// TODO(role-X): need this` comment.

---

## Dependency graph

```
                    ┌─────────────────────┐
                    │  ROLE 1 — Foundation │
                    └──────────┬──────────┘
                               │
       ┌───────────────────────┼───────────────────────┐
       ▼                       ▼                       ▼
  Roles 2-5 (packages/*)  Roles 6-8 (apps/*)
       │                       │
       │   ┌───────────────────┘
       └──►┘
```

- **Role 1** must finish first (everyone depends on it)
- **Roles 2-5 (packages)** can run in parallel after Role 1
- **Roles 6-8 (apps)** depend on packages — start after the relevant package has a stable contract (a stub `index.ts` is enough)

---

## Role 1 — Foundation Agent
**Goal:** monorepo plumbing that everyone else relies on.
**Owns:** root files (`package.json`, `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`, `.gitignore`, `.env.example`, `.npmrc`)
**Phase 1 tasks:**
- [x] Create root configs (done)
- [ ] Run `pnpm install` from root and verify workspace wiring (`pnpm ls -r`)
- [ ] Verify `turbo run typecheck` reaches every workspace
- [ ] Wire turbo so `pnpm dev` boots `apps/web` + `apps/realtime` concurrently
**Hands off to:** everyone

---

## Role 2 — UI Agent  (`packages/ui/`)
**Goal:** the visual identity from Pulse Command, packaged as reusable React components.
**Owns:** `packages/ui/src/**`
**Public API:**
```ts
// packages/ui/src/index.ts
export { colors, gradients, glows, fonts } from "./tokens";
export { Card } from "./Card";
export { MetricCard } from "./MetricCard";
export { Pill } from "./Pill";
export { HeroTitle } from "./HeroTitle";
export { NavBar } from "./NavBar";
export { Loader } from "./Loader";
export { ThreeBackground } from "./ThreeBackground";
```
**Phase 1 tasks:**
- [x] Extract design tokens from `Pulse Command/pulsecommand.html` `:root` block → `tokens.ts` (already stubbed)
- [ ] Build `<Card>`, `<MetricCard>`, `<Pill>` (glassmorphism, gradient borders)
- [ ] Port `<ThreeBackground>` from Pulse Command lines ~64-72 + Three.js init
- [ ] Build `<NavBar>` with sticky blur + brand mark
- [ ] Document with a `apps/web/app/design/page.tsx` showcase route
**Source of truth:** `Pulse Command/pulsecommand.html`

---

## Role 3 — Sources Agent  (`packages/sources/`)
**Goal:** every external data adapter lives here. Other apps import functions — never call APIs directly.
**Owns:** `packages/sources/src/**`
**Public API:**
```ts
// market data
getOverview(): Promise<MarketOverview>
getStablecoins(): Promise<StablecoinFlow>
getETFFlows(opts?): Promise<ETFFlowResponse>
getTVL(): Promise<TvlResponse>
getDexVolume(): Promise<DexVolumeResponse>
getMarketSnapshot(n: number): Promise<CoinSnapshot[]>

// derivatives (NEW — port from Funding_Oi)
getFundingRates(opts: { exchange?, symbol? }): Promise<FundingRate[]>
getOpenInterest(opts: { exchange?, symbol? }): Promise<OpenInterest[]>
getFutures(): Promise<FuturesResponse>
```
All functions implement **fallback chains** (CoinGecko → CoinCap → cache pattern from `CryptoTerminal/CLAUDE.md`).
**Phase 1 tasks:**
- [ ] Port `Crypto-Fundflow-Analyzer/lib/sources/*.ts` into `packages/sources/src/`
- [ ] Port funding rate logic from `Funding_Oi/server/src/exchanges/`
- [ ] Implement `fetchWithRetry()` + `withFallback()` helper (single source of truth for retry logic)
- [ ] Add `types.ts` with shared interfaces
**Source of truth:** `Crypto-Fundflow-Analyzer/lib/sources/`, `Funding_Oi/server/`

---

## Role 4 — Charts Agent  (`packages/charts/`)
**Goal:** Lightweight Charts wrapper + reusable chart components.
**Owns:** `packages/charts/src/**`
**Public API:**
```tsx
<Candlestick data={...} symbol="BTCUSDT" height={400} />
<FlowChart data={...} type="stablecoin" />
<Sparkline data={...} positive={true} width={80} height={24} />
<DepthChart bids={...} asks={...} />
```
**Phase 1 tasks:**
- [ ] Wrap Lightweight Charts v4.2 in a React component (handle resize, cleanup)
- [ ] Port sparkline SVG generator from `CryptoTerminal/js/app.js` `buildSparkline()`
- [ ] Port flow chart logic from `Crypto-Fundflow-Analyzer/components/{StablecoinChart,ETFChart,TVLChart,DexChart}.tsx`
- [ ] Pin Lightweight Charts to v4.2 — DO NOT upgrade
**Source of truth:** `CryptoTerminal/js/chart.js`, `Crypto-Fundflow-Analyzer/components/*Chart.tsx`

---

## Role 5 — i18n Agent  (`packages/i18n/`)
**Goal:** every label exists in Thai + English. Single dictionary, single component.
**Owns:** `packages/i18n/src/**`
**Public API:**
```tsx
t("nav.overview")  // returns current locale's string
<Bilingual th="ตลาดรวม" en="TOTAL MARKET CAP" />
useLocale()        // returns ['th'|'en', setLocale]
```
**Phase 1 tasks:**
- [ ] Create `dict.ts` with every UI label keyed (start by scanning `Pulse Command` + `CryptoTerminal/index.html`)
- [ ] Build `<Bilingual>` component (mimic CryptoTerminal's `.th-label` + `.en-label` stacked layout)
- [ ] Add font fallback rule: Thai uses IBM Plex Sans Thai, EN uses Inter
- [ ] Locale persisted to localStorage
**Source of truth:** `CryptoTerminal/CLAUDE.md` (bilingual rule), `Pulse Command/`

---

## Role 6 — Web Agent  (`apps/web/`)
**Goal:** Next.js 16 app — the user-facing terminal.
**Owns:** `apps/web/**`
**Depends on:** `packages/{ui, sources, charts, i18n}`
**Layout:** 5 tabs in nav
1. **Overview** — Pulse Command hero, key macro pulses, alerts feed
2. **Markets** — Top-N coin table (CryptoTerminal style) + candlestick
3. **Fundflow** — CFA Dashboard (stablecoin/ETF/TVL/DEX)
4. **Derivatives** — funding rates + OI heatmap (live via WS)
5. **AI Analyst** — CFA AnalysisPanel, expanded
**Phase 1 tasks:**
- [ ] Scaffold Next.js 16 (App Router, TS, Tailwind) — copy from `Crypto-Fundflow-Analyzer/`
- [ ] Set up tab routing (`/`, `/markets`, `/fundflow`, `/derivatives`, `/analyst`)
- [ ] Wire `<ThreeBackground>` + `<NavBar>` from `@pulse/ui`
- [ ] Port `Crypto-Fundflow-Analyzer/components/Dashboard.tsx` → Tab 3
- [ ] Port `Crypto-Fundflow-Analyzer/components/AnalysisPanel.tsx` → Tab 5
- [ ] Build hero page (Tab 1) using Pulse Command layout
**Source of truth:** `Pulse Command/`, `Crypto-Fundflow-Analyzer/`

---

## Role 7 — Realtime Agent  (`apps/realtime/`)
**Goal:** Node WebSocket server pushing live funding/OI/flow updates to web clients.
**Owns:** `apps/realtime/**`
**Depends on:** `packages/sources`
**WS message contract:**
```ts
{ type: "funding", exchange: string, symbol: string, rate: number, ts: number }
{ type: "oi",      exchange: string, symbol: string, oi: number,   ts: number }
{ type: "flow.alert", category: string, severity: "low"|"med"|"high", payload: any, ts: number }
{ type: "heartbeat", ts: number }
```
**Phase 1 tasks:**
- [ ] Port `Funding_Oi/server/src/index.js` + `ws.js` to TypeScript
- [ ] Subscribe to Binance/Bybit/OKX funding streams via `@pulse/sources`
- [ ] Broadcast on `ws://localhost:8080`
- [ ] Reconnect logic + 30s heartbeat
- [ ] Backpressure: if a client falls behind, drop messages oldest-first
**Source of truth:** `Funding_Oi/server/`

---

## Role 8 — MCP Agent  (`apps/mcp/`)
**Goal:** expose data + analysis as MCP tools so Claude Desktop can query the terminal.
**Owns:** `apps/mcp/**`
**Depends on:** `packages/sources`
**MCP tool contract:**
```ts
get_market_overview()                          // top-level snapshot
get_funding_summary({ exchange? })             // funding rates aggregated
get_etf_flows({ days?: number })               // BTC/ETH ETF flows
get_tvl_breakdown({ chain? })                  // TVL by chain
get_dex_leaderboard({ days?: number })         // top DEXs by volume
detect_anomalies()                             // cross-source signal — NEW
get_oi_snapshot()                              // open interest — NEW
```
**Phase 1 tasks:**
- [ ] Port `Crypto-Fundflow-Analyzer/mcp-server/src/index.ts`
- [ ] Add 3 new tools: `get_funding_summary`, `detect_anomalies`, `get_oi_snapshot`
- [ ] Update `manifest.json` + repack `.dxt` via `pack-dxt.mjs`
**Source of truth:** `Crypto-Fundflow-Analyzer/mcp-server/`

---

## Cross-role contracts

| Producer            | Consumer        | Contract                                   |
|---------------------|-----------------|--------------------------------------------|
| Role 2 (UI)         | Role 6 (Web)    | `@pulse/ui` exports listed above           |
| Role 3 (Sources)    | Roles 6, 7, 8   | function signatures listed in Role 3       |
| Role 4 (Charts)     | Role 6 (Web)    | `<Candlestick>`, `<FlowChart>`, `<Sparkline>` |
| Role 5 (i18n)       | Role 6 (Web)    | `t()`, `<Bilingual>`, `useLocale()`        |
| Role 7 (Realtime)   | Role 6 (Web)    | WS messages on `ws://localhost:8080`       |
| Role 8 (MCP)        | Claude Desktop  | `.dxt` bundle in `apps/mcp/dist/`          |

**Contract changes:** if you must rename or restructure a contract, **update AGENTS.md FIRST**, then refactor. Other roles read this doc as the source of truth.

---

## Coordination protocol

- **One role per session.** Announce at start.
- **No cross-role edits.** If you need a fix in someone else's lane, leave a `// TODO(role-N): ...` comment and post it in the status board below.
- **Branches** (when git is enabled): `feat/role-<n>-<slug>` — e.g., `feat/role-2-three-background`
- **PR titles:** `[role-N] short description`
- **Done means:** `pnpm typecheck` passes for that workspace + README updated with current public API + showcase visible in `apps/web` (visual roles) or callable via test (data roles).

---

## Migration source map

| New location                              | Copy from                                                        |
|-------------------------------------------|------------------------------------------------------------------|
| `packages/ui/src/tokens.ts`               | `Pulse Command/pulsecommand.html` `:root` block                  |
| `packages/ui/src/ThreeBackground.tsx`     | `Pulse Command/pulsecommand.html` Three.js init                  |
| `packages/ui/src/NavBar.tsx`              | `Pulse Command/pulsecommand.html` `.nav` block                   |
| `packages/sources/src/overview.ts`        | `Crypto-Fundflow-Analyzer/lib/sources/overview.ts`               |
| `packages/sources/src/stablecoins.ts`     | `Crypto-Fundflow-Analyzer/lib/sources/stablecoins.ts`            |
| `packages/sources/src/etf.ts`             | `Crypto-Fundflow-Analyzer/lib/sources/etf.ts`                    |
| `packages/sources/src/tvl.ts`             | `Crypto-Fundflow-Analyzer/lib/sources/tvl.ts`                    |
| `packages/sources/src/dex.ts`             | `Crypto-Fundflow-Analyzer/lib/sources/dex.ts`                    |
| `packages/sources/src/futures.ts`         | `Crypto-Fundflow-Analyzer/lib/sources/futures.ts`                |
| `packages/sources/src/funding.ts`         | `Funding_Oi/server/src/exchanges/*` (NEW — combine all)          |
| `packages/charts/src/Candlestick.tsx`     | `CryptoTerminal/js/chart.js`                                     |
| `packages/charts/src/Sparkline.tsx`       | `CryptoTerminal/js/app.js` `buildSparkline()`                    |
| `packages/charts/src/FlowChart.tsx`       | `Crypto-Fundflow-Analyzer/components/{Stablecoin,ETF,TVL,Dex}Chart.tsx` |
| `packages/i18n/src/dict.ts`               | scanned from all four projects                                   |
| `apps/web/app/page.tsx`                   | `Crypto-Fundflow-Analyzer/app/page.tsx` + Pulse Command hero     |
| `apps/web/components/Dashboard.tsx`       | `Crypto-Fundflow-Analyzer/components/Dashboard.tsx`              |
| `apps/web/components/AnalysisPanel.tsx`   | `Crypto-Fundflow-Analyzer/components/AnalysisPanel.tsx`          |
| `apps/realtime/src/index.ts`              | `Funding_Oi/server/src/index.js`                                 |
| `apps/realtime/src/ws.ts`                 | `Funding_Oi/server/src/ws.js`                                    |
| `apps/mcp/src/index.ts`                   | `Crypto-Fundflow-Analyzer/mcp-server/src/index.ts`               |

**Once a file is fully ported and tested:** delete the source, then check the box in this table.

---

## Status board

> Update as work happens. Owner can be a session ID, a date, or your name.

### Phase 1 + 2 (done)

| Role | Owner    | Status        | Notes |
|------|----------|---------------|-------|
| 1 — Foundation | Claude | Phase 1 done | root configs · pnpm workspace · turbo wired |
| 2 — UI         | Claude | Phase 1 done | tokens + Card + MetricCard + Pill + HeroTitle + NavBar + Loader + ThreeBackground |
| 3 — Sources    | Claude | Phase 1 done | overview · stablecoins · etf+farside · futures · dex · tvl · funding (Binance/Bybit/OKX) · OI · `_helpers` · `format` · `snapshot`+`summarizeSnapshot` |
| 4 — Charts     | Claude | Phase 1 done | Sparkline (SVG) · Candlestick (LWC v4.2) · FlowAreaChart · FlowBarChart with Cell coloring · FlowChart · DepthChart |
| 5 — i18n       | Claude | Phase 1 done | dict + LocaleProvider + useLocale + Bilingual (stack/primary/secondary) + t/useT |
| 6 — Web        | Claude | Phase 1 done | configs · 5 routes + `/design` showcase · 6 flow API routes + `/api/snapshot` + `/api/analyze` (streaming Anthropic) · `/api/markets` · MetricStrip · Dashboard · AnalysisPanel · MarketsTable · live derivatives · LocaleProvider + LocaleToggle wired |
| 7 — Realtime   | Claude | Phase 1+2 done | contracts (subscribe/unsubscribe/ack) · server with heartbeat + backpressure + per-client subscription filtering + channel matching · REST poller + native Binance/Bybit/OKX WS streams (reconnect/backoff, ping per venue, env-toggle via `PULSE_NATIVE_STREAMS`) |
| 8 — MCP        | Claude | Phase 1+2 done | 10 tools (7 ported + 3 new: get_funding_summary, get_oi_snapshot, detect_anomalies) · `detect_anomalies` now backed by shared `scanAnomalies()` in `@pulse/sources` so MCP/alerts/web stay in sync · manifest.json · pack-dxt.mjs |

### Phase 3 (active — MCP-first refactor)

| Sub-phase | Owner | Status | Notes |
|-----------|-------|--------|-------|
| Prereq · git init        | Cursor | _to do_ | `feat: pulse terminal monorepo (phase 1+2 complete)` |
| Prereq · Vitest + tests  | Cursor | ✅ done | `_helpers.test.ts`, `anomalies.test.ts`, `format.test.ts` in `packages/sources/src/` · `vitest@2.1.8` in deps |
| Prereq · /api/health     | Cursor | _to do_ | spec in Phase 3 section above |
| Phase A · cleanup        | Cursor | _to do_ | drop Anthropic SDK + analyze + analyst |
| Phase B v0 · hub HTTP    | Cursor | _to do_ | port 8081 cache + MCP rewire (graceful degrade) |
| Phase C · pm2            | Cursor | files in place, awaiting B v0 | `ecosystem.config.cjs` + `scripts/pulse-status.mjs` ready · pending Hub at `:8081` from Phase B v0 |
| Phase D · split sources  | Cursor | 🟢 in progress | `package.json` exports map + `src/server.ts` ✅ created · `apps/realtime/src/poller.ts` already uses `@pulse/sources/server` · still need: rewire other consumers + drop dynImport hacks + remove webpack fallback |

## Phase 2 — done

| Feature | Where it lives |
|---------|----------------|
| **Native exchange WS streams** | `apps/realtime/src/{binance,bybit,okx}-stream.ts` — markPrice / tickers / funding-rate / open-interest push from each venue with reconnect+backoff + per-venue ping protocol. REST poller stays as fallback |
| **Design system showcase** | `apps/web/app/design/page.tsx` — full visual catalog of `@pulse/ui` + `@pulse/charts` (underscore-prefix folders are private in Next App Router, so the URL is `/design`) |
| **AI Alert Engine** | Shared `scanAnomalies()` / `deriveAnomalies()` in `packages/sources/src/anomalies.ts` (one source of truth across MCP, alerts worker, web). `apps/alerts/` runs the scanner on cron (`ALERT_INTERVAL_MS`, default 15min), persists JSONL to `apps/alerts/data/alerts.jsonl`, optional Discord/Slack webhook via `ALERT_WEBHOOK_URL`. Web exposes `/api/alerts/scan` (live) + `/api/alerts/recent` (log tail) + `<AlertsFeed>` on Overview |
| **Macro overlay** | `packages/sources/src/macro.ts` (DXY/SPX/gold via Yahoo, UA-spoofed) + `apps/web/components/MacroOverlay.tsx` on Overview page |
| **Portfolio sync** | `packages/sources/src/portfolio.ts` (Binance signed account, opt-in via `BINANCE_API_KEY` + `BINANCE_API_SECRET`) + `apps/web/components/PortfolioPanel.tsx` — read-only key only |
| **Backtest tab** | `apps/web/app/api/backtest/route.ts` reads alerts JSONL + Binance hourly klines, computes hit-rate per pattern. UI at `apps/web/app/backtest/page.tsx`, lookahead toggle 4h/24h/72h/7d. Surfaces in NavBar |
| **Markets candlestick** | `apps/web/app/api/klines/route.ts` (Binance v3 klines, validated symbol/interval) + `apps/web/components/CandlestickPanel.tsx` (interval toggle 15m/1h/4h/1d). MarketsTable rows are click-to-select and drive the chart |

---

## Phase 3 — MCP-first refactor (active)

**Context:** user uses Claude Pro/Max subscription via MCP — no Anthropic API budget. Optimize for personal use, 24/7 on user's own machine, MCP latency < 50ms per tool call.

Sequence: **Prereq → A → B v0 → test → C** · D is optional cleanup, not blocking.

### Prerequisites (~45 min, before destructive refactor)
- [ ] `git init` + first commit (`feat: pulse terminal monorepo (phase 1+2 complete)`)
- [ ] Vitest config + 4 smoke tests:
  - `scanAnomalies()` from `packages/sources/src/anomalies.ts`
  - `formatUSD()`, `formatPercent()` from `packages/sources/src/format.ts`
  - `withFallback()` from `packages/sources/src/_helpers.ts` (covers loader-throws, returns-null, returns-undefined, fallback-value-used)
- [ ] `apps/web/app/api/health/route.ts` per spec below

#### `/api/health` contract
```ts
GET /api/health
→ 200 (always — pm2 uses TCP probe, body is for humans)
{
  status: "healthy" | "degraded" | "unhealthy",
  checks: {
    coingecko: { ok: boolean, latencyMs: number, error?: string },
    defillama: { ok: boolean, latencyMs: number, error?: string },
    binance:   { ok: boolean, latencyMs: number, error?: string },
    yahoo:     { ok: boolean, latencyMs: number, error?: string },
    hub?:      { ok: boolean, latencyMs: number, error?: string }   // localhost:8081 once Phase B ships
  },
  ts: number
}
```
- Each check: GET `/ping`-equivalent endpoint, 2s timeout, `Promise.race`
- Status: all-pass = `healthy` · 1-2 fail = `degraded` · 3+ fail = `unhealthy`
- Endpoints: CoinGecko `/api/v3/ping`, DefiLlama `https://api.llama.fi/protocols?limit=1`, Binance `/api/v3/ping`, Yahoo `/v8/finance/chart/^GSPC?range=1d`

### Phase A — MCP-first cleanup (~10 min)
Remove Anthropic SDK + AI panel from web (user uses MCP via Claude Desktop instead).
- [ ] `rm apps/web/app/api/analyze/route.ts`
- [ ] `rm -rf apps/web/app/analyst/`
- [ ] `rm apps/web/components/AnalysisPanel.tsx`
- [ ] `apps/web/package.json` — drop `@anthropic-ai/sdk` dependency
- [ ] `apps/web/components/AppShell.tsx` — drop `{ id: "analyst", … }` from `TABS`
- [ ] Keep `nav.analyst` in `packages/i18n/src/dict.ts` (zero cost, useful if reverted)

**Risk:** low. Anthropic dep is web-only, no other consumer.
**Doesn't kill:** dynImport hack in `farside.ts`/`portfolio.ts` (those are still consumed by `/api/flows/etf` + `/api/portfolio`). That's Phase D's job.

### Phase B — Hub HTTP cache, **v0 only** (~30 min)
Single bottleneck: each MCP tool call hits external APIs. Solution: hot in-memory cache served by `apps/realtime` over localhost HTTP. **Do NOT merge with `apps/alerts`** — keep failure isolation.

#### Cache contract
```ts
// apps/realtime/src/cache.ts (new)
interface HubCache {
  snapshot: FundflowSnapshot | null;     // refreshed every 90s
  snapshotTs: number;
  funding: Map<string, FundingRate>;      // key: `${exchange}:${symbol}`, updated by WS streams
  oi:      Map<string, OpenInterest>;
  health:  { lastError?: string; lastErrorTs?: number };
}
```

#### HTTP server (env `HUB_HTTP_PORT`, default 8081, alongside WS `WS_PORT` 8080, localhost-bind only)
```
GET /snapshot                          → FundflowSnapshot + X-Cache-Age: <seconds>
GET /funding                           → FundingRate[]
GET /funding/:exchange/:symbol         → FundingRate | 404
GET /oi/:exchange/:symbol              → OpenInterest | 404
GET /health                            → see shape below
```
- No auth — bind to `127.0.0.1` only (NOT `0.0.0.0`)
- All responses JSON, no streaming
- Snapshot served stale if poller errors; client checks `X-Cache-Age`

#### Hub `/health` shape (consumed by `scripts/pulse-status.mjs`)
```ts
{
  status: "healthy" | "degraded" | "unhealthy",
  snapshotAgeSec: number,        // seconds since cache last refreshed
  fundingChannelsFresh: number,  // count of funding entries < 5min old
  oiChannels: number,            // count of OI entries cached
  checks?: { [name]: { ok, ms, err? } },
  ts: number,
}
```

#### Web env wiring
- `apps/web` reads `PULSE_HUB_URL` (default `http://127.0.0.1:8081`)
- `/api/health` route does its own check + adds `hub:` block by probing `${PULSE_HUB_URL}/health`

#### MCP rewire
- Each `apps/mcp` tool: query `http://localhost:8081/...` first
- **Graceful degradation:** if hub unreachable (ECONNREFUSED), fallback to direct `@pulse/sources` call + log `[mcp] hub down, falling back to direct fetch`
- Hub-down is non-fatal — Claude Desktop still works, just slower

**Skip v1/v2** — alerts already lives separate, no merge needed.

### Phase C — pm2 production setup (~30 min)
Auto-start hub + alerts + web on user's machine.

#### `ecosystem.config.cjs` (root) — see actual file at repo root
3 services: `pulse-web` (Next start, `:3000`), `pulse-realtime` (`WS_PORT=8080`, `HUB_HTTP_PORT=8081`, `PULSE_NATIVE_STREAMS=binance,bybit,okx`), `pulse-alerts` (cron). Each: `autorestart`, `max_memory_restart`, logs in `./logs/<app>.{out,err}.log`. **MCP server NOT in pm2** — Claude Desktop spawns it via stdio.

#### `scripts/pulse-status.mjs`
- `pm2 jlist` → parse JSON → table (name · status · uptime · mem · restarts)
- `curl localhost:3000/api/health` → pretty-print (color-coded by status)
- `curl localhost:8081/health` → same
- Tail last alert from `apps/alerts/data/alerts.jsonl`

#### Setup steps (README'd)
```bash
npm install -g pm2
pnpm pulse:build
pnpm pulse:start
pm2 save                       # persist current list
pm2 startup                    # generate auto-start command (run as printed)
```

### Phase D — Split `@pulse/sources` (~30 min, optional, kills dynImport debt)
Eliminates: `dynImport` hack in `farside.ts` + `portfolio.ts`, webpack `resolve.fallback` list in `next.config.js`, the `next dev --webpack` workaround. After this, turbopack works.

#### Target shape
```
packages/sources/
├── package.json           ← exports map below
└── src/
    ├── index.ts           ← BROWSER-SAFE only: re-export types, format, _helpers, anomalies types
    ├── server.ts          ← SERVER-ONLY: re-export everything (overview, stablecoins, etf, farside, futures, dex, tvl, funding, macro, portfolio, snapshot)
    ├── types.ts
    ├── format.ts
    ├── _helpers.ts
    ├── anomalies.ts       (split: types in ./anomalies-types.ts, scanner in ./anomalies.ts that imports server-side adapters)
    └── (rest unchanged)
```

#### `package.json` exports map
```json
{
  "name": "@pulse/sources",
  "exports": {
    ".":        { "types": "./src/index.ts",  "default": "./src/index.ts"  },
    "./server": { "types": "./src/server.ts", "default": "./src/server.ts" }
  }
}
```

#### Consumer changes
- `apps/web/components/**` — `import { formatUSD, ... } from "@pulse/sources"` (already correct, browser-safe path)
- `apps/web/app/api/**/route.ts` — change to `import { ... } from "@pulse/sources/server"`
- `apps/realtime/**`, `apps/alerts/**`, `apps/mcp/**` — change to `from "@pulse/sources/server"`
- After all consumers updated:
  - `rm` `dynImport` constructor + `await dynImport("node:...")` from `farside.ts` and `portfolio.ts` → use static `import { execFile } from "node:child_process"` etc.
  - `rm` the `webpack(config, { isServer })` block from `apps/web/next.config.js`
  - `apps/web/package.json` script: `"dev": "next dev -p 3000"` (drop `--webpack` flag)
- Verify: `pnpm typecheck` green + `pnpm dev` boots on turbopack.

**Risk:** medium. Touches every consumer. Do AFTER A/B/C land + after a `git commit` so revert is one-line.

---

## Phase 4 — future ideas (not committed)

1. **Mobile push** — Claude Code mobile push for high-severity alerts (replace webhook)
2. **More exchanges** — Deribit options OI/IV term structure, Coinbase spot
3. **On-chain layer** — Etherscan/Glassnode token transfers, exchange wallet outflows
4. **Multi-portfolio** — Bybit + OKX read-only sync alongside Binance
5. **LLM-graded backtest** — feed signals + outcomes back through Claude for pattern strength critique
6. **MCP `grade_signal` tool** — given a finding, ask Claude for confidence + reasoning
7. **Tool chaining** in MCP instructions — high-severity → auto-fetch funding details next
