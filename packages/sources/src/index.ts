// @pulse/sources — BROWSER-SAFE entry point.
//
// This barrel only re-exports things that have **no Node-only imports**:
//   - shared types (erased at runtime)
//   - pure formatters
//   - fetch-based helpers (work on both client and server)
//
// Server-only data adapters (`getOverview`, `getETFFlows`, `getPortfolio`, etc.)
// live in `./server.ts`. Client components must NOT import from `@pulse/sources/server`
// — that path drags in farside (`node:child_process`) and portfolio (`node:crypto`)
// which webpack cannot bundle for the browser.
//
// `.js` extensions are required because the package is `"type": "module"` and
// downstream apps use NodeNext module resolution.

export * from "./types.js";

export { fetchJson, withFallback, sleep } from "./_helpers.js";
export type { FetchOpts } from "./_helpers.js";

export { formatUSD, formatNumber, formatPercent } from "./format.js";

// Type-only re-exports — TypeScript erases these, so the runtime modules
// (`anomalies.ts`, `macro.ts`, `portfolio.ts`) are NOT loaded by client
// bundles even though they sit in this package.
export type {
  AnomalyFinding,
  AnomalyScan,
  AnomalyCategory,
  AnomalySeverity,
} from "./anomalies.js";
export type { MacroPoint, MacroSeries, MacroResponse } from "./macro.js";
export type { PortfolioBalance, PortfolioSnapshot } from "./portfolio.js";
