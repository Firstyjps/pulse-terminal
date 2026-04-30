// Daily market snapshot cron — fires at 00:05 UTC to capture totalMcap +
// totalVolume + dominance + F&G + top10 coins for the day.
//
// Snapshots are persisted via SQLite (snapshot-history table). 90-day
// rolling window — older rows are pruned on every insert.
//
// Also runs an immediate one-shot collection at boot so a cold-start
// instance has at least one row before midnight.

import { collectAndSaveDailySnapshot } from "@pulse/sources/server";

function msUntilNext0005Utc(): number {
  const now = new Date();
  const target = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    0, 5, 0,
  ));
  if (target.getTime() <= now.getTime()) target.setUTCDate(target.getUTCDate() + 1);
  return target.getTime() - now.getTime();
}

async function tick() {
  try {
    const result = await collectAndSaveDailySnapshot();
    if ("skipped" in result) {
      console.log(`[snapshot-cron] skipped — ${result.reason}`);
    } else {
      console.log(
        `[snapshot-cron] saved ${result.date} — mcap $${(result.totalMcap / 1e12).toFixed(2)}T · ` +
        `vol $${(result.totalVolume / 1e9).toFixed(1)}B · BTC.D ${result.btcDominance.toFixed(2)}% · ` +
        `F&G ${result.fgValue ?? "—"} · top10 ${result.top10.length}`,
      );
    }
  } catch (err) {
    console.warn("[snapshot-cron] tick failed:", (err as Error).message);
  }
}

export function startSnapshotCron(): () => void {
  // One-shot at boot so cold starts have data immediately.
  void tick();

  let timer: NodeJS.Timeout | null = null;
  const schedule = () => {
    const wait = msUntilNext0005Utc();
    timer = setTimeout(async () => {
      await tick();
      schedule();
    }, wait);
  };
  schedule();
  console.log(`[snapshot-cron] starting — next run in ${Math.round(msUntilNext0005Utc() / 60_000)} min`);

  return () => {
    if (timer) clearTimeout(timer);
  };
}
