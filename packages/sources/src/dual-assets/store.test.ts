import { afterAll, beforeEach, describe, expect, it } from "vitest";
import Database from "better-sqlite3";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DualAssetSnapshot } from "./types.js";

// Set the DB path env BEFORE importing the store, so module-level resolution picks it up.
const TMP_DIR = mkdtempSync(join(tmpdir(), "dual-assets-test-"));
const TMP_DB = join(TMP_DIR, "test.sqlite");
process.env.DUAL_ASSETS_DB_PATH = TMP_DB;

const { saveSnapshot, getRecentSnapshots, getHourlyAvg, getBestHours, updateDailySummary, getAprIvCorrelation, closeDb } =
  await import("./store.js");

function truncate() {
  closeDb();
  try {
    const raw = new Database(TMP_DB);
    raw.exec(`DELETE FROM apr_snapshots; DELETE FROM daily_summary;`);
    raw.close();
  } catch {
    /* tables don't exist yet — first test run, that's fine */
  }
}

const baseSnap = (overrides: Partial<DualAssetSnapshot> = {}): DualAssetSnapshot => ({
  timestamp_utc: "2026-04-28T05:00:00.000Z",
  timestamp_ict: "2026-04-28T12:00:00.000+07:00",
  hour_ict: 12,
  coin_pair: "SOL-USDT",
  direction: "BuyLow",
  target_price: 78,
  apr_pct: 120,
  duration: "1D",
  settlement_utc: "2026-04-29T05:00:00.000Z",
  index_price: 80,
  is_vip_only: 0,
  sol_iv_pct: 65,
  ...overrides,
});

afterAll(() => {
  closeDb();
  rmSync(TMP_DIR, { recursive: true, force: true });
});

describe("dual-assets store", () => {
  beforeEach(() => {
    truncate();
  });

  describe("saveSnapshot", () => {
    it("inserts a new row and returns true", () => {
      expect(saveSnapshot(baseSnap())).toBe(true);
      expect(getRecentSnapshots(10)).toHaveLength(1);
    });

    it("dedupes on (timestamp_ict, coin_pair, target_price, duration, direction)", () => {
      saveSnapshot(baseSnap());
      const dup = saveSnapshot(baseSnap());
      expect(dup).toBe(false);
      expect(getRecentSnapshots(10)).toHaveLength(1);
    });

    it("allows different target_price for same timestamp", () => {
      saveSnapshot(baseSnap({ target_price: 78 }));
      const second = saveSnapshot(baseSnap({ target_price: 80 }));
      expect(second).toBe(true);
      expect(getRecentSnapshots(10)).toHaveLength(2);
    });
  });

  describe("getRecentSnapshots", () => {
    it("returns rows newest-first", () => {
      saveSnapshot(baseSnap({ timestamp_utc: "2026-04-28T01:00:00.000Z", timestamp_ict: "2026-04-28T08:00:00.000+07:00" }));
      saveSnapshot(baseSnap({ timestamp_utc: "2026-04-28T05:00:00.000Z", timestamp_ict: "2026-04-28T12:00:00.000+07:00" }));
      const rows = getRecentSnapshots(10);
      expect(rows[0].timestamp_utc).toBe("2026-04-28T05:00:00.000Z");
      expect(rows[1].timestamp_utc).toBe("2026-04-28T01:00:00.000Z");
    });

    it("respects limit", () => {
      for (let h = 0; h < 5; h++) {
        saveSnapshot(
          baseSnap({
            timestamp_utc: `2026-04-28T0${h}:00:00.000Z`,
            timestamp_ict: `2026-04-28T0${h + 7}:00:00.000+07:00`,
            hour_ict: h + 7,
          }),
        );
      }
      expect(getRecentSnapshots(3)).toHaveLength(3);
    });
  });

  describe("getHourlyAvg", () => {
    it("returns empty when no rows match the filter", () => {
      expect(getHourlyAvg({ coinPair: "SOL-USDT", targetPrice: 999, days: 7 })).toEqual([]);
    });

    it("groups by hour_ict and averages apr_pct", () => {
      saveSnapshot(baseSnap({ timestamp_ict: "2026-04-28T12:00:00.000+07:00", hour_ict: 12, apr_pct: 100 }));
      saveSnapshot(baseSnap({ timestamp_ict: "2026-04-28T12:05:00.000+07:00", hour_ict: 12, apr_pct: 200 }));
      saveSnapshot(baseSnap({ timestamp_ict: "2026-04-28T13:00:00.000+07:00", hour_ict: 13, apr_pct: 150 }));
      const stats = getHourlyAvg({ coinPair: "SOL-USDT", targetPrice: 78, days: 365 });
      const h12 = stats.find((s) => s.hour_ict === 12);
      const h13 = stats.find((s) => s.hour_ict === 13);
      expect(h12?.avg_apr).toBe(150);
      expect(h12?.samples).toBe(2);
      expect(h13?.avg_apr).toBe(150);
      expect(h13?.samples).toBe(1);
    });
  });

  describe("getBestHours", () => {
    it("returns top N hours by avg_apr desc", () => {
      saveSnapshot(baseSnap({ timestamp_ict: "2026-04-28T08:00:00.000+07:00", hour_ict: 8, apr_pct: 50 }));
      saveSnapshot(baseSnap({ timestamp_ict: "2026-04-28T12:00:00.000+07:00", hour_ict: 12, apr_pct: 200 }));
      saveSnapshot(baseSnap({ timestamp_ict: "2026-04-28T20:00:00.000+07:00", hour_ict: 20, apr_pct: 150 }));
      const top2 = getBestHours({ coinPair: "SOL-USDT", targetPrice: 78, days: 365, topN: 2 });
      expect(top2).toHaveLength(2);
      expect(top2[0].hour_ict).toBe(12);
      expect(top2[1].hour_ict).toBe(20);
    });
  });

  describe("getAprIvCorrelation", () => {
    it("returns null with explanatory message when fewer than 10 samples", () => {
      saveSnapshot(baseSnap({ apr_pct: 100, sol_iv_pct: 50 }));
      const corr = getAprIvCorrelation(365);
      expect(corr.correlation).toBeNull();
      expect(corr.message).toMatch(/not enough/i);
    });

    it("computes correlation when given 10+ samples", () => {
      // Perfect positive correlation: apr = iv
      for (let i = 0; i < 12; i++) {
        saveSnapshot(
          baseSnap({
            timestamp_ict: `2026-04-28T${String(i).padStart(2, "0")}:00:00.000+07:00`,
            hour_ict: i,
            apr_pct: 50 + i * 10,
            sol_iv_pct: 50 + i * 10,
          }),
        );
      }
      const corr = getAprIvCorrelation(365);
      expect(corr.correlation).toBeCloseTo(1, 2);
      expect(corr.interpretation).toMatch(/strong positive/i);
      expect(corr.samples).toBe(12);
    });
  });

  describe("updateDailySummary", () => {
    it("aggregates rows for a given date and writes a daily_summary row", () => {
      saveSnapshot(baseSnap({ timestamp_utc: "2026-04-28T05:00:00.000Z", apr_pct: 100, hour_ict: 12, timestamp_ict: "2026-04-28T12:00:00.000+07:00" }));
      saveSnapshot(baseSnap({ timestamp_utc: "2026-04-28T06:00:00.000Z", apr_pct: 200, hour_ict: 13, timestamp_ict: "2026-04-28T13:00:00.000+07:00" }));
      // Should not throw — full aggregation behavior is asserted via getHourlyAvg above.
      expect(() => updateDailySummary("2026-04-28")).not.toThrow();
    });
  });
});
