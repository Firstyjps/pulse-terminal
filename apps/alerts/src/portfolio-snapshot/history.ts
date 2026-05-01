// Portfolio history reader + PnL helper.
//
// Storage shape (apps/alerts/data/portfolio-history.jsonl):
//   {ts, dateBkk, totalUsd, _source, venueCount, assetCount}
//
// Read-time dedup: the JSONL is append-only, but multiple writes for the same
// dateBkk are tolerated — readers keep the latest record per BKK date
// (last-write-wins). This makes the cron resilient to edge-case double-fires.
//
// Public surface (also re-exported from "@pulse/alerts/portfolio-snapshot/history"
// for apps/web consumers):
//   - readPortfolioHistory(pathOverride?) → Snapshot[]   (deduped, sorted asc by ts)
//   - computePnL(history, windowDays)     → { usdDelta, pctDelta } | null
//   - appendSnapshot(snap, pathOverride?) → Promise<void>
//   - DEFAULT_HISTORY_PATH                → string

import { appendFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

export interface PortfolioSnapshot {
  /** epoch ms when the snapshot was captured */
  ts: number;
  /** BKK date string YYYY-MM-DD — the canonical dedup key */
  dateBkk: string;
  totalUsd: number;
  /** Which upstream produced the data ("coinstats" | "multi-cex" | "none"). */
  _source: string;
  venueCount: number;
  assetCount: number;
}

export type PnLWindow = 1 | 7 | 30;

export interface PnLResult {
  usdDelta: number;
  pctDelta: number;
}

export const DEFAULT_HISTORY_PATH = resolve(
  process.env.PORTFOLIO_HISTORY_PATH ?? "./data/portfolio-history.jsonl",
);

const DAY_MS = 86_400_000;

function isSnapshot(x: unknown): x is PortfolioSnapshot {
  if (!x || typeof x !== "object") return false;
  const r = x as Record<string, unknown>;
  return (
    typeof r.ts === "number" &&
    typeof r.dateBkk === "string" &&
    typeof r.totalUsd === "number" &&
    typeof r._source === "string" &&
    typeof r.venueCount === "number" &&
    typeof r.assetCount === "number"
  );
}

/** Dedup by dateBkk — keep the *latest written* row per date (last-write-wins). */
function dedupByDate(rows: PortfolioSnapshot[]): PortfolioSnapshot[] {
  const map = new Map<string, PortfolioSnapshot>();
  for (const r of rows) map.set(r.dateBkk, r); // later entries overwrite earlier
  return [...map.values()].sort((a, b) => a.ts - b.ts);
}

/**
 * Read history JSONL. Tolerates missing file, blank lines, malformed rows.
 * Returns deduped + sorted ascending by ts.
 */
export async function readPortfolioHistory(
  pathOverride?: string,
): Promise<PortfolioSnapshot[]> {
  const path = pathOverride ?? DEFAULT_HISTORY_PATH;
  let txt: string;
  try {
    txt = await readFile(path, "utf8");
  } catch {
    return [];
  }
  const rows: PortfolioSnapshot[] = [];
  for (const line of txt.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (isSnapshot(parsed)) rows.push(parsed);
    } catch {
      // skip malformed line — don't crash the reader
    }
  }
  return dedupByDate(rows);
}

/** Append a snapshot row. Creates parent dir if needed. */
export async function appendSnapshot(
  snap: PortfolioSnapshot,
  pathOverride?: string,
): Promise<void> {
  const path = pathOverride ?? DEFAULT_HISTORY_PATH;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, JSON.stringify(snap) + "\n", "utf8");
}

/**
 * Compute usd / pct delta over a sliding window of `windowDays`.
 *
 * Picks the latest snapshot whose ts is at-or-before (latest.ts - windowDays).
 * That guarantees the baseline is at least `windowDays` of separation away,
 * preventing 7d-window from accidentally using a 2-day-old baseline.
 *
 * Returns null when:
 *   - history has < 2 distinct snapshots
 *   - no snapshot exists ≥ windowDays before the latest
 *   - the chosen baseline has totalUsd === 0 (can't compute pct)
 *
 * Cross-source data (coinstats → multi-cex switch) is handled by trusting
 * `totalUsd` as USD-comparable across sources.
 */
export function computePnL(
  history: PortfolioSnapshot[],
  windowDays: PnLWindow,
): PnLResult | null {
  if (!history || history.length < 2) return null;
  const sorted = [...history].sort((a, b) => a.ts - b.ts);
  const latest = sorted[sorted.length - 1];
  const targetTs = latest.ts - windowDays * DAY_MS;

  let baseline: PortfolioSnapshot | null = null;
  for (let i = 0; i < sorted.length - 1; i++) {
    const row = sorted[i];
    if (row.ts <= targetTs) baseline = row; // keep walking — we want the latest qualifying row
  }
  if (!baseline) return null;
  if (baseline.totalUsd === 0) return null;

  const usdDelta = latest.totalUsd - baseline.totalUsd;
  const pctDelta = (usdDelta / baseline.totalUsd) * 100;
  return { usdDelta, pctDelta };
}
