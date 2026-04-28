// Dual Assets cron tick — runs every DUAL_ASSETS_INTERVAL_MS (default 5 min).
// Fetches Bybit Dual Assets + SOL IV → persists to SQLite → fires webhook on hot APR.

import { runDualAssetTick } from "@pulse/sources/server";
import type { DualAssetSnapshot } from "@pulse/sources";

const TICK_MS = Number(process.env.DUAL_ASSETS_INTERVAL_MS ?? 300_000); // 5 min default
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const HOT_THRESHOLD = Number(process.env.DUAL_ASSETS_APR_ALERT ?? 100);

async function notifyHot(hot: DualAssetSnapshot[]) {
  if (!WEBHOOK_URL || !hot.length) return;
  const lines = hot.map((s) =>
    `🔥 ${s.coin_pair} ${s.direction} target $${s.target_price} → APR ${s.apr_pct}% (${s.duration})`,
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
    const result = await runDualAssetTick({ aprAlertThreshold: HOT_THRESHOLD });
    console.log(
      `[dual-assets] tick done in ${Date.now() - start}ms — saved=${result.saved} skipped=${result.skipped} hot=${result.hot.length}`,
    );
    if (result.hot.length) await notifyHot(result.hot);
  } catch (err) {
    console.warn("[dual-assets] tick failed:", (err as Error).message);
  }
}

export function startDualAssetsTick(): () => void {
  const hasKeys = process.env.BYBIT_API_KEY && process.env.BYBIT_API_SECRET;
  if (!hasKeys) {
    console.log("[dual-assets] BYBIT_API_KEY/SECRET missing — tick disabled");
    return () => {};
  }
  console.log(`[dual-assets] starting — interval ${TICK_MS}ms, hot threshold ${HOT_THRESHOLD}%`);
  void tick();
  const id = setInterval(tick, TICK_MS);
  return () => clearInterval(id);
}
