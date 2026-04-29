// @pulse/sources/server — SERVER-ONLY barrel.
//
// Imports here may use `node:*` modules (child_process, crypto, fs). Never
// import this entry from a client component — webpack will fail to bundle it.
//
// Strategy: re-export the browser-safe surface plus all data adapters.
// Consumers running in a server context (API routes, daemons, MCP, alerts cron)
// should import from this path.

export * from "./index.js";

export { getOverview } from "./overview.js";
export { getStablecoins } from "./stablecoins.js";
export { getETFFlows } from "./etf.js";
export { getTVL } from "./tvl.js";
export { getDexVolume } from "./dex.js";
export { getFutures, getFuturesSymbol } from "./futures.js";
export { getFundingRates, getOpenInterest } from "./funding.js";
export { getFullSnapshot, summarizeSnapshot } from "./snapshot.js";
export { scanAnomalies, deriveAnomalies } from "./anomalies.js";
export { getMacro } from "./macro.js";
export { getPortfolio } from "./portfolio.js";
export { getDepth } from "./depth.js";
export type { DepthBook } from "./depth.js";
export { getWhaleFlow } from "./whale-flow.js";
export type { WhaleTransfer, WhaleFlowResponse } from "./whale-flow.js";

// Multi-exchange options (Deribit/Binance/Bybit/OKX) — Phase 5A
export * from "./options/index.js";

// Bybit Dual Assets APR tracker + SQLite store — Phase 5A
export * from "./dual-assets/index.js";

// Phase 4 — graded backtest runner (server-only: reads JSONL, fetches klines, writes report)
export {
  runGradedBacktest,
  writeGradedBacktestReport,
  readScansFromJsonl,
  fetchKlinesForScan,
  buildSyntheticFixture,
} from "./grade-replay-runner.js";
export type {
  ScanRecord,
  GradedBacktestOpts,
  GradedBacktestResult,
} from "./grade-replay-runner.js";
