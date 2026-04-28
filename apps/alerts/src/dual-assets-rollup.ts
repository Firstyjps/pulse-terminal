// Daily summary rollup — runs at 00:05 ICT every day.
// Aggregates yesterday's apr_snapshots into daily_summary rows
// (avg/max/min/best_hour/worst_hour per coin_pair × target_price).
//
// Why separate from the 5-min tick:
//   - The tick writes raw rows; the rollup reads them and computes aggregates.
//   - Rollup runs once per day after midnight, so it sees the full ICT calendar day.

import { updateDailySummary } from "@pulse/sources/server";

// ICT = UTC+7 — compute "yesterday" relative to ICT for correct calendar boundaries.
function yesterdayInIct(): string {
  const now = new Date();
  const ict = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  ict.setUTCDate(ict.getUTCDate() - 1);
  return ict.toISOString().slice(0, 10);
}

function msUntilNext0005Ict(): number {
  const now = new Date();
  // 00:05 ICT = 17:05 UTC the previous calendar day in UTC terms; easier: add 7h, find next 00:05, subtract 7h
  const ictNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const target = new Date(Date.UTC(ictNow.getUTCFullYear(), ictNow.getUTCMonth(), ictNow.getUTCDate(), 0, 5, 0));
  if (target.getTime() <= ictNow.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - ictNow.getTime();
}

const COIN_PAIRS = (process.env.DUAL_ASSETS_ROLLUP_PAIRS ?? "SOL-USDT")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function rollup() {
  const date = yesterdayInIct();
  for (const pair of COIN_PAIRS) {
    try {
      updateDailySummary(date, pair);
      console.log(`[dual-assets-rollup] ${date} ${pair} — done`);
    } catch (err) {
      console.warn(`[dual-assets-rollup] ${date} ${pair} failed:`, (err as Error).message);
    }
  }
}

export function startDualAssetsRollup(): () => void {
  const hasKeys = process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET;
  if (!hasKeys) {
    console.log("[dual-assets-rollup] BYBIT_API_KEY/SECRET missing — rollup disabled");
    return () => {};
  }
  // Fire once on boot in case the previous day's rollup was missed.
  console.log(`[dual-assets-rollup] starting — pairs: ${COIN_PAIRS.join(",")}, rolls at 00:05 ICT`);
  rollup();

  let timeout: NodeJS.Timeout;
  const schedule = () => {
    const wait = msUntilNext0005Ict();
    console.log(`[dual-assets-rollup] next rollup in ${(wait / 1000 / 60).toFixed(1)} min`);
    timeout = setTimeout(() => {
      rollup();
      schedule();
    }, wait);
  };
  schedule();

  return () => clearTimeout(timeout);
}
