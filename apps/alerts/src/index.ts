import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { scanAnomalies } from "@pulse/sources/server";
import { AlertStore, type ScanRecord } from "./storage.js";
import { Notifier } from "./notifier.js";
import { startDualAssetsTick } from "./dual-assets-tick.js";
import { startDualAssetsRollup } from "./dual-assets-rollup.js";
import { startSnapshotCron } from "./snapshot-cron.js";
import { startPortfolioSnapshotCron } from "./portfolio-snapshot/index.js";
import { runMorningBrief } from "./morning-brief/index.js";

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

// Phase 6 — Daily market snapshot cron (00:05 UTC, 90-day rolling history)
const stopSnapshotCron = startSnapshotCron();

// Daily portfolio snapshot cron (23:59 BKK) — unlocks 24h/7d/30d PnL on Morning dashboard
const stopPortfolioSnapshotCron = startPortfolioSnapshotCron();

// ─────────────────────────────────────────────────────────────────
// Morning Brief — Telegram push at 09:00 BKK Mon-Fri
// Per .coordinator/telegram-morning-brief.md. Opt-in: skips entirely when
// TELEGRAM_BOT_TOKEN is unset so unconfigured installs stay silent.
// ─────────────────────────────────────────────────────────────────

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_CHAT_ID;
const HUB_BASE = process.env.PULSE_HUB_URL ?? "http://127.0.0.1:8081";
const DASHBOARD_URL = process.env.PULSE_DASHBOARD_URL ?? "http://localhost:3000/morning";

let stopMorningBrief: () => void = () => {};
if (TG_TOKEN && TG_CHAT) {
  let lastFiredDate: string | null = null;
  const tick = async () => {
    const bkkNow = new Date(Date.now() + 7 * 60 * 60_000);
    const dateStr = bkkNow.toISOString().slice(0, 10);
    const hour = bkkNow.getUTCHours();
    if (hour !== 9 || lastFiredDate === dateStr) return;
    lastFiredDate = dateStr;
    try {
      const r = await runMorningBrief({
        now: Date.now(),
        hubBase: HUB_BASE,
        telegramToken: TG_TOKEN,
        chatId: TG_CHAT,
        dashboardUrl: DASHBOARD_URL,
      });
      if (r.sent) {
        console.log(
          `[alerts] morning brief sent (${dateStr}) — image:${r.imageSent ? "ok" : `skip(${r.imageError ?? "?"})`}`,
        );
      } else {
        console.log(`[alerts] morning brief skipped (${dateStr}) — ${r.reason ?? "?"}${r.error ? `: ${r.error}` : ""}`);
      }
    } catch (err) {
      console.warn(`[alerts] morning brief threw:`, (err as Error).message);
    }
  };
  const timer = setInterval(tick, 60_000);
  void tick(); // probe immediately so a 09:00-late start still fires today
  stopMorningBrief = () => clearInterval(timer);
  console.log(
    `[alerts] morning brief armed — 09:00 BKK Mon-Fri, hub ${HUB_BASE}, dashboard ${DASHBOARD_URL}`,
  );
} else {
  console.log("[alerts] morning brief disabled — set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to enable");
}

const shutdown = (sig: string) => {
  console.log(`[alerts] ${sig} — shutting down`);
  clearInterval(timer);
  stopDualAssets();
  stopRollup();
  stopSnapshotCron();
  stopPortfolioSnapshotCron();
  stopMorningBrief();
  process.exit(0);
};
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
