// @pulse/sources/dual-assets — server entry. Imports better-sqlite3.

export * from "./types.js";
export {
  saveSnapshot,
  updateDailySummary,
  getHourlyAvg,
  getBestHours,
  getAprIvCorrelation,
  getRecentSnapshots,
  getDailySummaries,
  getStoreStats,
  closeDb,
} from "./store.js";
export type { DailySummary, StoreStats } from "./store.js";
export {
  getDualAssetProducts,
  getSolImpliedVol,
  runDualAssetTick,
} from "./tracker.js";
export { generateHourlyReport } from "./analyzer.js";
