#!/usr/bin/env node
// Production-oriented smoke checks. Defaults to the live public web URL and the
// local hub URL used on Hetzner; override with PULSE_SMOKE_BASE_URL/HUB_URL.

const BASE_URL = (process.env.PULSE_SMOKE_BASE_URL ?? "https://cryptopulse.buzz").replace(/\/$/, "");
const HUB_URL = (process.env.PULSE_SMOKE_HUB_URL ?? "http://127.0.0.1:8081").replace(/\/$/, "");
const TIMEOUT_MS = Number(process.env.PULSE_SMOKE_TIMEOUT_MS ?? 10_000);
const STRICT_ALERTS = process.env.PULSE_SMOKE_STRICT_ALERTS !== "0";
const STRICT_PORTFOLIO = process.env.PULSE_SMOKE_STRICT_PORTFOLIO !== "0";

const checks = [
  {
    name: "web health",
    url: `${BASE_URL}/api/health`,
    validate: (body) => {
      if (body.status === "unhealthy") return "status is unhealthy";
      if (body.core?.status && body.core.status !== "healthy") return `core is ${body.core.status}`;
      return null;
    },
  },
  {
    name: "alerts recent",
    url: `${BASE_URL}/api/alerts/recent?limit=1`,
    validate: (body) => {
      if (STRICT_ALERTS && body.configured !== true) return "alerts log is not configured";
      if (STRICT_ALERTS && !Array.isArray(body.records)) return "records is not an array";
      return null;
    },
  },
  {
    name: "portfolio aggregate",
    url: `${BASE_URL}/api/portfolio/aggregate`,
    validate: (body) => {
      if (STRICT_PORTFOLIO && body.configured !== true) return body.message ?? "portfolio is not configured";
      if (body.configured === true && typeof body.totalUsd !== "number") return "missing totalUsd";
      return null;
    },
  },
  {
    name: "BTC depth",
    url: `${BASE_URL}/api/depth?symbol=BTCUSDT&limit=20`,
    validate: (body) => {
      if (!Array.isArray(body.bids) || !Array.isArray(body.asks)) return "missing bids/asks";
      if (body.bids.length === 0 || body.asks.length === 0) return "empty order book";
      return null;
    },
  },
  {
    name: "dual-assets summary",
    url: `${BASE_URL}/api/dual-assets/summary?coin_pair=SOL-USDT&days=30`,
    validate: (body) => {
      if (typeof body.count !== "number" || !Array.isArray(body.summaries)) return "invalid summary shape";
      return null;
    },
  },
  {
    name: "hub regime",
    url: `${HUB_URL}/regime`,
    validate: (body) => {
      if (!body.regime || typeof body.score !== "number") return "invalid regime shape";
      return null;
    },
  },
];

async function main() {
  console.log(`Pulse smoke · base=${BASE_URL} hub=${HUB_URL}`);
  const results = [];
  for (const check of checks) {
    const result = await runCheck(check);
    results.push(result);
    const mark = result.ok ? "OK" : "FAIL";
    console.log(`${mark.padEnd(4)} ${check.name.padEnd(24)} ${String(result.ms).padStart(5)}ms${result.error ? ` · ${result.error}` : ""}`);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`pulse-smoke failed: ${failed.length}/${results.length} check(s) failed`);
    process.exitCode = 1;
  }
}

async function runCheck(check) {
  const started = Date.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(check.url, { signal: ctrl.signal, cache: "no-store" });
    const text = await res.text();
    let body;
    try {
      body = text ? JSON.parse(text) : {};
    } catch {
      return { ok: false, ms: Date.now() - started, error: "non-JSON response" };
    }
    if (!res.ok) return { ok: false, ms: Date.now() - started, error: `HTTP ${res.status}` };
    const validationError = check.validate(body);
    return { ok: validationError == null, ms: Date.now() - started, error: validationError ?? undefined };
  } catch (err) {
    return { ok: false, ms: Date.now() - started, error: String(err.message ?? err).slice(0, 120) };
  } finally {
    clearTimeout(t);
  }
}

main().catch((err) => {
  console.error("pulse-smoke threw:", err);
  process.exitCode = 2;
});
