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
export type { PortfolioBalance, PortfolioSnapshot, PortfolioSource } from "./portfolio.js";
export type { MultiPortfolioSnapshot } from "./portfolio-multi.js";

// Phase 6 W1-2 — position adapter shared types (browser-safe; pure types)
export type { Position, PositionType, PositionResult, PositionFetcher } from "./position-types.js";
export type {
  AggregateSnapshot,
  VenueSummary,
  VenueBalance,
  AssetSummary,
  PortfolioSourceTag,
} from "./portfolio-aggregate.js";
export type { CoinStatsPortfolio, CoinStatsAsset } from "./coinstats.js";
export type { ParsedWallet, WalletChain } from "./_wallets.js";

// Phase 5 — Intelligence & Analytics types (browser-safe)
export type { NewsItem, NewsFilter } from "./news.js";
export type { OnChainMetrics } from "./on-chain.js";
export type { WhaleAlertTx, WhaleAlertsResponse } from "./whale-alerts.js";
export type { SocialMention, SocialBuzzResponse } from "./social.js";

// Phase 6 — Extended Platform types (browser-safe)
export type { MarketSnapshot, MarketSnapshotTop10 } from "./snapshot-history.js";

// Phase 5A — multi-exchange options types (browser-safe; pure types + expiry helper)
export type {
  OptionExchange,
  OptionAsset,
  OptionSide,
  OptionData,
  OptionsAggregateResponse,
  OptionsArbitrage,
} from "./options/types.js";
export { normalizeExpiry, formatExpiry } from "./options/_expiry.js";
export type { TermStructurePoint, OptionsTermStructure } from "./options/term-structure.js";

// Phase 5A — dual-assets types (browser-safe; SQLite store stays server-only)
export type {
  DualAssetDirection,
  DualAssetProduct,
  DualAssetSnapshot,
  HourlyAprStat,
  DualAssetReport,
  AprIvCorrelation,
} from "./dual-assets/types.js";

// Phase 4 — pure rubric builder for the MCP `grade_signal` tool. No I/O, safe in any context.
export { buildGradeSignalRubric } from "./grade-signal.js";
export type {
  GradeSignalRubric,
  GradeSignalOutput,
  SuggestedAction,
} from "./grade-signal.js";

// Phase 4 — graded backtest engine. Pure functions; OHLCV injected via callback so
// callers (apps/web API route, CLI scripts) own the I/O.
export {
  applyRubric,
  extractSignalStrength,
  scoreOutcome,
  replayFindings,
  aggregateReport,
  priorHitRateFromReport,
} from "./grade-replay.js";
export type {
  OhlcvRow,
  ApplyRubricContext,
  ApplyRubricResult,
  ScoreOutcomeResult,
  ReplayInput,
  ReplayResult,
  BucketStats,
  CalibrationBucket,
  AggregateReport,
} from "./grade-replay.js";
