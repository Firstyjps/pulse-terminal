#!/usr/bin/env node
// `pnpm pulse:status` — combines pm2 process list + body-level health checks
// into a pretty terminal report. Exit 0 if all healthy, 1 otherwise.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileP = promisify(execFile);
const TIMEOUT_MS = 2_000;

const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";
const DIM = "\x1b[2m";
const GREEN = "\x1b[32m";
const YELLOW = "\x1b[33m";
const RED = "\x1b[31m";
const CYAN = "\x1b[36m";

const ENDPOINTS = [
  { name: "web /api/health", url: "http://127.0.0.1:3000/api/health" },
  { name: "realtime /health", url: "http://127.0.0.1:8081/health" },
];

async function getPm2List() {
  // On Windows, npm-installed CLIs are `.cmd` shims that node can't spawn directly.
  // Wrap via cmd.exe so the shim is interpreted.
  const isWin = process.platform === "win32";
  try {
    const { stdout } = isWin
      ? await execFileP("cmd.exe", ["/d", "/s", "/c", "pm2 jlist"])
      : await execFileP("pm2", ["jlist"]);
    return JSON.parse(stdout);
  } catch (err) {
    return { _error: err.message };
  }
}

async function probe(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const start = Date.now();
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) return { ok: false, status: res.status, ms: Date.now() - start };
    const body = await res.json();
    return { ok: true, status: res.status, ms: Date.now() - start, body };
  } catch (err) {
    return { ok: false, ms: Date.now() - start, err: String(err.message ?? err).slice(0, 80) };
  } finally {
    clearTimeout(t);
  }
}

function badge(ok, label) {
  return `${ok ? GREEN + "✓" : RED + "✗"} ${label}${RESET}`;
}

async function main() {
  console.log(`\n${BOLD}${CYAN}Pulse Terminal · status${RESET} ${DIM}${new Date().toISOString()}${RESET}\n`);

  // pm2 processes
  const pm2 = await getPm2List();
  if (Array.isArray(pm2)) {
    if (pm2.length === 0) {
      console.log(`${DIM}pm2: no processes registered${RESET}`);
    } else {
      console.log(`${BOLD}pm2 processes${RESET}`);
      for (const proc of pm2) {
        const status = proc.pm2_env?.status ?? "unknown";
        const ok = status === "online";
        const mem = (proc.monit?.memory ?? 0) / 1024 / 1024;
        const cpu = proc.monit?.cpu ?? 0;
        const restarts = proc.pm2_env?.restart_time ?? 0;
        const uptimeMs = proc.pm2_env?.pm_uptime ? Date.now() - proc.pm2_env.pm_uptime : 0;
        const uptimeMin = Math.round(uptimeMs / 60_000);
        console.log(
          `  ${badge(ok, proc.name)} ${DIM}status=${status} mem=${mem.toFixed(0)}MB cpu=${cpu}% restarts=${restarts} up=${uptimeMin}min${RESET}`,
        );
      }
    }
  } else {
    console.log(`${YELLOW}pm2 unavailable: ${pm2._error}${RESET}`);
  }

  console.log();

  // Body-level health probes
  console.log(`${BOLD}health probes${RESET}`);
  let allHealthy = true;
  for (const ep of ENDPOINTS) {
    const r = await probe(ep.url);
    if (!r.ok) {
      allHealthy = false;
      console.log(
        `  ${badge(false, ep.name)} ${DIM}${r.status ?? "—"} (${r.ms}ms)${r.err ? ` ${r.err}` : ""}${RESET}`,
      );
      continue;
    }
    const status = r.body?.status ?? "ok";
    const tone = status === "healthy" ? GREEN : status === "degraded" ? YELLOW : RED;
    if (status !== "healthy") allHealthy = false;
    console.log(
      `  ${badge(true, ep.name)} ${tone}${status}${RESET} ${DIM}(${r.ms}ms)${RESET}`,
    );
    // Per-check breakdown
    if (r.body?.checks) {
      for (const [name, check] of Object.entries(r.body.checks)) {
        const c = check;
        const mark = c.ok ? GREEN + "·" : RED + "·";
        console.log(`      ${mark} ${name} ${DIM}${c.ms}ms${c.err ? ` ${c.err}` : ""}${RESET}`);
      }
    }
    if (r.body?.snapshotAgeSec != null) {
      console.log(`      ${DIM}snapshotAge=${r.body.snapshotAgeSec}s · funding=${r.body.fundingChannelsFresh ?? "?"} channels · oi=${r.body.oiChannels ?? "?"} channels${RESET}`);
    }
  }

  console.log();
  process.exit(allHealthy ? 0 : 1);
}

main().catch((err) => {
  console.error("status failed:", err);
  process.exit(2);
});
