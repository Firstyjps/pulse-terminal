import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DualAssetSnapshot } from "./types.js";

const TMP_DIR = mkdtempSync(join(tmpdir(), "dual-assets-analyzer-test-"));
const TMP_DB = join(TMP_DIR, "test.sqlite");
process.env.DUAL_ASSETS_DB_PATH = TMP_DB;

const { saveSnapshot, closeDb } = await import("./store.js");
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

const snap = (overrides: Partial<DualAssetSnapshot>): DualAssetSnapshot => ({
  timestamp_utc: "2026-04-28T05:00:00.000Z",
  timestamp_ict: "2026-04-28T12:00:00.000+07:00",
  hour_ict: 12,
  coin_pair: "SOL-USDT",
  direction: "BuyLow",
  target_price: 78,
  apr_pct: 100,
  duration: "1D",
  settlement_utc: null,
  index_price: 80,
  is_vip_only: 0,
  sol_iv_pct: 60,
  ...overrides,
});

afterAll(() => {
  closeDb();
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("generateHourlyReport", () => {
  beforeEach(() => {
    truncate();
  });

  it("returns error when no data is available", () => {
    const report = generateHourlyReport({ coinPair: "SOL-USDT", targetPrice: 78, days: 7 });
    expect(report).toEqual({ error: expect.stringMatching(/no data/i) });
  });

  it("returns Thai recommendation when data exists", () => {
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T08:00:00.000+07:00", hour_ict: 8, apr_pct: 50 }));
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T12:00:00.000+07:00", hour_ict: 12, apr_pct: 200 }));
    saveSnapshot(snap({ timestamp_ict: "2026-04-28T20:00:00.000+07:00", hour_ict: 20, apr_pct: 150 }));
    const report = generateHourlyReport({ coinPair: "SOL-USDT", targetPrice: 78, days: 365 });
    if ("error" in report) throw new Error("expected report, got error");
    expect(report.recommendation).toMatch(/เข้า Dual Assets/);
    expect(report.best_hours[0].hour_ict).toBe(12);
    expect(report.coin_pair).toBe("SOL-USDT");
    expect(report.target_price).toBe(78);
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
    expect(report.recommendation).toMatch(/ข้อมูลยังไม่เพียงพอ/);
  });
});
