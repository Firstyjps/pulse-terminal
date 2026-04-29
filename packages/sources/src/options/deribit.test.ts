import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fetchDeribitOptions } from "./deribit.js";

// Replay payload modelled on Deribit's /public/get_book_summary_by_currency.
// Numbers chosen so the BTC/SOL price-conversion path is detectable.
function btcBookSummaryFixture() {
  return {
    result: [
      {
        instrument_name: "BTC-26JUN26-100000-C",
        bid_price: 0.05,        // fraction of underlying
        ask_price: 0.06,
        mark_price: 0.055,
        mark_iv: 65.4,
        underlying_price: 80000,
        open_interest: 1234.5,
        volume: 200,
        delta: 0.4,
        gamma: 0.0001,
        theta: -10.5,
        vega: 50.2,
      },
      {
        instrument_name: "BTC-26JUN26-100000-P",
        bid_price: null,        // bid missing → 0
        ask_price: null,        // ask missing → mark*1.02 fallback
        mark_price: 0.04,
        mark_iv: 70,
        underlying_price: 80000,
        open_interest: 800,
        volume: 90,
        delta: -0.5,
        gamma: 0.0002,
        theta: -8,
        vega: 60,
      },
      {
        // Different currency prefix — should be filtered out (e.g. ETH leaking into BTC fetch)
        instrument_name: "ETH-26JUN26-3000-C",
        bid_price: 0.1, ask_price: 0.12, mark_price: 0.11,
        mark_iv: 55, underlying_price: 3000,
        open_interest: 10, volume: 5,
        delta: 0.4, gamma: 0, theta: 0, vega: 0,
      },
      {
        // Mark <= 0 → must be dropped
        instrument_name: "BTC-26JUN26-90000-C",
        bid_price: 0, ask_price: 0, mark_price: 0,
        mark_iv: 0, underlying_price: 80000,
        open_interest: 0, volume: 0,
        delta: 0, gamma: 0, theta: 0, vega: 0,
      },
      {
        // Malformed name (< 4 parts after split) → dropped
        instrument_name: "BTC-BROKEN",
        bid_price: 0.1, ask_price: 0.1, mark_price: 0.1,
        mark_iv: 50, underlying_price: 80000,
        open_interest: 1, volume: 1,
        delta: 0, gamma: 0, theta: 0, vega: 0,
      },
    ],
  };
}

function solBookSummaryFixture() {
  return {
    result: [
      {
        // SOL_USDC: prices already in USD (no underlying multiplication)
        instrument_name: "SOL_USDC-3APR26-200-C",
        bid_price: 5.5,
        ask_price: 6.0,
        mark_price: 5.75,
        mark_iv: 60,
        underlying_price: 195,
        open_interest: 1000,
        volume: 50,
        delta: 0.55,
        gamma: 0.001,
        theta: -0.5,
        vega: 0.4,
      },
    ],
  };
}

function jsonResponse(payload: unknown) {
  return {
    ok: true, status: 200,
    json: async () => payload,
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("fetchDeribitOptions — BTC", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => jsonResponse(btcBookSummaryFixture())) as typeof fetch;
  });

  it("returns only BTC-prefixed instruments and drops the ETH leakage", async () => {
    const { options } = await fetchDeribitOptions("BTC");
    expect(options.every((o) => o.asset === "BTC")).toBe(true);
    expect(options.find((o) => o.strike === 3000)).toBeUndefined();
  });

  it("converts BTC fraction-of-underlying prices to USD via mark*underlying", async () => {
    const { options } = await fetchDeribitOptions("BTC");
    const call = options.find((o) => o.side === "call" && o.strike === 100000)!;
    // mark_price 0.055 × underlying 80000 = 4400
    expect(call.mark).toBeCloseTo(4400, 4);
    // bid 0.05 × 80000 = 4000
    expect(call.bid).toBeCloseTo(4000, 4);
    // ask 0.06 × 80000 = 4800
    expect(call.ask).toBeCloseTo(4800, 4);
  });

  it("falls back ask = mark*1.02 when ask_price is null", async () => {
    const { options } = await fetchDeribitOptions("BTC");
    const put = options.find((o) => o.side === "put" && o.strike === 100000)!;
    // mark 0.04 × 80000 = 3200, ask fallback = 3200 × 1.02 = 3264
    expect(put.bid).toBe(0);          // null bid → 0
    expect(put.ask).toBeCloseTo(3264, 4);
  });

  it("drops options with mark <= 0", async () => {
    const { options } = await fetchDeribitOptions("BTC");
    expect(options.find((o) => o.strike === 90000)).toBeUndefined();
  });

  it("drops malformed instrument names", async () => {
    const { options } = await fetchDeribitOptions("BTC");
    // None should match the broken instrument
    expect(options.length).toBe(2);  // call + put on 100000
  });

  it("normalizes expiry to YYYYMMDD and exposes sorted unique expiries", async () => {
    const { options, expiries } = await fetchDeribitOptions("BTC");
    expect(options[0].expiry).toBe("20260626");
    expect(expiries).toEqual(["20260626"]);
  });

  it("emits the underlying price from the last seen instrument", async () => {
    const { underlyingPrice } = await fetchDeribitOptions("BTC");
    expect(underlyingPrice).toBe(80000);
  });

  it("rounds Greeks to the documented precision", async () => {
    const { options } = await fetchDeribitOptions("BTC");
    const call = options.find((o) => o.side === "call")!;
    expect(call.iv).toBe(65.4);             // 1 decimal
    expect(call.delta).toBeCloseTo(0.4, 4);
    expect(call.gamma).toBeCloseTo(0.0001, 6);
  });
});

describe("fetchDeribitOptions — SOL_USDC", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => jsonResponse(solBookSummaryFixture())) as typeof fetch;
  });

  it("uses raw USD prices (no underlying multiplication for SOL)", async () => {
    const { options } = await fetchDeribitOptions("SOL");
    const call = options[0];
    expect(call.bid).toBe(5.5);
    expect(call.ask).toBe(6);
    expect(call.mark).toBe(5.75);
  });

  it("filters by SOL_USDC prefix", async () => {
    const { options } = await fetchDeribitOptions("SOL");
    expect(options).toHaveLength(1);
    expect(options[0].exchange).toBe("Deribit");
    expect(options[0].asset).toBe("SOL");
  });
});

describe("fetchDeribitOptions — error handling", () => {
  it("returns empty arrays when result is missing", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({})) as typeof fetch;
    const { options, expiries, underlyingPrice } = await fetchDeribitOptions("BTC");
    expect(options).toEqual([]);
    expect(expiries).toEqual([]);
    expect(underlyingPrice).toBe(0);
  });
});
