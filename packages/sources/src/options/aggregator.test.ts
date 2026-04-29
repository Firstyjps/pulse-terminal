import { describe, expect, it } from "vitest";
import { buildIVSmile, findOptionsArbitrage } from "./aggregator.js";
import type { OptionData } from "./types.js";

function buildOption(overrides: Partial<OptionData>): OptionData {
  return {
    strike: 100,
    exchange: "Deribit",
    side: "call",
    asset: "BTC",
    expiry: "20260626",
    bid: 0,
    ask: 0,
    mark: 0,
    iv: 60,
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    oi: 0,
    volume: 0,
    size_bid: 0,
    size_ask: 0,
    ...overrides,
  };
}

describe("findOptionsArbitrage", () => {
  it("finds a buy-low / sell-high spread across two venues", () => {
    const opts: OptionData[] = [
      buildOption({ exchange: "Deribit", bid: 100, ask: 100 }),
      buildOption({ exchange: "Bybit", bid: 110, ask: 115 }),
    ];
    const arb = findOptionsArbitrage(opts, 5);
    expect(arb).toHaveLength(1);
    const a = arb[0];
    expect(a.buyExchange).toBe("Deribit");
    expect(a.buyAsk).toBe(100);
    expect(a.sellExchange).toBe("Bybit");
    expect(a.sellBid).toBe(110);
    expect(a.spread).toBe(10);
  });

  it("filters out spreads below minSpreadPct threshold", () => {
    const opts: OptionData[] = [
      buildOption({ exchange: "Deribit", bid: 100, ask: 100 }),
      buildOption({ exchange: "Bybit", bid: 101, ask: 102 }),
      // (101 - 100) / 100.5 = ~1% — below 5% threshold
    ];
    expect(findOptionsArbitrage(opts, 5)).toHaveLength(0);
  });

  it("skips options with non-positive bid or ask", () => {
    const opts: OptionData[] = [
      buildOption({ exchange: "Deribit", bid: 0, ask: 100 }),
      buildOption({ exchange: "Bybit", bid: 200, ask: 0 }),
    ];
    expect(findOptionsArbitrage(opts, 5)).toEqual([]);
  });

  it("requires same strike + side + expiry to compare", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 100, exchange: "Deribit", bid: 100, ask: 100 }),
      buildOption({ strike: 105, exchange: "Bybit", bid: 200, ask: 210 }),
    ];
    expect(findOptionsArbitrage(opts, 5)).toEqual([]);
  });

  it("does not pair a venue against itself", () => {
    const opts: OptionData[] = [
      buildOption({ exchange: "Deribit", bid: 100, ask: 100 }),
      buildOption({ exchange: "Deribit", bid: 110, ask: 115 }),
    ];
    expect(findOptionsArbitrage(opts, 5)).toEqual([]);
  });

  it("sorts results by spreadPercent descending and caps at 50", () => {
    const opts: OptionData[] = [];
    // Build 60 distinct (strike, exchange-pair) opportunities with growing spread
    for (let i = 0; i < 60; i++) {
      opts.push(buildOption({ strike: 100 + i, exchange: "Deribit", bid: 100, ask: 100 }));
      opts.push(
        buildOption({ strike: 100 + i, exchange: "Bybit", bid: 110 + i, ask: 200 }),
      );
    }
    const arb = findOptionsArbitrage(opts, 5);
    expect(arb.length).toBeLessThanOrEqual(50);
    for (let i = 1; i < arb.length; i++) {
      expect(arb[i - 1].spreadPercent).toBeGreaterThanOrEqual(arb[i].spreadPercent);
    }
  });

  it("rounds spreadPercent to 2 decimals", () => {
    const opts: OptionData[] = [
      buildOption({ exchange: "Deribit", bid: 1, ask: 1 }),
      buildOption({ exchange: "Bybit", bid: 1.123456, ask: 2 }),
    ];
    const arb = findOptionsArbitrage(opts, 5);
    if (arb.length) {
      expect(arb[0].spreadPercent).toBe(+arb[0].spreadPercent.toFixed(2));
    }
  });
});

describe("buildIVSmile", () => {
  it("groups calls and puts separately, sorted by strike, for the requested expiry+asset", () => {
    const opts: OptionData[] = [
      buildOption({ asset: "BTC", expiry: "20260626", strike: 110, side: "call", iv: 70 }),
      buildOption({ asset: "BTC", expiry: "20260626", strike: 90, side: "call", iv: 80 }),
      buildOption({ asset: "BTC", expiry: "20260626", strike: 100, side: "put", iv: 65 }),
      buildOption({ asset: "BTC", expiry: "20260626", strike: 90, side: "put", iv: 75 }),
    ];
    const smile = buildIVSmile(opts, "BTC", "20260626");
    expect(smile.calls.map((p) => p.strike)).toEqual([90, 110]);
    expect(smile.puts.map((p) => p.strike)).toEqual([90, 100]);
  });

  it("filters out options with iv <= 0", () => {
    const opts: OptionData[] = [
      buildOption({ asset: "BTC", expiry: "20260626", strike: 100, side: "call", iv: 0 }),
      buildOption({ asset: "BTC", expiry: "20260626", strike: 110, side: "call", iv: 60 }),
    ];
    const smile = buildIVSmile(opts, "BTC", "20260626");
    expect(smile.calls.map((p) => p.strike)).toEqual([110]);
  });

  it("filters by asset and expiry independently", () => {
    const opts: OptionData[] = [
      buildOption({ asset: "BTC", expiry: "20260626", strike: 100, side: "call", iv: 50 }),
      buildOption({ asset: "ETH", expiry: "20260626", strike: 100, side: "call", iv: 55 }),
      buildOption({ asset: "BTC", expiry: "20260901", strike: 100, side: "call", iv: 60 }),
    ];
    const smile = buildIVSmile(opts, "BTC", "20260626");
    expect(smile.calls).toHaveLength(1);
    expect(smile.calls[0].iv).toBe(50);
    expect(smile.asset).toBe("BTC");
    expect(smile.expiry).toBe("20260626");
  });

  it("returns empty arrays when nothing matches", () => {
    const smile = buildIVSmile([], "SOL", "20260101");
    expect(smile.calls).toEqual([]);
    expect(smile.puts).toEqual([]);
  });

  it("preserves exchange tag on each smile point", () => {
    const opts: OptionData[] = [
      buildOption({ asset: "BTC", expiry: "20260626", strike: 100, side: "call", iv: 50, exchange: "Bybit" }),
    ];
    const smile = buildIVSmile(opts, "BTC", "20260626");
    expect(smile.calls[0].exchange).toBe("Bybit");
  });
});
