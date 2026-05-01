// Daily portfolio snapshot cron — fires once per BKK day during the 23:xx hour
// (aiming at 23:59 BKK / 16:59 UTC, before midnight rollover).
//
// Persists to apps/alerts/data/portfolio-history.jsonl. Read-time dedup by
// dateBkk means double-fires same day are tolerated (last-write-wins on read).
//
// On startup, runs a backfill check — if history is empty, write one snapshot
// immediately so the Morning dashboard has at least 1 data point to show
// instead of "$—".
//
// Skip rules:
//   - getAggregatePortfolio() returns _source === "none" (no portfolio configured)
//
// Wired from apps/alerts/src/index.ts alongside the other crons.

import { getAggregatePortfolio } from "@pulse/sources/server";
import {
  DEFAULT_HISTORY_PATH,
  appendSnapshot,
  readPortfolioHistory,
  type PortfolioSnapshot,
} from "./history.js";

const TICK_INTERVAL_MS = Number(
  process.env.PORTFOLIO_SNAPSHOT_TICK_MS ?? 60_000,
);
const TARGET_BKK_HOUR = 23;

interface AggregateLike {
  totalUsd: number;
  byVenue: { name: string }[];
  byAsset: { ticker: string }[];
  _source: string;
}

interface SnapshotInjections {
  fetchAggregate?: () => Promise<AggregateLike>;
  historyPath?: string;
  now?: () => number;
}

function bkkDateString(epochMs: number): string {
  return new Date(epochMs + 7 * 60 * 60_000).toISOString().slice(0, 10);
}

function bkkHour(epochMs: number): number {
  return new Date(epochMs + 7 * 60 * 60_000).getUTCHours();
}

/**
 * Capture a single snapshot. Returns the persisted row, or null when
 * the portfolio is not configured (so the cron can log + skip).
 */
export async function captureSnapshot(
  inj: SnapshotInjections = {},
): Promise<PortfolioSnapshot | null> {
  const fetchAggregate = inj.fetchAggregate ?? (() => getAggregatePortfolio() as Promise<AggregateLike>);
  const path = inj.historyPath ?? DEFAULT_HISTORY_PATH;
  const now = (inj.now ?? Date.now)();

  const data = await fetchAggregate();
  if (data._source === "none" || (data.totalUsd === 0 && data.byVenue.length === 0)) {
    return null;
  }

  const snap: PortfolioSnapshot = {
    ts: now,
    dateBkk: bkkDateString(now),
    totalUsd: data.totalUsd,
    _source: data._source,
    venueCount: data.byVenue.length,
    assetCount: data.byAsset.length,
  };
  await appendSnapshot(snap, path);
  return snap;
}

/**
 * Boot-time backfill. If the history file has zero rows, fire one snapshot now
 * so the dashboard has a baseline. Tolerates corrupt files — readPortfolioHistory
 * already swallows parse errors, so a malformed file is treated as "empty" and
 * a fresh snapshot is appended (which any later read will dedup correctly).
 */
export async function maybeBackfill(
  inj: SnapshotInjections = {},
): Promise<{ wrote: boolean; reason: string }> {
  const path = inj.historyPath ?? DEFAULT_HISTORY_PATH;
  const existing = await readPortfolioHistory(path);
  if (existing.length > 0) return { wrote: false, reason: "history_present" };
  const snap = await captureSnapshot(inj);
  if (!snap) return { wrote: false, reason: "portfolio_not_configured" };
  return { wrote: true, reason: "backfill_ok" };
}

export interface SnapshotCronOpts extends SnapshotInjections {
  intervalMs?: number;
  /** Initial value for the dedup tracker — useful in tests. */
  lastFiredDate?: string | null;
  /** Skip the boot-time backfill probe — useful in tests. */
  skipBackfill?: boolean;
}

/**
 * Kick off the cron. Returns a stop function.
 *
 * The cron polls every `intervalMs` (default 60s). It fires when:
 *   - bkkHour === 23 (last hour of BKK day)
 *   - the current BKK date hasn't been fired yet this run
 *
 * On boot, runs `maybeBackfill()` so an empty install gets a data point right
 * away. The backfilled date is reused as the dedup key so the cron won't
 * re-fire later that same BKK day.
 */
export function startPortfolioSnapshotCron(opts: SnapshotCronOpts = {}): () => void {
  const intervalMs = opts.intervalMs ?? TICK_INTERVAL_MS;
  let lastFiredDate: string | null = opts.lastFiredDate ?? null;

  const fireIfDue = async () => {
    const now = (opts.now ?? Date.now)();
    const dateStr = bkkDateString(now);
    if (bkkHour(now) !== TARGET_BKK_HOUR) return;
    if (lastFiredDate === dateStr) return;
    lastFiredDate = dateStr;
    try {
      const snap = await captureSnapshot(opts);
      if (snap) {
        console.log(
          `[portfolio-snapshot] saved ${snap.dateBkk} — total $${snap.totalUsd.toFixed(2)} ` +
            `· source ${snap._source} · venues ${snap.venueCount} · assets ${snap.assetCount}`,
        );
      } else {
        console.log(
          `[portfolio-snapshot] skipped: portfolio not configured (date ${dateStr})`,
        );
      }
    } catch (err) {
      console.warn("[portfolio-snapshot] tick failed:", (err as Error).message);
    }
  };

  // Backfill probe — runs once at boot, in parallel with the regular interval.
  if (!opts.skipBackfill) {
    void (async () => {
      try {
        const result = await maybeBackfill(opts);
        if (result.wrote) {
          const dateStr = bkkDateString((opts.now ?? Date.now)());
          lastFiredDate = dateStr; // pre-seed dedup so tonight's 23:59 doesn't double-fire
          console.log(`[portfolio-snapshot] backfill wrote initial snapshot (${dateStr})`);
        } else if (result.reason === "portfolio_not_configured") {
          console.log("[portfolio-snapshot] backfill skipped: portfolio not configured");
        }
      } catch (err) {
        console.warn("[portfolio-snapshot] backfill failed:", (err as Error).message);
      }
    })();
  }

  void fireIfDue();
  const timer = setInterval(() => void fireIfDue(), intervalMs);
  console.log("[portfolio-snapshot] armed — fires 23:59 BKK daily");

  return () => clearInterval(timer);
}
