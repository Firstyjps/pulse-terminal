// Deterministic fallback brief — posts a Pulse morning/newyork brief to the
// KhunQuant Quant topic when the KhunQuant LLM cron path fails to run. Uses the
// KhunQuant bot (the only bot in the group) via the raw Bot API with
// message_thread_id, and composeBriefPayload (rules-only, no LLM). Run by
// brief-watchdog.sh. Pass --dry to compose without sending.
import { readFileSync } from "node:fs";
import { composeBriefPayload } from "./src/morning-brief/compose.ts";

const GROUP = "-1004477642068";
const THREAD = 92;
const HUB = process.env.PULSE_HUB_URL ?? "http://127.0.0.1:8081";
const DRY = process.argv.includes("--dry");
const HEADER = "🛟 สำรองอัตโนมัติ\n\n"; // MarkdownV2-safe (no special chars)

function readToken() {
  const yml = readFileSync(process.env.HOME + "/.khunquant/.security.yml", "utf8");
  const m = yml.match(/token:\s*([0-9]{9,10}:[A-Za-z0-9_-]{35})/);
  if (!m) throw new Error("khunquant telegram token not found in .security.yml");
  return m[1];
}

async function api(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function sendPhoto(token, png) {
  const form = new FormData();
  form.append("chat_id", GROUP);
  form.append("message_thread_id", String(THREAD));
  form.append("photo", new Blob([png], { type: "image/png" }), "chart.png");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendPhoto`, {
    method: "POST",
    body: form,
  });
  return res.json();
}

const payload = await composeBriefPayload({ now: Date.now(), hubBase: HUB });
if (payload.skipped) {
  console.log(`[fallback] SKIP reason=${payload.reason} mode=${payload.mode} — not sending`);
  process.exit(0);
}
console.log(
  `[fallback] composed mode=${payload.mode} text=${payload.text?.length}ch price=${!!payload.pricePng} etf=${!!payload.etfPng}`,
);
if (DRY) {
  console.log("[fallback] --dry: not sending");
  process.exit(0);
}

const token = readToken();
const msg = await api(token, "sendMessage", {
  chat_id: GROUP,
  message_thread_id: THREAD,
  text: HEADER + payload.text,
  parse_mode: "MarkdownV2",
  disable_web_page_preview: true,
});
console.log(`[fallback] sendMessage ok=${msg.ok}${msg.ok ? "" : " err=" + msg.description}`);
if (!msg.ok) process.exit(1);

if (payload.pricePng) {
  const r = await sendPhoto(token, payload.pricePng);
  console.log(`[fallback] price photo ok=${r.ok}${r.ok ? "" : " err=" + r.description}`);
}
if (payload.etfPng) {
  const r = await sendPhoto(token, payload.etfPng);
  console.log(`[fallback] etf photo ok=${r.ok}${r.ok ? "" : " err=" + r.description}`);
}
console.log("[fallback] done");
