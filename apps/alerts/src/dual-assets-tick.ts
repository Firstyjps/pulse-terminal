// Dual Assets cron tick — runs every DUAL_ASSETS_INTERVAL_MS (default 5 min).
// Fetches Bybit Dual Assets + SOL IV → persists to SQLite → fires webhook on hot APR.

import {
  hasRecentAlert,
  loadDualAssetsConfig,
  recordAlert,
  runDualAssetTick,
} from "@pulse/sources/server";
import type { DualAssetSnapshot } from "@pulse/sources";

const CONFIG = loadDualAssetsConfig();
const TICK_MS = CONFIG.intervalMs;
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const HOT_THRESHOLD = CONFIG.aprAlertPct;
const ALERT_COOLDOWN_MS = Number(process.env.DUAL_ASSETS_ALERT_COOLDOWN_MS ?? 6 * 60 * 60 * 1000);

async function notifyHot(hot: DualAssetSnapshot[]) {
  if (!WEBHOOK_URL || !hot.length) return;
  const lines = hot.map((s) =>
    `🔥 ${s.coin_pair} ${labelDirection(s.direction)} target $${s.target_price} → APR ${s.apr_pct.toFixed(2)}% (${labelDuration(s.duration)})`,
  );
  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**Bybit Dual Assets HOT APR**\n${lines.join("\n")}`,
        text:    `Bybit Dual Assets HOT APR\n${lines.join("\n")}`,
        username: "Pulse Terminal · Dual Assets",
      }),
    });
  } catch (err) {
    console.warn("[dual-assets] webhook failed:", (err as Error).message);
  }
}

async function tick() {
  const start = Date.now();
  try {
    const result = await runDualAssetTick(CONFIG);
    const hot = result.hot.filter((row) => !hasRecentAlert(row, ALERT_COOLDOWN_MS));
    console.log(
      `[dual-assets] tick done in ${Date.now() - start}ms — raw=${result.rawRows} saved=${result.saved} dbSkipped=${result.dbSkipped} trackSkipped=${result.trackSkipped} hot=${result.hot.length} notify=${hot.length}`,
    );
    if (hot.length) {
      await notifyHot(hot);
      for (const row of hot) recordAlert(row, HOT_THRESHOLD);
    }
  } catch (err) {
    console.warn("[dual-assets] tick failed:", (err as Error).message);
  }
}

export function startDualAssetsTick(): () => void {
  if (!CONFIG.schedulerEnabled) {
    console.log("[dual-assets] scheduler disabled by DUAL_ASSETS_SCHEDULER=0");
    return () => {};
  }
  console.log(
    `[dual-assets] starting — interval ${TICK_MS}ms, track >=${CONFIG.minTrackAprPct}%, hot >=${HOT_THRESHOLD}%, durations=${CONFIG.durations.join(",")}`,
  );
  void tick();
  const id = setInterval(tick, TICK_MS);
  return () => clearInterval(id);
}

function labelDuration(duration: string): string {
  return duration.toLowerCase() === "8h" ? "8 Hours" : "1 Day";
}

function labelDirection(direction: string): string {
  return direction === "BuyLow" ? "Buy Low" : "Sell High";
}
