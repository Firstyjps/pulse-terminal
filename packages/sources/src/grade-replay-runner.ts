// Phase 4b — server-side runner for the graded backtest engine.
//
// Read the alerts JSONL, fetch Binance klines for each scan's lookahead
// window, hand it all to the pure `replayFindings` engine, and write the
// aggregate report to disk. Server-only: uses node:fs/promises and direct
// HTTPS fetches. Browser callers should never import this file.
//
// The Binance kline fetch is cached in-memory per (symbol, hour-bucket) so a
// scan-heavy log doesn't fan out to thousands of duplicate requests. We use
// 1h candles by default; the lookahead window is expressed in hours.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchJson } from "./_helpers.js";
import type { AnomalyFinding } from "./anomalies.js";
import {
  replayFindings,
  aggregateReport,
  priorHitRateFromReport,
  type OhlcvRow,
  type ReplayInput,
  type AggregateReport,
  type ReplayResult,
} from "./grade-replay.js";

// ── ScanRecord (matches apps/alerts/src/storage.ts) ─────────────────────────

export interface ScanRecord {
  ts: string;            // ISO 8601
  scan_id: string;
  symbol: string;
  findings: Array<{
    category: string;
    severity: "low" | "med" | "high";
    signal: string;
    evidence: Record<string, unknown>;
  }>;
  marker: { btcPrice?: number; ethPrice?: number };
  sent_webhook?: boolean;
}

// ── JSONL read ──────────────────────────────────────────────────────────────

export async function readScansFromJsonl(path: string): Promise<ScanRecord[]> {
  try {
    const txt = await readFile(path, "utf8");
    return txt
      .split("\n")
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as ScanRecord);
  } catch {
    return [];
  }
}

// ── Binance klines (1h interval, with in-memory cache) ──────────────────────

type Kline = [number, string, string, string, string, string, ...unknown[]];

const klineCache = new Map<string, OhlcvRow[]>();

/**
 * Fetch a window of 1h candles from Binance covering [fromTs, fromTs + windowH).
 * Cached per (symbol, hour-bucket-of-fromTs) so a busy JSONL replay doesn't
 * pound the API. windowH defaults to 24 (= covers a 24h lookahead).
 */
export async function fetchKlinesForScan(
  symbol: string,
  fromTs: number,
  windowH = 24,
): Promise<OhlcvRow[]> {
  // Snap to hour boundary so cache hits are dense
  const startMs = Math.floor(fromTs / 3_600_000) * 3_600_000;
  const cacheKey = `${symbol}:${startMs}:${windowH}`;
  const cached = klineCache.get(cacheKey);
  if (cached) return cached;

  // Limit clamps at 1000; we ask for windowH + 2 to have a buffer past the end.
  const limit = Math.min(1000, windowH + 2);
  const endMs = startMs + windowH * 3_600_000;
  const url =
    `https://api.binance.com/api/v3/klines?symbol=${symbol}` +
    `&interval=1h&startTime=${startMs}&endTime=${endMs}&limit=${limit}`;

  let raw: Kline[] = [];
  try {
    raw = await fetchJson<Kline[]>(url, { revalidate: 600 });
  } catch {
    raw = [];
  }
  const rows: OhlcvRow[] = raw.map((k) => ({
    ts: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
  }));
  klineCache.set(cacheKey, rows);
  return rows;
}

// ── Synthetic fixture (used when alerts log is missing/empty) ──────────────

/**
 * Fabricate a small set of plausible scans across the last `daysBack` days at
 * 6h intervals. Not for real analysis — just enough rows that the engine has
 * something to chew on if the user runs a graded backtest on a fresh install
 * before the alerts cron has accumulated history. Synthetic scans are tagged
 * with `scan_id: synthetic-…` so callers can filter them out later.
 */
export function buildSyntheticFixture(daysBack = 7, now = Date.now()): ScanRecord[] {
  const out: ScanRecord[] = [];
  const stepMs = 6 * 3_600_000;
  const cycles = Math.floor((daysBack * 24 * 3_600_000) / stepMs);

  for (let i = 0; i < cycles; i++) {
    const ts = new Date(now - (cycles - i) * stepMs).toISOString();
    // Vary the finding mix so per-category buckets get hits
    const phase = i % 4;
    const findings: ScanRecord["findings"] = [];
    if (phase === 0) {
      findings.push(
        { category: "etf", severity: "med", signal: "BTC ETF mild outflow", evidence: { btc7dSumUSD: -1.2e8 } },
        { category: "funding", severity: "low", signal: "funding mildly hot", evidence: { avgPercent: 0.04 } },
      );
    } else if (phase === 1) {
      findings.push(
        { category: "stablecoin", severity: "med", signal: "stablecoin supply rising", evidence: { change7dPercent: 1.8 } },
      );
    } else if (phase === 2) {
      findings.push(
        { category: "etf", severity: "high", signal: "BTC ETF heavy 7d outflow", evidence: { btc7dSumUSD: -4.5e8 } },
        { category: "futures", severity: "high", signal: "ETF outflow + hot funding", evidence: { fundingRate: 0.06 } },
      );
    }
    if (findings.length === 0) continue;
    out.push({
      ts,
      scan_id: `synthetic-${i}`,
      symbol: "BTCUSDT",
      findings,
      marker: { btcPrice: 76000 + Math.sin(i) * 1500, ethPrice: 2300 },
    });
  }
  return out;
}

// ── Orchestrator ────────────────────────────────────────────────────────────

export interface GradedBacktestOpts {
  /** Path to the alerts JSONL. Defaults to apps/alerts/data/alerts.jsonl. */
  logPath?: string;
  /** Lookahead window in hours (used for both kline fetch and outcome scoring). Default 24. */
  lookaheadHours?: number;
  /** % move that counts as a directional hit. Default 1.0 (1%). */
  thresholdPercent?: number;
  /**
   * Earliest scan timestamp (ms) to include. Older scans are skipped.
   * Default: 30 days ago.
   */
  sinceMs?: number;
  /** Drop scans whose lookahead window hasn't fully elapsed yet (default true). */
  requireElapsed?: boolean;
  /** If alerts JSONL is empty/missing, fall back to a synthetic fixture (default true). */
  allowSynthetic?: boolean;
  /** Optional prior report — feeds historicalHitRate into applyRubric. */
  priorReport?: AggregateReport;
}

export interface GradedBacktestResult {
  report: AggregateReport;
  results: ReplayResult[];
  meta: {
    logPath: string;
    scansRead: number;
    scansUsed: number;
    findingsReplayed: number;
    syntheticFallback: boolean;
    lookaheadHours: number;
    thresholdPercent: number;
    sinceMs: number;
  };
}

const DEFAULT_LOG_PATH = "apps/alerts/data/alerts.jsonl";

/**
 * End-to-end graded backtest. Reads the alerts log, fetches binance klines for
 * each scan's lookahead window, runs the deterministic rubric + outcome
 * scorer, and returns the aggregated calibration report.
 *
 * If the log doesn't exist yet (fresh install), a small synthetic fixture is
 * substituted so the harness still produces a non-empty report — useful for
 * smoke tests and UI dev. The `meta.syntheticFallback` flag in the response
 * tells callers when this happened.
 */
export async function runGradedBacktest(
  opts: GradedBacktestOpts = {},
): Promise<GradedBacktestResult> {
  const {
    logPath = resolve(process.cwd(), DEFAULT_LOG_PATH),
    lookaheadHours = 24,
    thresholdPercent = 1.0,
    sinceMs = Date.now() - 30 * 24 * 3_600_000,
    requireElapsed = true,
    allowSynthetic = true,
    priorReport,
  } = opts;

  let scans = await readScansFromJsonl(logPath);
  let syntheticFallback = false;
  if (scans.length === 0 && allowSynthetic) {
    scans = buildSyntheticFixture();
    syntheticFallback = true;
  }
  const scansRead = scans.length;

  const cutoffElapsedMs = Date.now() - lookaheadHours * 3_600_000;
  const useable = scans.filter((s) => {
    const t = Date.parse(s.ts);
    if (!Number.isFinite(t)) return false;
    if (t < sinceMs) return false;
    if (requireElapsed && t > cutoffElapsedMs) return false;
    return true;
  });

  // Flatten into ReplayInput[] grouped by scan
  const inputs: ReplayInput[] = useable.flatMap((s) =>
    s.findings.map((f) => ({
      finding: f as AnomalyFinding,
      scanTs: Date.parse(s.ts),
      scanId: s.scan_id,
      symbol: s.symbol,
    })),
  );

  const priorHitRate = priorReport ? priorHitRateFromReport(priorReport) : undefined;

  const results = await replayFindings(
    inputs,
    (symbol, fromTs) => fetchKlinesForScan(symbol, fromTs, lookaheadHours),
    {
      thresholdPercent,
      maxCandles: lookaheadHours, // 1h candles → exactly lookaheadHours candles
      priorHitRate,
    },
  );

  const report = aggregateReport(results);

  return {
    report,
    results,
    meta: {
      logPath,
      scansRead,
      scansUsed: useable.length,
      findingsReplayed: inputs.length,
      syntheticFallback,
      lookaheadHours,
      thresholdPercent,
      sinceMs,
    },
  };
}

// ── Persist report ──────────────────────────────────────────────────────────

/**
 * Write the aggregate report to `apps/alerts/data/backtest-grade.json` (latest
 * snapshot) plus a timestamped copy in the same dir for trend tracking.
 * Returns the paths written.
 */
export async function writeGradedBacktestReport(
  report: AggregateReport,
  dataDir = resolve(process.cwd(), "apps/alerts/data"),
): Promise<{ latest: string; archive: string }> {
  await mkdir(dataDir, { recursive: true });
  const latest = resolve(dataDir, "backtest-grade.json");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const archive = resolve(dataDir, `backtest-grade.${stamp}.json`);
  const body = JSON.stringify(report, null, 2);
  await writeFile(latest, body, "utf8");
  await writeFile(archive, body, "utf8");
  return { latest, archive };
}

// Re-export so callers import everything from one place if desired.
export { aggregateReport, replayFindings } from "./grade-replay.js";
export type { OhlcvRow, ReplayResult, AggregateReport } from "./grade-replay.js";

// Internal: clear the kline cache (test hook).
export function _clearKlineCache(): void {
  klineCache.clear();
}
