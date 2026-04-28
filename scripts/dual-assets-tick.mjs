#!/usr/bin/env node
// One-shot Bybit Dual Assets tick — useful for:
//   - Verifying BYBIT_API_KEY/SECRET work end-to-end
//   - Seeding a row before the 5-min cron has fired
//   - Manual rollup after backfilling rows externally
//
// Usage:
//   node scripts/dual-assets-tick.mjs              # tick once
//   node scripts/dual-assets-tick.mjs --rollup     # tick then roll up yesterday + today
//   node scripts/dual-assets-tick.mjs --rollup-only YYYY-MM-DD  # just roll up that date
//
// Reads BYBIT_API_KEY/SECRET + DUAL_ASSETS_DB_PATH from process env (or .env.local via the app's loader).
// On the server: `cd ~/pulse-terminal && node --import tsx scripts/dual-assets-tick.mjs`

import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");

// Sanity: must run from a workspace root where pnpm-workspace.yaml exists.
if (!existsSync(resolve(repoRoot, "pnpm-workspace.yaml"))) {
  console.error("[tick] cannot find pnpm-workspace.yaml — run from repo root");
  process.exit(1);
}

if (!process.env.BYBIT_API_KEY || !process.env.BYBIT_API_SECRET) {
  console.error("[tick] BYBIT_API_KEY / BYBIT_API_SECRET missing — set them in env or .env.local first");
  process.exit(1);
}

const argv = process.argv.slice(2);
const wantsRollup = argv.includes("--rollup");
const rollupOnlyIdx = argv.indexOf("--rollup-only");
const rollupOnlyDate = rollupOnlyIdx >= 0 ? argv[rollupOnlyIdx + 1] : null;

// Dynamic import of the workspace package — works because node has tsx loader attached.
const { runDualAssetTick, updateDailySummary } = await import(
  resolve(repoRoot, "packages/sources/src/server.ts")
);

if (rollupOnlyDate) {
  console.log(`[tick] rollup only — date=${rollupOnlyDate}`);
  updateDailySummary(rollupOnlyDate, process.env.DUAL_ASSETS_PAIRS?.split(",")[0] ?? "SOL-USDT");
  console.log("[tick] rollup done");
  process.exit(0);
}

const start = Date.now();
const result = await runDualAssetTick({
  aprAlertThreshold: Number(process.env.DUAL_ASSETS_APR_ALERT ?? 100),
});
console.log(
  `[tick] done in ${Date.now() - start}ms — saved=${result.saved} skipped=${result.skipped} hot=${result.hot.length}`,
);
if (result.hot.length) {
  console.log("[tick] HOT entries:");
  for (const h of result.hot) {
    console.log(`  🔥 ${h.coin_pair} ${h.direction} target $${h.target_price} → APR ${h.apr_pct}% (${h.duration})`);
  }
}

if (wantsRollup) {
  const today = new Date().toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const pair = process.env.DUAL_ASSETS_PAIRS?.split(",")[0] ?? "SOL-USDT";
  console.log(`[tick] rolling up ${yesterday} + ${today} for ${pair}`);
  updateDailySummary(yesterday, pair);
  updateDailySummary(today, pair);
  console.log("[tick] rollup done");
}
