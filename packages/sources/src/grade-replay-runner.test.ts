import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import {
  readScansFromJsonl,
  buildSyntheticFixture,
  runGradedBacktest,
  writeGradedBacktestReport,
  _clearKlineCache,
  fetchKlinesForScan,
  type ScanRecord,
} from "./grade-replay-runner.js";

// ── Synthetic kline server (replaces Binance for tests) ─────────────────────
//
// Default: every requested window returns 25 candles trending DOWN -0.5%/cdl.
// Tests can overwrite per-symbol / per-startMs to simulate up moves or empties.

interface SyntheticKlineConfig {
  pctPerCandle: number; // signed, %
  count: number;
}

let synthetic: SyntheticKlineConfig = { pctPerCandle: -0.5, count: 25 };
const originalFetch = globalThis.fetch;

function makeKlineRowsResponse(startMs: number, cfg: SyntheticKlineConfig): unknown[] {
  const out: unknown[] = [];
  let price = 100;
  let ts = startMs;
  for (let i = 0; i < cfg.count; i++) {
    out.push([ts, String(price), String(price * 1.01), String(price * 0.99), String(price), "1"]);
    price = price * (1 + cfg.pctPerCandle / 100);
    ts += 3_600_000;
  }
  return out;
}

beforeEach(() => {
  _clearKlineCache();
  synthetic = { pctPerCandle: -0.5, count: 25 };
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("api.binance.com") && url.includes("/klines")) {
      const m = url.match(/startTime=(\d+)/);
      const startMs = m ? parseInt(m[1], 10) : 0;
      const body = makeKlineRowsResponse(startMs, synthetic);
      return {
        ok: true,
        status: 200,
        json: async () => body,
      } as unknown as Response;
    }
    return { ok: false, status: 503, json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ── readScansFromJsonl ─────────────────────────────────────────────────────

describe("readScansFromJsonl", () => {
  it("parses each non-empty line as one ScanRecord", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "pulse-replay-"));
    const path = resolve(dir, "alerts.jsonl");
    const a: ScanRecord = {
      ts: "2026-04-01T00:00:00Z",
      scan_id: "a",
      symbol: "BTCUSDT",
      findings: [{ category: "etf", severity: "high", signal: "x", evidence: { btc7dSumUSD: -3e8 } }],
      marker: { btcPrice: 65000 },
    };
    const b: ScanRecord = {
      ts: "2026-04-01T01:00:00Z",
      scan_id: "b",
      symbol: "BTCUSDT",
      findings: [],
      marker: {},
    };
    await writeFile(path, JSON.stringify(a) + "\n\n" + JSON.stringify(b) + "\n", "utf8");

    const out = await readScansFromJsonl(path);
    expect(out).toHaveLength(2);
    expect(out[0].scan_id).toBe("a");
    expect(out[1].findings).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });

  it("returns empty array when file does not exist", async () => {
    const out = await readScansFromJsonl(resolve(tmpdir(), "definitely-not-here.jsonl"));
    expect(out).toEqual([]);
  });
});

// ── buildSyntheticFixture ──────────────────────────────────────────────────

describe("buildSyntheticFixture", () => {
  it("yields plausible findings spanning the requested window", () => {
    const now = 1_777_400_000_000;
    const out = buildSyntheticFixture(7, now);
    expect(out.length).toBeGreaterThan(0);
    // Every record has at least one finding, and timestamps are within range
    for (const rec of out) {
      expect(rec.findings.length).toBeGreaterThan(0);
      const ts = Date.parse(rec.ts);
      expect(ts).toBeLessThanOrEqual(now);
      expect(ts).toBeGreaterThanOrEqual(now - 7 * 24 * 3_600_000);
      expect(rec.scan_id).toMatch(/^synthetic-/);
    }
    // At least one ETF finding and one stablecoin finding for category coverage
    const cats = new Set(out.flatMap((r) => r.findings.map((f) => f.category)));
    expect(cats.has("etf")).toBe(true);
    expect(cats.has("stablecoin")).toBe(true);
  });
});

// ── fetchKlinesForScan caches per (symbol, startMs, windowH) ────────────────

describe("fetchKlinesForScan", () => {
  it("does not refetch the same window twice", async () => {
    const fromTs = 1_770_000_000_000;
    await fetchKlinesForScan("BTCUSDT", fromTs);
    await fetchKlinesForScan("BTCUSDT", fromTs);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("snaps fromTs to the hour boundary so adjacent calls hit the cache", async () => {
    // Hour-aligned timestamp so +30min stays within the same hour bucket
    const hourTop = Math.floor(1_770_000_000_000 / 3_600_000) * 3_600_000;
    await fetchKlinesForScan("BTCUSDT", hourTop);
    await fetchKlinesForScan("BTCUSDT", hourTop + 30 * 60_000); // +30min, same hour
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});

// ── runGradedBacktest end-to-end ───────────────────────────────────────────

describe("runGradedBacktest", () => {
  it("runs against a real JSONL and returns a populated aggregate report", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "pulse-replay-"));
    const logPath = resolve(dir, "alerts.jsonl");

    // Two scans, each older than the lookahead window so they're scored
    const oldTs = Date.now() - 48 * 3_600_000;
    const records: ScanRecord[] = [
      {
        ts: new Date(oldTs).toISOString(),
        scan_id: "scan-1",
        symbol: "BTCUSDT",
        findings: [
          { category: "etf", severity: "high", signal: "outflow", evidence: { btc7dSumUSD: -4e8 } },
          { category: "funding", severity: "med", signal: "hot", evidence: { avgPercent: 0.07 } },
        ],
        marker: { btcPrice: 76000 },
      },
      {
        ts: new Date(oldTs + 3_600_000).toISOString(),
        scan_id: "scan-2",
        symbol: "BTCUSDT",
        findings: [
          { category: "stablecoin", severity: "med", signal: "supply rising", evidence: { change7dPercent: 2.0 } },
        ],
        marker: { btcPrice: 76200 },
      },
    ];
    await writeFile(logPath, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

    const result = await runGradedBacktest({
      logPath,
      lookaheadHours: 6,
      thresholdPercent: 1,
      sinceMs: 0,                 // no lower bound
      allowSynthetic: false,
    });

    expect(result.meta.scansRead).toBe(2);
    expect(result.meta.scansUsed).toBe(2);
    expect(result.meta.findingsReplayed).toBe(3);
    expect(result.meta.syntheticFallback).toBe(false);

    // Synthetic klines trend down → etf/funding (expected down) hit, stablecoin (expected up) miss
    expect(result.report.totalReplayed).toBe(3);
    expect(result.report.byCategory.etf?.hits).toBe(1);
    expect(result.report.byCategory.funding?.hits).toBe(1);
    expect(result.report.byCategory.stablecoin?.hits).toBe(0);

    // Cross-source confirmation: etf saw funding in same scan → non-zero confirm input
    const etfResult = result.results.find((r) => r.finding.category === "etf")!;
    expect(etfResult.rubric.inputs.crossSourceConfirmation).toBeGreaterThan(0);

    await rm(dir, { recursive: true, force: true });
  });

  it("falls back to synthetic fixture when the log is empty", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "pulse-replay-"));
    const logPath = resolve(dir, "missing.jsonl");

    const result = await runGradedBacktest({
      logPath,
      lookaheadHours: 6,
      sinceMs: 0,
      allowSynthetic: true,
    });

    expect(result.meta.syntheticFallback).toBe(true);
    expect(result.meta.scansRead).toBeGreaterThan(0);
    expect(result.report.totalReplayed).toBeGreaterThan(0);

    await rm(dir, { recursive: true, force: true });
  });

  it("respects sinceMs and skips scans that pre-date the cutoff", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "pulse-replay-"));
    const logPath = resolve(dir, "alerts.jsonl");

    const oldTs = Date.now() - 60 * 24 * 3_600_000; // 60d ago
    const recentTs = Date.now() - 48 * 3_600_000;
    const records: ScanRecord[] = [
      { ts: new Date(oldTs).toISOString(),    scan_id: "old",    symbol: "BTCUSDT",
        findings: [{ category: "etf", severity: "high", signal: "x", evidence: { btc7dSumUSD: -4e8 } }],
        marker: {} },
      { ts: new Date(recentTs).toISOString(), scan_id: "recent", symbol: "BTCUSDT",
        findings: [{ category: "etf", severity: "high", signal: "x", evidence: { btc7dSumUSD: -4e8 } }],
        marker: {} },
    ];
    await writeFile(logPath, records.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");

    const result = await runGradedBacktest({
      logPath,
      lookaheadHours: 6,
      sinceMs: Date.now() - 30 * 24 * 3_600_000,
    });
    expect(result.meta.scansUsed).toBe(1);
    expect(result.results[0].scanId).toBe("recent");
    await rm(dir, { recursive: true, force: true });
  });
});

// ── writeGradedBacktestReport ──────────────────────────────────────────────

describe("writeGradedBacktestReport", () => {
  it("writes both latest snapshot + timestamped archive", async () => {
    const dir = await mkdtemp(resolve(tmpdir(), "pulse-replay-"));
    const fakeReport = {
      generatedAt: "2026-04-28T00:00:00Z",
      totalReplayed: 1,
      totalScored: 1,
      byCategory: {},
      bySeverity: {
        low: { count: 0, hits: 0, hitRate: 0, meanConfidence: 0, meanRealizedPct: 0 },
        med: { count: 0, hits: 0, hitRate: 0, meanConfidence: 0, meanRealizedPct: 0 },
        high: { count: 0, hits: 0, hitRate: 0, meanConfidence: 0, meanRealizedPct: 0 },
      },
      calibration: [],
      overall: { count: 1, hits: 1, hitRate: 1, meanConfidence: 0.6, meanRealizedPct: -2 },
    };
    const out = await writeGradedBacktestReport(fakeReport, dir);
    expect(out.latest).toMatch(/backtest-grade\.json$/);
    expect(out.archive).toMatch(/backtest-grade\.\d{4}-\d{2}-\d{2}T/);
    const txt = await readFile(out.latest, "utf8");
    expect(JSON.parse(txt).overall.hitRate).toBe(1);
    await rm(dir, { recursive: true, force: true });
  });
});
