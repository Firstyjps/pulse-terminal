import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  appendSnapshot,
  computePnL,
  readPortfolioHistory,
  type PortfolioSnapshot,
} from "./history.js";

const DAY_MS = 86_400_000;
const T0 = new Date("2026-04-01T16:59:00.000Z").getTime(); // ~23:59 BKK 2026-04-01

let tmpDir: string;
let path: string;

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), "psnap-"));
  path = join(tmpDir, "portfolio-history.jsonl");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function snap(daysAgoFromT0: number, totalUsd: number, source = "coinstats"): PortfolioSnapshot {
  const ts = T0 + daysAgoFromT0 * DAY_MS;
  return {
    ts,
    dateBkk: new Date(ts + 7 * 60 * 60_000).toISOString().slice(0, 10),
    totalUsd,
    _source: source,
    venueCount: 3,
    assetCount: 7,
  };
}

describe("readPortfolioHistory", () => {
  it("returns [] when file missing", async () => {
    const out = await readPortfolioHistory(path);
    expect(out).toEqual([]);
  });

  it("returns [] when file empty", async () => {
    writeFileSync(path, "", "utf8");
    expect(await readPortfolioHistory(path)).toEqual([]);
  });

  it("skips blank lines and malformed JSON without crashing", async () => {
    const a = snap(0, 1000);
    writeFileSync(
      path,
      [JSON.stringify(a), "", "{not-json", "null", '{"ts":"bad"}', ""].join("\n"),
      "utf8",
    );
    const out = await readPortfolioHistory(path);
    expect(out).toEqual([a]);
  });

  it("dedups by dateBkk — last write wins", async () => {
    const earlier = snap(0, 1000);
    const later = { ...snap(0, 1500), ts: earlier.ts + 100 }; // same dateBkk
    writeFileSync(path, [JSON.stringify(earlier), JSON.stringify(later)].join("\n") + "\n", "utf8");
    const out = await readPortfolioHistory(path);
    expect(out).toHaveLength(1);
    expect(out[0].totalUsd).toBe(1500);
  });

  it("sorts ascending by ts", async () => {
    writeFileSync(
      path,
      [snap(-2, 1000), snap(0, 3000), snap(-1, 2000)] // input order is scrambled
        .map((s) => JSON.stringify(s))
        .join("\n") + "\n",
      "utf8",
    );
    const out = await readPortfolioHistory(path);
    expect(out.map((s) => s.totalUsd)).toEqual([1000, 2000, 3000]); // oldest → newest
  });
});

describe("appendSnapshot", () => {
  it("creates parent dir + appends NDJSON line", async () => {
    const nested = join(tmpDir, "nested", "dir", "history.jsonl");
    const a = snap(0, 100);
    await appendSnapshot(a, nested);
    await appendSnapshot(snap(1, 200), nested);
    const text = readFileSync(nested, "utf8");
    const lines = text.trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).totalUsd).toBe(100);
    expect(JSON.parse(lines[1]).totalUsd).toBe(200);
  });

  it("two writes for same dateBkk both land — reader dedups", async () => {
    const first = snap(0, 1000);
    const second = { ...snap(0, 1100), ts: first.ts + 50 };
    await appendSnapshot(first, path);
    await appendSnapshot(second, path);
    const out = await readPortfolioHistory(path);
    expect(out).toHaveLength(1);
    expect(out[0].totalUsd).toBe(1100);
  });
});

describe("computePnL", () => {
  it("returns null when history empty", () => {
    expect(computePnL([], 1)).toBeNull();
  });

  it("returns null when only 1 snapshot", () => {
    expect(computePnL([snap(0, 1000)], 1)).toBeNull();
  });

  it("happy path 24h — 1000 → 1100 = +10%", () => {
    const r = computePnL([snap(-1, 1000), snap(0, 1100)], 1);
    expect(r).not.toBeNull();
    expect(r!.usdDelta).toBe(100);
    expect(r!.pctDelta).toBeCloseTo(10, 5);
  });

  it("happy path 7d — picks the 7-days-ago row, ignores intermediate noise", () => {
    const hist = [
      snap(-7, 5000), // baseline
      snap(-3, 5500),
      snap(-1, 6500),
      snap(0, 6000),
    ];
    const r = computePnL(hist, 7);
    expect(r).not.toBeNull();
    expect(r!.usdDelta).toBe(1000);
    expect(r!.pctDelta).toBeCloseTo(20, 5);
  });

  it("happy path 30d", () => {
    const r = computePnL([snap(-30, 10_000), snap(-7, 11_000), snap(0, 12_000)], 30);
    expect(r!.usdDelta).toBe(2000);
    expect(r!.pctDelta).toBeCloseTo(20, 5);
  });

  it("insufficient history — 7d window, only 3 days back", () => {
    const r = computePnL([snap(-3, 9000), snap(-1, 10_000), snap(0, 10_500)], 7);
    expect(r).toBeNull();
  });

  it("insufficient history — 30d window, latest baseline 25 days back", () => {
    const r = computePnL([snap(-25, 5000), snap(0, 6000)], 30);
    expect(r).toBeNull();
  });

  it("returns null when baseline totalUsd === 0 (avoid div-by-zero)", () => {
    const r = computePnL([snap(-7, 0), snap(0, 100)], 7);
    expect(r).toBeNull();
  });

  it("cross-source data: coinstats baseline → multi-cex latest still computes", () => {
    const hist = [
      snap(-7, 30_000, "coinstats"),
      snap(-3, 28_000, "multi-cex"), // user lost coinstats key, fell back
      snap(0, 27_500, "multi-cex"),
    ];
    const r = computePnL(hist, 7);
    expect(r).not.toBeNull();
    expect(r!.usdDelta).toBe(-2500);
    expect(r!.pctDelta).toBeCloseTo(-8.333, 2);
  });

  it("negative pct (drawdown)", () => {
    const r = computePnL([snap(-1, 10_000), snap(0, 9000)], 1);
    expect(r!.usdDelta).toBe(-1000);
    expect(r!.pctDelta).toBeCloseTo(-10, 5);
  });

  it("picks closest qualifying baseline when multiple are at-or-before the target", () => {
    const hist = [
      snap(-40, 1000), // older — should be skipped
      snap(-30, 2000), // closer to target → picked
      snap(0, 3000),
    ];
    const r = computePnL(hist, 30);
    expect(r!.usdDelta).toBe(1000); // 3000 - 2000
  });

  it("walks unsorted input correctly", () => {
    // Same data as previous, scrambled order
    const hist = [snap(0, 3000), snap(-40, 1000), snap(-30, 2000)];
    const r = computePnL(hist, 30);
    expect(r!.usdDelta).toBe(1000);
  });
});
