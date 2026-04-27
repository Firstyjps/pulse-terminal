// @pulse/sources — public exports
// All external data adapters live here. Apps must import from this package
// rather than calling APIs directly.
//
// `.js` extensions are required because the package is `"type": "module"`
// and downstream apps use NodeNext module resolution. TS sees the .ts source
// at compile time, Node sees emitted .js at runtime — same specifier works for both.

export * from "./types.js";

export { fetchJson, withFallback, sleep } from "./_helpers.js";
export type { FetchOpts } from "./_helpers.js";

export { formatUSD, formatNumber, formatPercent } from "./format.js";

export { getOverview } from "./overview.js";
export { getStablecoins } from "./stablecoins.js";
export { getETFFlows } from "./etf.js";
export { getTVL } from "./tvl.js";
export { getDexVolume } from "./dex.js";
export { getFutures, getFuturesSymbol } from "./futures.js";
export { getFundingRates, getOpenInterest } from "./funding.js";
export { getFullSnapshot, summarizeSnapshot } from "./snapshot.js";
export { scanAnomalies, deriveAnomalies } from "./anomalies.js";
export type {
  AnomalyFinding,
  AnomalyScan,
  AnomalyCategory,
  AnomalySeverity,
} from "./anomalies.js";
export { getMacro } from "./macro.js";
export type { MacroPoint, MacroSeries, MacroResponse } from "./macro.js";
export { getPortfolio } from "./portfolio.js";
export type { PortfolioBalance, PortfolioSnapshot } from "./portfolio.js";
