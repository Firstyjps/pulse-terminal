import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { captureSnapshot, maybeBackfill, startPortfolioSnapshotCron } from "./index.js";
import { readPortfolioHistory } from "./history.js";

let tmpDir: string;
let path: string;

const T_2359_BKK = new Date("2026-04-01T16:59:00.000Z").getTime(); // 23:59 BKK
const T_NOON_BKK = new Date("2026-04-01T05:00:00.000Z").getTime(); // 12:00 BKK

const goodAggregate = {
  totalUsd: 32_500.42,
  byVenue: [{ name: "binance" }, { name: "bybit" }, { name: "coinstats" }],
  byAsset: [{ ticker: "BTC" }, { ticker: "ETH" }, { ticker: "SOL" }],
  _source: "coinstats",
};

const emptyAggregate = {
  totalUsd: 0,
  byVenue: [],
  byAsset: [],
  _source: "none",
};

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "psnap-cron-"));
  path = join(tmpDir, "portfolio-history.jsonl");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("captureSnapshot", () => {
  it("writes snapshot row when portfolio is configured", async () => {
    const snap = await captureSnapshot({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_2359_BKK,
    });
    expect(snap).not.toBeNull();
    expect(snap!.totalUsd).toBe(32_500.42);
    expect(snap!._source).toBe("coinstats");
    expect(snap!.venueCount).toBe(3);
    expect(snap!.assetCount).toBe(3);
    expect(snap!.dateBkk).toBe("2026-04-01");
    const rows = await readPortfolioHistory(path);
    expect(rows).toHaveLength(1);
  });

  it("returns null + does not write when _source === 'none'", async () => {
    const snap = await captureSnapshot({
      fetchAggregate: async () => emptyAggregate,
      historyPath: path,
      now: () => T_2359_BKK,
    });
    expect(snap).toBeNull();
    expect(await readPortfolioHistory(path)).toEqual([]);
  });

  it("dateBkk crosses correctly at 16:59 UTC = 23:59 BKK", async () => {
    const snap = await captureSnapshot({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => new Date("2026-04-01T17:00:00.000Z").getTime(), // 00:00 BKK Apr 2
    });
    expect(snap!.dateBkk).toBe("2026-04-02");
  });
});

describe("maybeBackfill", () => {
  it("writes snapshot when history empty + portfolio configured", async () => {
    const r = await maybeBackfill({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_NOON_BKK,
    });
    expect(r.wrote).toBe(true);
    expect(r.reason).toBe("backfill_ok");
    const rows = await readPortfolioHistory(path);
    expect(rows).toHaveLength(1);
  });

  it("skips when history already has rows", async () => {
    // seed
    await captureSnapshot({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_NOON_BKK,
    });
    const r = await maybeBackfill({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_NOON_BKK + 1000,
    });
    expect(r.wrote).toBe(false);
    expect(r.reason).toBe("history_present");
  });

  it("reports portfolio_not_configured when aggregate is empty", async () => {
    const r = await maybeBackfill({
      fetchAggregate: async () => emptyAggregate,
      historyPath: path,
      now: () => T_NOON_BKK,
    });
    expect(r.wrote).toBe(false);
    expect(r.reason).toBe("portfolio_not_configured");
    expect(await readPortfolioHistory(path)).toEqual([]);
  });
});

describe("startPortfolioSnapshotCron", () => {
  it("returns a stop function that clears the interval", () => {
    const stop = startPortfolioSnapshotCron({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_NOON_BKK, // outside fire window
      skipBackfill: true,
      intervalMs: 999_999,
    });
    expect(typeof stop).toBe("function");
    stop();
  });

  it("does not double-fire same BKK date", async () => {
    const stop = startPortfolioSnapshotCron({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_2359_BKK,
      skipBackfill: true,
      intervalMs: 999_999,
      // bypass the immediate void fireIfDue() race by pre-seeding lastFiredDate
      lastFiredDate: "2026-04-01",
    });
    // wait a tick for any scheduled microtask
    await new Promise((r) => setTimeout(r, 5));
    stop();
    expect(await readPortfolioHistory(path)).toEqual([]);
  });

  it("immediate fireIfDue() writes a snapshot when bkkHour === 23", async () => {
    const stop = startPortfolioSnapshotCron({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_2359_BKK,
      skipBackfill: true,
      intervalMs: 999_999,
    });
    // fireIfDue is async; give it a microtask + io tick to land
    await new Promise((r) => setTimeout(r, 20));
    stop();
    const rows = await readPortfolioHistory(path);
    expect(rows).toHaveLength(1);
    expect(rows[0].dateBkk).toBe("2026-04-01");
  });

  it("immediate fireIfDue() does NOT fire when bkkHour !== 23", async () => {
    const stop = startPortfolioSnapshotCron({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_NOON_BKK,
      skipBackfill: true,
      intervalMs: 999_999,
    });
    await new Promise((r) => setTimeout(r, 20));
    stop();
    expect(await readPortfolioHistory(path)).toEqual([]);
  });

  it("backfill writes initial snapshot on cold start", async () => {
    const stop = startPortfolioSnapshotCron({
      fetchAggregate: async () => goodAggregate,
      historyPath: path,
      now: () => T_NOON_BKK, // outside cron fire window — only backfill should run
      intervalMs: 999_999,
    });
    await new Promise((r) => setTimeout(r, 30));
    stop();
    const rows = await readPortfolioHistory(path);
    expect(rows).toHaveLength(1);
    // sanity — file content is parseable JSONL
    const raw = readFileSync(path, "utf8").trim();
    const parsed = JSON.parse(raw) as { dateBkk: string };
    expect(parsed.dateBkk).toBe("2026-04-01");
  });
});
