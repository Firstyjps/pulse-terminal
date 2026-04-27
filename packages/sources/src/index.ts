// @pulse/sources — public exports
// All external data adapters live here. Apps must import from this package
// rather than calling APIs directly.

export * from "./types";

export { fetchJson, withFallback, sleep } from "./_helpers";
export type { FetchOpts } from "./_helpers";

export { formatUSD, formatNumber, formatPercent } from "./format";

export { getOverview } from "./overview";
export { getStablecoins } from "./stablecoins";
export { getETFFlows } from "./etf";
export { getTVL } from "./tvl";
export { getDexVolume } from "./dex";
export { getFutures, getFuturesSymbol } from "./futures";
export { getFundingRates, getOpenInterest } from "./funding";
export { getFullSnapshot, summarizeSnapshot } from "./snapshot";
export { scanAnomalies, deriveAnomalies } from "./anomalies";
export type {
  AnomalyFinding,
  AnomalyScan,
  AnomalyCategory,
  AnomalySeverity,
} from "./anomalies";
export { getMacro } from "./macro";
export type { MacroPoint, MacroSeries, MacroResponse } from "./macro";
export { getPortfolio } from "./portfolio";
export type { PortfolioBalance, PortfolioSnapshot } from "./portfolio";
