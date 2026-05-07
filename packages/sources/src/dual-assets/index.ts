// @pulse/sources/dual-assets — server entry. Imports better-sqlite3.

export * from "./types.js";
export {
  DUAL_ASSET_DIRECTIONS,
  DUAL_ASSET_DURATION_LABELS,
  DUAL_ASSET_DURATIONS,
  getDualAssetsSettings,
  loadDualAssetsConfig,
  normalizeDirection,
  normalizeDuration,
  parseDirections,
  parseDurations,
} from "./config.js";
export {
  saveSnapshot,
  saveSnapshots,
  updateDailySummary,
  getHourlyAvg,
  getBestHours,
  getAprIvCorrelation,
  getRecentSnapshots,
  getDailySummaries,
  getStoreStats,
  resolveDbPath,
  recordTickRun,
  hasRecentAlert,
  recordAlert,
  getAlertEvents,
  closeDb,
} from "./store.js";
export type { StoreStats } from "./store.js";
export {
  fetchDualAssetSnapshotBatch,
  getDualAssetProducts,
  getSolImpliedVol,
  runDualAssetTick,
} from "./tracker.js";
export { generateHourlyReport } from "./analyzer.js";
