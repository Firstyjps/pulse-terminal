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
export type { PortfolioSnapshot, PortfolioBalance, PortfolioSource } from "./portfolio.js";
export { getBybitPortfolio } from "./portfolio-bybit.js";
export { getOkxPortfolio } from "./portfolio-okx.js";
export { getMultiPortfolio } from "./portfolio-multi.js";
export type { MultiPortfolioSnapshot } from "./portfolio-multi.js";

// Phase 6 W1-2 — DeFi position adapters + unified aggregator
export { getMeteoraPositions } from "./meteora-positions.js";
export { getPendlePositions } from "./pendle-positions.js";
export { getOrcaPositions } from "./orca-positions.js";
export { getAavePositions } from "./aave-positions.js";
export { getAggregatePortfolio } from "./portfolio-aggregate.js";
export type {
  AggregateSnapshot,
  VenueSummary,
  VenueBalance,
  AssetSummary,
} from "./portfolio-aggregate.js";
export { parseWallets, getEvmWallets, getSolanaWallets } from "./_wallets.js";
export type { ParsedWallet, WalletChain } from "./_wallets.js";
export { getDepth } from "./depth.js";
export type { DepthBook } from "./depth.js";
export { getWhaleFlow } from "./whale-flow.js";
export type { WhaleTransfer, WhaleFlowResponse } from "./whale-flow.js";

// Phase 5 — Intelligence & Analytics
export { getCryptoNews } from "./news.js";
export type { NewsItem, NewsFilter } from "./news.js";
export { getOnChainMetrics } from "./on-chain.js";
export type { OnChainMetrics } from "./on-chain.js";
export { getWhaleAlerts } from "./whale-alerts.js";
export type { WhaleAlertTx, WhaleAlertsResponse } from "./whale-alerts.js";
export { getSocialBuzz } from "./social.js";
export type { SocialMention, SocialBuzzResponse } from "./social.js";

// Phase 6 — Extended Platform: snapshot history (SQLite-backed, 90-day rolling)
export {
  saveDailySnapshot,
  getSnapshotHistory,
  getAllSnapshots,
  clearSnapshots,
  getSnapshotStats,
} from "./snapshot-history.js";
export type {
  MarketSnapshot,
  MarketSnapshotTop10,
} from "./snapshot-history.js";
export {
  collectDailySnapshot,
  collectAndSaveDailySnapshot,
} from "./snapshot-collector.js";

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
