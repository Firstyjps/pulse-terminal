import { isAbsolute, resolve } from "node:path";
import type {
  DualAssetDirection,
  DualAssetDuration,
  DualAssetsConfig,
  DualAssetsSettings,
} from "./types.js";

export const DUAL_ASSET_DURATION_LABELS: Record<DualAssetDuration, string> = {
  "8h": "8 Hours",
  "1d": "1 Day",
};

export const DUAL_ASSET_DURATIONS: DualAssetDuration[] = ["8h", "1d"];
export const DUAL_ASSET_DIRECTIONS: DualAssetDirection[] = ["BuyLow", "SellHigh"];

export function normalizeDuration(value: string | null | undefined): DualAssetDuration | null {
  const v = (value ?? "").trim().toLowerCase();
  if (v === "8h" || v === "8hr" || v === "8hrs" || v === "8hour" || v === "8hours") return "8h";
  if (v === "1d" || v === "1day" || v === "1 day" || v === "1") return "1d";
  return null;
}

export function normalizeDirection(value: string | null | undefined): DualAssetDirection | null {
  const v = (value ?? "").trim().toLowerCase().replace(/[\s_-]/g, "");
  if (v === "buylow") return "BuyLow";
  if (v === "sellhigh") return "SellHigh";
  return null;
}

export function parseDurations(value: string | null | undefined, fallback: DualAssetDuration[] = DUAL_ASSET_DURATIONS): DualAssetDuration[] {
  if (value == null || value.trim() === "") return [...fallback];
  const normalized = value
    .split(",")
    .map((item) => normalizeDuration(item))
    .filter((item): item is DualAssetDuration => item != null);
  return [...new Set(normalized)];
}

export function parseDirections(value: string | null | undefined, fallback: DualAssetDirection[] = DUAL_ASSET_DIRECTIONS): DualAssetDirection[] {
  if (value == null || value.trim() === "") return [...fallback];
  const normalized = value
    .split(",")
    .map((item) => normalizeDirection(item))
    .filter((item): item is DualAssetDirection => item != null);
  return [...new Set(normalized)];
}

function parsePairs(value: string | undefined): string[] {
  return (value ?? "SOL-USDT")
    .split(",")
    .map((item) => item.trim().toUpperCase())
    .filter(Boolean);
}

function parseTargets(value: string | undefined): number[] | null {
  const raw = (value ?? "all").trim().toLowerCase();
  if (raw === "" || raw === "all") return null;
  const targets = raw
    .split(",")
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item));
  return targets.length ? targets : null;
}

function numberFromEnv(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

export function resolveDualAssetsDbPath(value = process.env.DUAL_ASSETS_DB_PATH): string | undefined {
  if (!value) return undefined;
  return isAbsolute(value) ? value : resolve(process.cwd(), value);
}

export function loadDualAssetsConfig(env: NodeJS.ProcessEnv = process.env): DualAssetsConfig {
  const durations = parseDurations(env.DUAL_ASSETS_DURATIONS ?? "8h,1d", DUAL_ASSET_DURATIONS);
  const directions = parseDirections(env.DUAL_ASSETS_DIRECTIONS ?? "BuyLow,SellHigh", DUAL_ASSET_DIRECTIONS);
  return {
    pairs: parsePairs(env.DUAL_ASSETS_PAIRS),
    directions,
    targets: parseTargets(env.DUAL_ASSETS_TARGETS),
    durations,
    minTrackAprPct: numberFromEnv(env.DUAL_ASSETS_MIN_TRACK_APR, 55),
    aprAlertPct: numberFromEnv(env.DUAL_ASSETS_APR_ALERT, 100),
    intervalMs: numberFromEnv(env.DUAL_ASSETS_INTERVAL_MS, 300_000),
    dbPath: resolveDualAssetsDbPath(env.DUAL_ASSETS_DB_PATH),
    schedulerEnabled: env.DUAL_ASSETS_SCHEDULER !== "0",
  };
}

export function getDualAssetsSettings(dbPath: string, env: NodeJS.ProcessEnv = process.env): DualAssetsSettings {
  const config = loadDualAssetsConfig(env);
  return {
    pairs: config.pairs,
    directions: config.directions,
    targets: config.targets,
    durations: config.durations,
    durationLabels: DUAL_ASSET_DURATION_LABELS,
    minTrackAprPct: config.minTrackAprPct,
    aprAlertPct: config.aprAlertPct,
    intervalMs: config.intervalMs,
    dbPath,
    schedulerEnabled: config.schedulerEnabled,
    bybitKeyConfigured: Boolean(env.BYBIT_API_KEY && env.BYBIT_API_SECRET),
    authRequiredForTracking: false,
  };
}
