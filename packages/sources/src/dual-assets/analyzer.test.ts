import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DualAssetSnapshot } from "./types.js";

const TMP_DIR = mkdtempSync(join(tmpdir(), "dual-assets-analyzer-test-"));
const TMP_DB = join(TMP_DIR, "test.sqlite");
process.env.DUAL_ASSETS_DB_PATH = TMP_DB;

const { saveSnapshot, updateDailySummary, closeDb } = await import("./store.js");
const { generateHourlyReport } = await import("./analyzer.js");

function truncate() {
  closeDb();
  try {
    const raw = new Database(TMP_DB);
    raw.exec(`DELETE FROM apr_snapshots; DELETE FROM daily_summary;`);
    raw.close();
  } catch {
    /* fresh */
  }
}

async function rmTempDirWithRetry(dir: string) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      rmSync(dir, { recursive: true, force: true });
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 50 * (attempt + 1)));
    }
  }

  console.warn("[dual-assets analyzer test] temp cleanup skipped:", (lastError as Error)?.message ?? String(lastError));
}

const snap = (overrides: Partial<DualAssetSnapshot>): DualAssetSnapshot => ({
  timestamp_utc: "2026-04-28T05:00:00.000Z",
  timestamp_ict: "2026-04-28T12:00:00.000+07:00",
  hour_ict: 12,
  product_id: "prod-1",
  coin_pair: "SOL-USDT",
  direction: "BuyLow",
  target_price: 78,
  apr_pct: 100,
  duration: "1d",
  settlement_utc: null,
  index_price: 80,
  is_vip_only: 0,
  sol_iv_pct: 60,
  ...overrides,
});

afterAll(async () => {
  closeDb();
  await rmTempDirWithRetry(TMP_DIR);
});

describe("generateHourlyReport", () => {
  beforeEach(() => {
    truncate();
  });

  it("returns error when no data is available", () => {
    const report = generateHourlyReport({ coinPair: "SOL-USDT", targetPrice: 78, days: 7 });
    expect(report).toEqual({ error: expect.stringMatching(/no data/i) });
  });

  it("returns recommendation when data exists", () => {
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T08:00:00.000+07:00", hour_ict: 8, apr_pct: 50 }));
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T12:00:00.000+07:00", hour_ict: 12, apr_pct: 200 }));
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T20:00:00.000+07:00", hour_ict: 20, apr_pct: 150 }));
    const report = generateHourlyReport({ coinPair: "SOL-USDT", targetPrice: 78, days: 365 });
    if ("error" in report) throw new Error("expected report, got error");
    expect(report.recommendation).toMatch(/Enter Dual Assets/);
    expect(report.best_hours[0].hour_ict).toBe(12);
    expect(report.coin_pair).toBe("SOL-USDT");
    expect(report.target_price).toBe(78);
    expect(report.confidence.score).toBeGreaterThan(0);
  });

  it("adds APR trend from daily summaries", () => {
    saveSnapshot(snap({ timestamp_utc: "2026-04-28T05:00:00.000Z", timestamp_ict: "2026-04-28T12:00:00.000+07:00", apr_pct: 80 }));
    saveSnapshot(snap({ timestamp_utc: "2026-04-29T05:00:00.000Z", timestamp_ict: "2026-04-29T12:00:00.000+07:00", apr_pct: 140 }));
    updateDailySummary("2026-04-28");
    updateDailySummary("2026-04-29");

    const report = generateHourlyReport({ coinPair: "SOL-USDT", targetPrice: 78, days: 365 });
    if ("error" in report) throw new Error("expected report");
    expect(report.trend.direction).toBe("rising");
    expect(report.trend.latest_avg_apr).toBe(140);
  });

  it("classifies hot/cold hours by 1.1x / 0.9x of overall avg", () => {
    // overall avg = (50 + 100 + 150) / 3 = 100
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T08:00:00.000+07:00", hour_ict: 8, apr_pct: 50 }));   // cold (<= 90)
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T12:00:00.000+07:00", hour_ict: 12, apr_pct: 100 })); // neutral
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T20:00:00.000+07:00", hour_ict: 20, apr_pct: 150 })); // hot (>= 110)
    const report = generateHourlyReport({ coinPair: "SOL-USDT", targetPrice: 78, days: 365 });
    if ("error" in report) throw new Error("expected report");
    expect(report.hot_hours).toContain(20);
    expect(report.cold_hours).toContain(8);
    expect(report.overall_avg_apr).toBe(100);
  });

  it("falls back to insufficient-data message when only one hour has samples", () => {
    saveSnapshot(snap({ hour_ict: 12, apr_pct: 100 }));
    const report = generateHourlyReport({ coinPair: "SOL-USDT", targetPrice: 78, days: 365 });
    if ("error" in report) throw new Error("expected report");
    expect(report.recommendation).toMatch(/Insufficient data/);
  });
});
