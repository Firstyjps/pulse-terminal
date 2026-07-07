import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { scanAnomalies } from "@pulse/sources/server";
import { AlertStore, type ScanRecord } from "./storage.js";
import { Notifier } from "./notifier.js";
import { startDualAssetsTick } from "./dual-assets-tick.js";
import { startDualAssetsRollup } from "./dual-assets-rollup.js";
import { startSnapshotCron } from "./snapshot-cron.js";
import { startPortfolioSnapshotCron } from "./portfolio-snapshot/index.js";
import {
  claimDueBriefSlot,
  parseBkkSchedules,
  type BkkSchedule,
  type BriefScheduleState,
} from "./brief-schedule.js";
import { runMorningBrief } from "./morning-brief/index.js";
import { runNewyorkBrief } from "./morning-brief/newyork.js";

const INTERVAL_MS = Number(process.env.ALERT_INTERVAL_MS ?? 240_000);
const LOG_PATH = resolveAlertsLogPath(process.env.ALERT_LOG_PATH);
const WEBHOOK_URL = process.env.ALERT_WEBHOOK_URL;
const MIN_SEVERITY = (process.env.ALERT_MIN_SEVERITY ?? "med") as "low" | "med" | "high";
const SYMBOL = process.env.ALERT_FUNDING_SYMBOL ?? "BTCUSDT";

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function resolveAlertsLogPath(raw?: string): string {
  const repoRoot = findRepoRoot(process.cwd());
  if (!raw) return resolve(process.cwd(), "data/alerts.jsonl");
  if (isAbsolute(raw)) return raw;

  const normalized = raw.replace(/\\/g, "/").replace(/^\.\//, "");
  if (normalized.startsWith("apps/alerts/")) return resolve(repoRoot, normalized);

  return resolve(process.cwd(), raw);
}

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
// Telegram Briefs — Morning + Newyork profiles on configured BKK schedules.
// Morning weekend mode drops ETF sections — see morning-brief/README.md#weekend-mode.
// Per .coordinator/telegram-morning-brief.md. Opt-in: skips entirely when
// TELEGRAM_BOT_TOKEN is unset so unconfigured installs stay silent.
// ─────────────────────────────────────────────────────────────────

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT_RAW = process.env.TELEGRAM_CHAT_ID;
const TG_CHAT_IDS = TG_CHAT_RAW
  ? TG_CHAT_RAW.split(",").map((s) => s.trim()).filter(Boolean)
  : [];
const HUB_BASE = process.env.PULSE_HUB_URL ?? "http://127.0.0.1:8081";
const DASHBOARD_URL = process.env.PULSE_DASHBOARD_URL ?? "http://localhost:3000/morning";
const BRIEF_SCHEDULES = parseBkkSchedules({
  times: process.env.MORNING_BRIEF_TIMES_BKK,
  legacyHour: process.env.MORNING_BRIEF_HOUR_BKK,
  legacyMinute: process.env.MORNING_BRIEF_MINUTE_BKK,
});

function formatBkkTime(hour: number, minute: number): string {
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")} BKK`;
}

function formatBkkSchedules(schedules: BkkSchedule[]): string {
  return schedules
    .map((s) => `${s.key} (${formatBkkTime(s.hour, s.minute)})`)
    .join(", ");
}

// hiyuki retired 2026-07-07 — KhunQuant is the market-brief face now.
// Collectors above keep running; only the Telegram brief send is gated off.
// Set HIYUKI_BRIEF_ENABLED=1 to re-enable the legacy hiyuki brief.
const BRIEF_ENABLED = process.env.HIYUKI_BRIEF_ENABLED === "1";
let stopMorningBrief: () => void = () => {};
if (BRIEF_ENABLED && TG_TOKEN && TG_CHAT_IDS.length > 0) {
  const scheduleState: BriefScheduleState = { dateBkk: null, firedSlotKeys: new Set() };
  const tick = async () => {
    const now = Date.now();
    const due = claimDueBriefSlot(now, BRIEF_SCHEDULES, scheduleState);
    if (!due) return;
    const dateStr = scheduleState.dateBkk ?? new Date(now + 7 * 60 * 60_000).toISOString().slice(0, 10);
    try {
      const runOpts = {
        now,
        hubBase: HUB_BASE,
        telegramToken: TG_TOKEN,
        chatIds: TG_CHAT_IDS,
        dashboardUrl: DASHBOARD_URL,
      };
      const r =
        due.profile === "newyork"
          ? await runNewyorkBrief(runOpts)
          : await runMorningBrief(runOpts);
      if (r.sent) {
        const tag = r.recipients
          ? `recipients:${r.recipients.filter((x) => x.sent).length}/${r.recipients.length}`
          : due.profile === "newyork"
            ? "text:ok"
            : `image:${r.imageSent ? "ok" : `skip(${r.imageError ?? "?"})`}`;
        console.log(`[alerts] ${due.profile} brief sent (${dateStr} ${due.key}) — ${tag}`);
      } else {
        const partial = r.recipients?.some((x) => x.sent)
          ? ` (partial: ${r.recipients.filter((x) => x.sent).length}/${r.recipients.length})`
          : "";
        console.log(
          `[alerts] ${due.profile} brief skipped (${dateStr} ${due.key}) — ${r.reason ?? "?"}${r.error ? `: ${r.error}` : ""}${partial}`,
        );
      }
    } catch (err) {
      console.warn(`[alerts] ${due.profile} brief threw:`, (err as Error).message);
    }
  };
  const timer = setInterval(tick, 60_000);
  void tick(); // probe immediately so a target-hour late start still fires today
  stopMorningBrief = () => clearInterval(timer);
  console.log(
    `[alerts] telegram briefs armed — ${formatBkkSchedules(BRIEF_SCHEDULES)} daily, hub ${HUB_BASE}, dashboard ${DASHBOARD_URL}, recipients ${TG_CHAT_IDS.length}`,
  );
} else {
  console.log("[alerts] telegram briefs disabled — set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID to enable");
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
