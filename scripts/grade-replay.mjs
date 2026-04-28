#!/usr/bin/env node
/**
 * Phase 4 — graded backtest CLI.
 *
 * Runs `runGradedBacktest()` against the local alerts JSONL, prints a
 * scannable summary, and (optionally) writes the report to
 * apps/alerts/data/backtest-grade.json + a timestamped archive.
 *
 * Usage:
 *   node scripts/grade-replay.mjs                       # default: 24h lookahead, 1% threshold, 30d window
 *   node scripts/grade-replay.mjs --lookahead 6 --threshold 0.5
 *   node scripts/grade-replay.mjs --lookback 7 --no-synthetic
 *   node scripts/grade-replay.mjs --write                # persist report to disk
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const tsxLoader =
  "file://" +
  path.join(repoRoot, "apps/realtime/node_modules/tsx/dist/loader.mjs").replace(/\\/g, "/");

// Parse argv
const args = process.argv.slice(2);
function arg(name, fallback) {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  return v && !v.startsWith("--") ? v : true;
}
const lookahead = parseInt(arg("lookahead", "24"), 10);
const threshold = parseFloat(arg("threshold", "1"));
const lookback = parseInt(arg("lookback", "30"), 10);
const noSynthetic = args.includes("--no-synthetic");
const write = args.includes("--write");

// We can't import @pulse/sources/server directly from .mjs without tsx — so we
// shell out to a tiny inline node script with --import tsx. Paths are anchored
// to the repo root, not the spawn cwd (which is apps/realtime so node can
// resolve @pulse/sources via that package's node_modules).
const repoRootEsc = repoRoot.replace(/\\/g, "/");
const inline = `
import path from "node:path";
import { runGradedBacktest, writeGradedBacktestReport } from "@pulse/sources/server";

const REPO_ROOT = ${JSON.stringify(repoRootEsc)};
const sinceMs = Date.now() - ${lookback} * 24 * 3_600_000;
const { report, meta } = await runGradedBacktest({
  logPath: path.join(REPO_ROOT, "apps/alerts/data/alerts.jsonl"),
  lookaheadHours: ${lookahead},
  thresholdPercent: ${threshold},
  sinceMs,
  allowSynthetic: ${!noSynthetic},
});

console.log(JSON.stringify({ report, meta }, null, 2));

${write ? `
const out = await writeGradedBacktestReport(report, path.join(REPO_ROOT, "apps/alerts/data"));
process.stderr.write("\\nWrote: " + out.latest + "\\n");
process.stderr.write("Archive: " + out.archive + "\\n");
` : ""}
`.trim();

// Run from apps/realtime so node can resolve @pulse/sources via that
// package's node_modules — `node -e` doesn't anchor to repo root's package.json.
const child = spawn(
  process.execPath,
  ["--import", tsxLoader, "--input-type=module", "-e", inline],
  { cwd: path.join(repoRoot, "apps/realtime"), stdio: "inherit" },
);
child.on("exit", (code) => process.exit(code ?? 1));
