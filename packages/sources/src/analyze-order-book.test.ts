import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeOrderBook } from "./depth.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // No hub by default — exercises the REST path
  process.env.PULSE_HUB_URL = "http://127.0.0.1:65535"; // unbindable
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// Synthetic book around mid=100: thin near-book noise plus one known wall on
// each side, so wall detection / bands / coverage are all assertable.
function syntheticDepth() {
  const bids: [string, string][] = [
    ["99.99", "0.1"],
    ["99.9", "0.2"],
    ["98.0", "50"], // support wall: $4,900 notional at -2%
    ["96.0", "0.3"],
  ];
  const asks: [string, string][] = [
    ["100.01", "0.1"],
    ["100.1", "0.2"],
    ["103.0", "40"], // resistance wall: $4,120 notional at +3%
    ["104.0", "0.3"],
  ];
  return { lastUpdateId: 1, bids, asks };
}

describe("analyzeOrderBook", () => {
  it("computes mid/spread, finds walls with distance, and reports coverage", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("65535")) throw new Error("ECONNREFUSED");
      if (u.startsWith("https://api.binance.com/api/v3/depth")) {
        expect(u).toContain("limit=5000");
        return new Response(JSON.stringify(syntheticDepth()), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as typeof fetch;

    const a = await analyzeOrderBook("btcusdt");

    expect(a.symbol).toBe("BTCUSDT");
    expect(a.source).toBe("rest-deep");
    expect(a.mid).toBeCloseTo(100, 5);
    expect(a.spreadUsd).toBeCloseTo(0.02, 5);

    // The dominant cluster on each side is the wall, with a real distance
    const support = a.supportWalls[0];
    expect(support.price).toBeCloseTo(98.0, 1);
    expect(support.qty).toBeCloseTo(50, 1);
    expect(support.distPct).toBeCloseTo(-2, 0);

    const resistance = a.resistanceWalls[0];
    expect(resistance.price).toBeCloseTo(103.0, 1);
    expect(resistance.distPct).toBeCloseTo(3, 0);

    // Bands: ±0.5% holds only the near-book noise; ±5% includes the walls
    const near = a.bands.find((b) => b.pct === 0.5)!;
    expect(near.bidUsd).toBeLessThan(50);
    const wide = a.bands.find((b) => b.pct === 5)!;
    expect(wide.bidUsd).toBeGreaterThan(4900);
    expect(wide.askUsd).toBeGreaterThan(4100);
    expect(wide.ratio).toBeCloseTo(wide.bidUsd / wide.askUsd, 6);

    // Coverage reflects how far the synthetic book reaches
    expect(a.coverage.bidPct).toBeCloseTo(4, 0);
    expect(a.coverage.askPct).toBeCloseTo(4, 0);
    expect(a.coverage.bidLevels).toBe(4);
  });

  it("falls back to hub book and labels the source as shallow", async () => {
    const hubBook = {
      symbol: "BTCUSDT",
      ts: 123,
      bids: [
        [99.99, 0.1],
        [99.9, 5],
      ],
      asks: [
        [100.01, 0.1],
        [100.1, 4],
      ],
    };
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.startsWith("https://api.binance.com")) throw new Error("binance down");
      if (u.includes("/depth?symbol=")) {
        return new Response(JSON.stringify(hubBook), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      throw new Error(`unexpected fetch ${u}`);
    }) as typeof fetch;
    process.env.PULSE_HUB_URL = "http://127.0.0.1:8081";

    const a = await analyzeOrderBook("BTCUSDT");
    expect(a.source).toBe("hub-shallow");
    expect(a.supportWalls.length).toBeGreaterThan(0);
    // Shallow book → tiny coverage, so the caller can see the limitation
    expect(a.coverage.bidPct).toBeLessThan(0.2);
  });
});
