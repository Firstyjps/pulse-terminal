import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./portfolio-multi.js", () => ({ getMultiPortfolio: vi.fn() }));
vi.mock("./meteora-positions.js", () => ({ getMeteoraPositions: vi.fn() }));
vi.mock("./pendle-positions.js", () => ({ getPendlePositions: vi.fn() }));
vi.mock("./orca-positions.js", () => ({ getOrcaPositions: vi.fn() }));
vi.mock("./aave-positions.js", () => ({ getAavePositions: vi.fn() }));
vi.mock("./coinstats.js", () => ({ getCoinStatsPortfolio: vi.fn() }));

import { getAggregatePortfolio } from "./portfolio-aggregate.js";
import { getMultiPortfolio } from "./portfolio-multi.js";
import { getMeteoraPositions } from "./meteora-positions.js";
import { getPendlePositions } from "./pendle-positions.js";
import { getOrcaPositions } from "./orca-positions.js";
import { getAavePositions } from "./aave-positions.js";
import { getCoinStatsPortfolio } from "./coinstats.js";

const mockMulti = vi.mocked(getMultiPortfolio);
const mockMeteora = vi.mocked(getMeteoraPositions);
const mockPendle = vi.mocked(getPendlePositions);
const mockOrca = vi.mocked(getOrcaPositions);
const mockAave = vi.mocked(getAavePositions);
const mockCoinStats = vi.mocked(getCoinStatsPortfolio);

beforeEach(() => {
  mockMulti.mockReset();
  mockMeteora.mockReset();
  mockPendle.mockReset();
  mockOrca.mockReset();
  mockAave.mockReset();
  mockCoinStats.mockReset();
  // Default: CoinStats absent → tests below are about CEX/DeFi fallback.
  // Tests that exercise CoinStats override via mockCoinStats.mockResolvedValue(...).
  mockCoinStats.mockResolvedValue(null);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function emptyDefaults() {
  mockMulti.mockResolvedValue({ sources: [], totalUsd: 0, status: [], ts: 1 });
  mockMeteora.mockResolvedValue({ positions: [] });
  mockPendle.mockResolvedValue({ positions: [] });
  mockOrca.mockResolvedValue({ positions: [] });
  mockAave.mockResolvedValue({ positions: [] });
}

describe("getAggregatePortfolio — totals", () => {
  it("returns zero totals when nothing is configured", async () => {
    emptyDefaults();
    const snap = await getAggregatePortfolio();
    expect(snap.totalUsd).toBe(0);
    expect(snap.byVenue).toEqual([]);
    expect(snap.byAsset).toEqual([]);
    expect(snap.lp).toEqual([]);
    expect(snap.errors).toBeUndefined();
    expect(snap._source).toBe("none");
  });

  it("sums totalUsd across CEX + DeFi", async () => {
    mockMulti.mockResolvedValue({
      sources: [
        {
          source: "binance",
          totalUsd: 50_000,
          balances: [
            { asset: "BTC", free: 0.5, locked: 0, total: 0.5, usdValue: 40_000 },
            { asset: "USDT", free: 10_000, locked: 0, total: 10_000, usdValue: 10_000 },
          ],
          ts: 1,
        },
      ],
      totalUsd: 50_000,
      status: [{ source: "binance", configured: true }],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({
      positions: [
        { venue: "meteora", type: "lp", asset: "SOL-USDC", units: 1, usdValue: 3000 },
      ],
    });
    mockPendle.mockResolvedValue({
      positions: [
        { venue: "pendle", type: "yield_token", asset: "PT-sUSDe", units: 1000, usdValue: 950 },
      ],
    });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({
      positions: [
        { venue: "aave", type: "lending", asset: "USDC", units: 5000, usdValue: 5000 },
        { venue: "aave", type: "borrow",  asset: "WETH", units: -0.5, usdValue: -1500 },
      ],
    });

    const snap = await getAggregatePortfolio();
    expect(snap.totalUsd).toBe(50_000 + 3000 + 950 + 5000 - 1500); // 57,450
  });
});

describe("getAggregatePortfolio — byVenue grouping", () => {
  it("groups balances per venue with venue-level totalUsd", async () => {
    mockMulti.mockResolvedValue({
      sources: [
        {
          source: "binance",
          totalUsd: 30_000,
          balances: [
            { asset: "BTC", free: 0.3, locked: 0, total: 0.3, usdValue: 24_000 },
            { asset: "ETH", free: 2,   locked: 0, total: 2,   usdValue: 6000 },
          ],
          ts: 1,
        },
      ],
      totalUsd: 30_000,
      status: [],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({
      positions: [{ venue: "meteora", type: "lp", asset: "SOL-USDC", units: 1, usdValue: 1000 }],
    });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    const binance = snap.byVenue.find((v) => v.name === "binance");
    expect(binance?.totalUsd).toBe(30_000);
    expect(binance?.balances).toHaveLength(2);
    expect(binance?.balances[0].type).toBe("spot");

    const meteora = snap.byVenue.find((v) => v.name === "meteora");
    expect(meteora?.totalUsd).toBe(1000);
    expect(meteora?.balances[0].type).toBe("lp");
  });

  it("sorts byVenue by totalUsd desc", async () => {
    mockMulti.mockResolvedValue({
      sources: [
        { source: "binance", totalUsd: 1000,  balances: [{ asset: "USDT", free: 1000,  locked: 0, total: 1000,  usdValue: 1000 }],  ts: 1 },
        { source: "bybit",   totalUsd: 50_000, balances: [{ asset: "USDT", free: 50000, locked: 0, total: 50000, usdValue: 50_000 }], ts: 2 },
      ],
      totalUsd: 51_000,
      status: [],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({ positions: [] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap.byVenue.map((v) => v.name)).toEqual(["bybit", "binance"]);
  });
});

describe("getAggregatePortfolio — byAsset bucketing", () => {
  it("aggregates units + usd across venues for the same ticker", async () => {
    mockMulti.mockResolvedValue({
      sources: [
        { source: "binance", totalUsd: 40_000, balances: [{ asset: "BTC", free: 0.5, locked: 0, total: 0.5, usdValue: 40_000 }], ts: 1 },
        { source: "bybit",   totalUsd: 24_000, balances: [{ asset: "BTC", free: 0.3, locked: 0, total: 0.3, usdValue: 24_000 }], ts: 2 },
      ],
      totalUsd: 64_000,
      status: [],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({ positions: [] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    const btc = snap.byAsset.find((a) => a.ticker === "BTC");
    expect(btc?.totalUnits).toBe(0.8);
    expect(btc?.totalUsd).toBe(64_000);
    expect(btc?.venues).toEqual(["binance", "bybit"]); // sorted
  });

  it("excludes LP positions from byAsset (pair tickers don't aggregate)", async () => {
    mockMulti.mockResolvedValue({ sources: [], totalUsd: 0, status: [], ts: 1 });
    mockMeteora.mockResolvedValue({
      positions: [{ venue: "meteora", type: "lp", asset: "SOL-USDC", units: 1, usdValue: 3000 }],
    });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({
      positions: [{ venue: "orca", type: "lp", asset: "SOL-USDC", units: 1, usdValue: 1500 }],
    });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap.byAsset).toEqual([]);
    expect(snap.lp).toHaveLength(2);
  });

  it("borrow positions reduce byAsset totals (negative units + usd)", async () => {
    mockMulti.mockResolvedValue({ sources: [], totalUsd: 0, status: [], ts: 1 });
    mockMeteora.mockResolvedValue({ positions: [] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({
      positions: [
        { venue: "aave", type: "lending", asset: "WETH", units: 5,    usdValue: 15_000 },
        { venue: "aave", type: "borrow",  asset: "WETH", units: -1,   usdValue: -3000 },
      ],
    });

    const snap = await getAggregatePortfolio();
    const weth = snap.byAsset.find((a) => a.ticker === "WETH");
    expect(weth?.totalUnits).toBe(4);
    expect(weth?.totalUsd).toBe(12_000);
    expect(weth?.venues).toEqual(["aave"]);
  });

  it("sorts byAsset by totalUsd desc", async () => {
    mockMulti.mockResolvedValue({
      sources: [
        {
          source: "binance",
          totalUsd: 50_000,
          balances: [
            { asset: "ETH",  free: 1, locked: 0, total: 1, usdValue: 3000 },
            { asset: "BTC",  free: 0.5, locked: 0, total: 0.5, usdValue: 40_000 },
            { asset: "USDT", free: 7000, locked: 0, total: 7000, usdValue: 7000 },
          ],
          ts: 1,
        },
      ],
      totalUsd: 50_000,
      status: [],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({ positions: [] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap.byAsset.map((a) => a.ticker)).toEqual(["BTC", "USDT", "ETH"]);
  });
});

describe("getAggregatePortfolio — lp segregation", () => {
  it("collects every type:'lp' position into lp[]", async () => {
    mockMulti.mockResolvedValue({ sources: [], totalUsd: 0, status: [], ts: 1 });
    mockMeteora.mockResolvedValue({
      positions: [{ venue: "meteora", type: "lp", asset: "SOL-USDC", units: 1, usdValue: 3000 }],
    });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({
      positions: [{ venue: "orca", type: "lp", asset: "BONK-SOL", units: 1, usdValue: 500 }],
    });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap.lp).toHaveLength(2);
    expect(snap.lp.map((p) => p.venue).sort()).toEqual(["meteora", "orca"]);
  });
});

describe("getAggregatePortfolio — failure isolation", () => {
  it("collects errors from CEX status[] and DeFi errors[]", async () => {
    mockMulti.mockResolvedValue({
      sources: [],
      totalUsd: 0,
      status: [{ source: "binance", configured: true, error: "401" }],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({ positions: [], errors: ["meteora foo: HTTP 502"] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [], errors: ["aave: THEGRAPH_API_KEY not set"] });

    const snap = await getAggregatePortfolio();
    expect(snap.errors).toContain("binance: 401");
    expect(snap.errors).toContain("meteora foo: HTTP 502");
    expect(snap.errors).toContain("aave: THEGRAPH_API_KEY not set");
  });

  it("does not throw when one DeFi source rejects — captures as error", async () => {
    mockMulti.mockResolvedValue({ sources: [], totalUsd: 0, status: [], ts: 1 });
    mockMeteora.mockRejectedValue(new Error("boom"));
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap.errors?.some((e) => e.startsWith("meteora:") && e.includes("boom"))).toBe(true);
    expect(snap.totalUsd).toBe(0);
  });

  it("does not throw when CEX rejects entirely", async () => {
    mockMulti.mockRejectedValue(new Error("multi-portfolio bug"));
    mockMeteora.mockResolvedValue({ positions: [] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap.errors?.some((e) => e.startsWith("cex:") && e.includes("multi-portfolio bug"))).toBe(true);
  });

  it("omits errors field when all sources clean", async () => {
    emptyDefaults();
    const snap = await getAggregatePortfolio();
    expect(snap.errors).toBeUndefined();
  });
});

describe("getAggregatePortfolio — concurrency + asOf", () => {
  it("fetches all 5 sources in parallel via Promise.allSettled", async () => {
    const order: string[] = [];
    const delay = 30;
    const wrap = (name: string, value: unknown) =>
      vi.fn(async () => {
        order.push(`${name}-start`);
        await new Promise((r) => setTimeout(r, delay));
        order.push(`${name}-end`);
        return value as never;
      });
    mockMulti.mockImplementation(wrap("multi", { sources: [], totalUsd: 0, status: [], ts: 1 }));
    mockMeteora.mockImplementation(wrap("meteora", { positions: [] }));
    mockPendle.mockImplementation(wrap("pendle", { positions: [] }));
    mockOrca.mockImplementation(wrap("orca", { positions: [] }));
    mockAave.mockImplementation(wrap("aave", { positions: [] }));

    await getAggregatePortfolio();

    const lastStart = Math.max(
      order.indexOf("multi-start"),
      order.indexOf("meteora-start"),
      order.indexOf("pendle-start"),
      order.indexOf("orca-start"),
      order.indexOf("aave-start"),
    );
    const firstEnd = Math.min(
      order.indexOf("multi-end"),
      order.indexOf("meteora-end"),
      order.indexOf("pendle-end"),
      order.indexOf("orca-end"),
      order.indexOf("aave-end"),
    );
    expect(lastStart).toBeLessThan(firstEnd);
  });

  it("stamps asOf at call time", async () => {
    emptyDefaults();
    const before = Date.now();
    const snap = await getAggregatePortfolio();
    const after = Date.now();
    expect(snap.asOf).toBeGreaterThanOrEqual(before);
    expect(snap.asOf).toBeLessThanOrEqual(after);
  });
});

describe("getAggregatePortfolio — _source dispatch", () => {
  it("uses CoinStats path when populated, skipping CEX adapters", async () => {
    mockCoinStats.mockResolvedValue({
      totalUsd: 32000,
      change24hUsd: 320,
      change24hPct: 1.0,
      assets: [
        { symbol: "ETH", amount: 5.38, priceUsd: 3000, usdValue: 16140, change24h: 1.2 },
        { symbol: "USDC", amount: 8000, priceUsd: 1, usdValue: 8000, change24h: 0 },
        { symbol: "SOL", amount: 50, priceUsd: 156, usdValue: 7860, change24h: 3.5 },
      ],
      asOf: new Date().toISOString(),
      _source: "coinstats",
      populated: true,
    });
    emptyDefaults();

    const snap = await getAggregatePortfolio();
    expect(snap._source).toBe("coinstats");
    expect(snap.totalUsd).toBe(32000);
    expect(snap.byVenue).toHaveLength(1);
    expect(snap.byVenue[0].name).toBe("coinstats");
    expect(snap.byAsset.map((a) => a.ticker)).toEqual(["ETH", "USDC", "SOL"]);
    // CEX/DeFi fallback should NOT have been called
    expect(mockMulti).not.toHaveBeenCalled();
    expect(mockMeteora).not.toHaveBeenCalled();
  });

  it("falls back to multi-CEX when CoinStats key is unset (returns null)", async () => {
    mockCoinStats.mockResolvedValue(null);
    mockMulti.mockResolvedValue({
      sources: [
        {
          source: "binance",
          totalUsd: 1780,
          balances: [{ asset: "USDT", free: 1780, locked: 0, total: 1780, usdValue: 1780 }],
          ts: 1,
        },
      ],
      totalUsd: 1780,
      status: [{ source: "binance", configured: true }],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({ positions: [] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap._source).toBe("multi-cex");
    expect(snap.totalUsd).toBe(1780);
    expect(mockMulti).toHaveBeenCalledTimes(1);
  });

  it("falls back to multi-CEX when CoinStats is configured but populated:false", async () => {
    mockCoinStats.mockResolvedValue({
      totalUsd: 0,
      change24hUsd: 0,
      change24hPct: 0,
      assets: [],
      asOf: new Date().toISOString(),
      _source: "coinstats",
      populated: false,
    });
    mockMulti.mockResolvedValue({
      sources: [
        { source: "okx", totalUsd: 500, balances: [{ asset: "USDT", free: 500, locked: 0, total: 500, usdValue: 500 }], ts: 1 },
      ],
      totalUsd: 500,
      status: [],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({ positions: [] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap._source).toBe("multi-cex");
    expect(snap.totalUsd).toBe(500);
  });

  it("returns _source:'none' when both CoinStats and CEX/DeFi paths are empty", async () => {
    mockCoinStats.mockResolvedValue(null);
    emptyDefaults();
    const snap = await getAggregatePortfolio();
    expect(snap._source).toBe("none");
    expect(snap.totalUsd).toBe(0);
  });

  it("falls back to multi-CEX when CoinStats throws, surfacing error line", async () => {
    mockCoinStats.mockRejectedValue(new Error("coinstats /portfolio/coins → 401 (key …ABCD): unauthorized"));
    mockMulti.mockResolvedValue({
      sources: [
        { source: "bybit", totalUsd: 200, balances: [{ asset: "USDT", free: 200, locked: 0, total: 200, usdValue: 200 }], ts: 1 },
      ],
      totalUsd: 200,
      status: [],
      ts: 1,
    });
    mockMeteora.mockResolvedValue({ positions: [] });
    mockPendle.mockResolvedValue({ positions: [] });
    mockOrca.mockResolvedValue({ positions: [] });
    mockAave.mockResolvedValue({ positions: [] });

    const snap = await getAggregatePortfolio();
    expect(snap.totalUsd).toBe(200);
    expect(snap.errors?.some((e) => e.startsWith("coinstats:") && e.includes("…ABCD"))).toBe(true);
    // Error message must NOT contain raw key
    expect(snap.errors?.join("\n")).not.toMatch(/test-key-1234/);
  });
});
