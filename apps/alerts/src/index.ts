import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { scanAnomalies } from "@pulse/sources/server";
import { AlertStore, type ScanRecord } from "./storage.js";
import { Notifier } from "./notifier.js";
import { startDualAssetsTick } from "./dual-assets-tick.js";
import { startDualAssetsRollup } from "./dual-assets-rollup.js";

const INTERVAL_MS = Number(process.env.ALERT_INTERVAL_MS ?? 240_000);
const LOG_PATH = resolve(process.env.ALERT_LOG_PATH ?? "./data/alerts.jsonl");
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const MIN_SEVERITY = (process.env.ALERT_MIN_SEVERITY ?? "med") as "low" | "med" | "high";
const SYMBOL = process.env.ALERT_FUNDING_SYMBOL ?? "BTCUSDT";

const store = new AlertStore(LOG_PATH);
const notifier = new Notifier(WEBHOOK_URL, MIN_SEVERITY);

async function tick() {
  const start = Date.now();
  try {
    const scan = await scanAnomalies(SYMBOL);
    const rec: ScanRecord = {
      ts: new Date().toISOString(),
      scan_id: randomUUID(),
      symbol: SYMBOL,
      findings: scan.findings,
      marker: scan.marker,
    };
    rec.sent_webhook = await notifier.maybeNotify(rec);
    await store.append(rec);
    console.log(
      `[alerts] tick done in ${Date.now() - start}ms — ${scan.findings.length} finding(s) (notified: ${rec.sent_webhook})`,
    );
  } catch (err) {
    console.warn("[alerts] tick failed:", (err as Error).message);
  }
}

const channels = notifier.channelNames();
console.log(`[alerts] starting — interval ${INTERVAL_MS}ms, log ${LOG_PATH}, channels [${channels.length ? channels.join(", ") : "none"}], symbol ${SYMBOL}`);
void tick();
const timer = setInterval(tick, INTERVAL_MS);

// Phase 5A — Dual Assets cron (separate cadence; auto-disables if no Bybit keys)
const stopDualAssets = startDualAssetsTick();
const stopRollup = startDualAssetsRollup();

const shutdown = (sig: string) => {
  console.log(`[alerts] ${sig} — shutting down`);
  clearInterval(timer);
  stopDualAssets();
  stopRollup();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
