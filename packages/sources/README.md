# @pulse/sources

Every external data adapter, formatter, and shared type for Pulse Terminal.

After Phase D split, this package has **two entry points**:

| Import path | Safe in | Contains |
|-------------|---------|----------|
| `@pulse/sources` | browser + server | types, format helpers, `_helpers` (fetchJson, withFallback, sleep), anomaly types, macro/portfolio types |
| `@pulse/sources/server` | server only | everything above + actual fetchers (overview, stablecoins, etf, futures, dex, tvl, funding, macro, portfolio, snapshot, anomalies, farside) |

**Rule of thumb:** if it touches `node:*`, it lives behind `/server`. Putting a server-only fetcher in browser code now fails with a clear bundler error instead of silently breaking at runtime.

---

## Public API — `@pulse/sources` (browser-safe)

```ts
// types
import type {
  MarketOverview, StablecoinFlow, ETFFlow, ETFFlowResponse, ETFSource,
  FuturesData, FuturesResponse, DexVolumeResponse, TvlResponse,
  FundflowSnapshot, FundingRate, OpenInterest, Exchange,
  MacroPoint, MacroSeries, MacroResponse,
  PortfolioBalance, PortfolioSnapshot,
  Finding, Severity, AnomalyCategory,
} from "@pulse/sources";

// format
import { formatUSD, formatNumber, formatPercent } from "@pulse/sources";

// helpers (fetchJson works in both env via standard fetch)
import { fetchJson, withFallback, sleep, type FetchOpts } from "@pulse/sources";
```

Use these in **client components** (`"use client"`) and anywhere the browser bundle reaches.

## Public API — `@pulse/sources/server` (server only)

Everything from `@pulse/sources` plus:

```ts
// market data
import {
  getOverview, getStablecoins, getETFFlows, getTVL, getDexVolume,
  getFutures, getFuturesSymbol,
  getMacro, getPortfolio,
  getFullSnapshot, summarizeSnapshot,
} from "@pulse/sources/server";

// derivatives
import { getFundingRates, getOpenInterest } from "@pulse/sources/server";

// anomaly engine (shared across MCP + alerts + web)
import { scanAnomalies, deriveAnomalies } from "@pulse/sources/server";
```

Use these in:
- Next.js API routes (`apps/web/app/api/**/route.ts`)
- Workers (`apps/realtime`, `apps/alerts`)
- MCP server (`apps/mcp`)
- Any `node` script

---

## Where each fetcher gets data

| Function | Source | Auth | Cache TTL |
|----------|--------|------|-----------|
| `getOverview()` | CoinGecko `/global` + alternative.me + DefiLlama | none | 120s |
| `getStablecoins()` | DefiLlama `/stablecoins` | none | 600s |
| `getETFFlows()` | Coinglass (paid) → Farside (scrape) → proxy | optional `COINGLASS_API_KEY` | 1800s |
| `getFutures()` | Binance fapi (premiumIndex, openInterestHist, klines) | none | 60s |
| `getDexVolume()` | DefiLlama `/overview/dexs` | none | 600s |
| `getTVL()` | DefiLlama `/v2/historicalChainTvl` + `/v2/chains` | none | 600s |
| `getFundingRates()` | Binance/Bybit/OKX premiumIndex per venue | none | 60s |
| `getOpenInterest()` | Binance/Bybit/OKX OI per venue | none | 60s |
| `getMacro()` | Yahoo Finance `/v8/finance/chart` (DXY, ^GSPC, GC=F) | UA-spoofed | 600s |
| `getPortfolio()` | Binance signed `/api/v3/account` | required `BINANCE_API_KEY` + `_SECRET` | none (per-call) |

All public fetchers implement **fallback chains** via `withFallback()` from `_helpers.ts` — `Promise.allSettled` then graceful degradation.

---

## Fallback pattern

```ts
import { withFallback, fetchJson } from "@pulse/sources";

const data = await withFallback([
  () => fetchJson<T>("https://primary-source.com/data"),
  () => fetchJson<T>("https://fallback-source.com/data"),
  () => readFromCache(),                              // last resort
], DEFAULT_VALUE);                                    // optional terminal fallback
```

Loaders are tried in order until one returns non-null. If all fail and a fallback is provided, the fallback returns; otherwise the last error throws.

---

## Adding a new source

1. Create `src/<name>.ts` exporting `get<Name>()` that returns a typed shape
2. Add the type to `src/types.ts` if shared
3. If the source touches `node:*` or signs requests → re-export from **`server.ts` only**, NOT from `index.ts`
4. If pure-fetch + no node imports → re-export from both `index.ts` and `server.ts`
5. Add a Vitest under `src/<name>.test.ts` if the shape transformation is non-trivial

---

## Why two entry points?

Earlier (Phase 1+2) the barrel re-exported everything. `farside.ts` uses `node:child_process` (curl shell-out) and `portfolio.ts` uses `node:crypto` (HMAC sign) — webpack saw these in the browser bundle and crashed. We worked around it with `dynImport = new Function(...)` to hide the imports from static analysis + a long `webpack.resolve.fallback` list.

That worked but accumulated debt. Phase D split eliminated both hacks: `index.ts` is genuinely browser-safe, `server.ts` is genuinely Node-only, and the bundler can't make a mistake.

See [docs/ADR-001-mcp-first.md](../../docs/ADR-001-mcp-first.md) for the broader architectural pivot that motivated this cleanup.
