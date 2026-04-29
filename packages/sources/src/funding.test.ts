import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getFundingRates, getOpenInterest } from "./funding.js";

// Deribit responses we'll replay. Numbers chosen so the mappings are
// distinguishable from any default/zero values (e.g. mark_price=78000 means
// oi(BTC) ≈ 0.4 — clearly derived from the open_interest/mark_price ratio).
const DERIBIT_BTC_TICKER = {
  result: {
    instrument_name: "BTC-PERPETUAL",
    funding_8h: 0.00012,        // → ratePercent 0.012%
    current_funding: 0.00009,
    open_interest: 31_200,      // USD notional (inverse perp)
    mark_price: 78_000,
    timestamp: 1_770_000_000_000,
  },
};

const DERIBIT_ETH_TICKER = {
  result: {
    instrument_name: "ETH-PERPETUAL",
    funding_8h: -0.0001,        // → ratePercent -0.01%
    current_funding: -0.00008,
    open_interest: 11_500,
    mark_price: 2_300,
    timestamp: 1_770_000_001_000,
  },
};

function jsonResponse(payload: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

function notOkResponse(status: number) {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // Default: route deribit URLs to canned tickers, fail every other host so a
  // stray request from binance/bybit/okx doesn't pollute the test.
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("deribit.com")) {
      if (url.includes("BTC-PERPETUAL")) return jsonResponse(DERIBIT_BTC_TICKER);
      if (url.includes("ETH-PERPETUAL")) return jsonResponse(DERIBIT_ETH_TICKER);
      return notOkResponse(404);
    }
    return notOkResponse(503);
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("Deribit funding adapter", () => {
  it("translates BTCUSDT shorthand to BTC-PERPETUAL when querying", async () => {
    const rates = await getFundingRates({ exchange: "deribit", symbol: "BTCUSDT" });
    expect(rates).toHaveLength(1);
    const r = rates[0];
    expect(r.exchange).toBe("deribit");
    // Symbol is preserved as Deribit returns it (instrument_name) — not remapped to BTCUSDT.
    expect(r.symbol).toBe("BTC-PERPETUAL");
    // funding_8h = 0.00012 → ratePercent = 0.012% (within float tolerance)
    expect(r.rate).toBeCloseTo(0.00012, 12);
    expect(r.ratePercent).toBeCloseTo(0.012, 12);
    expect(r.ts).toBe(1_770_000_000_000);
    // Continuous funding model: nextFundingTime mirrors ts.
    expect(r.nextFundingTime).toBe(r.ts);
  });

  it("accepts native BTC-PERPETUAL symbol unchanged", async () => {
    const rates = await getFundingRates({ exchange: "deribit", symbol: "BTC-PERPETUAL" });
    expect(rates[0].symbol).toBe("BTC-PERPETUAL");
  });

  it("with no symbol, fetches BTC + ETH defaults", async () => {
    const rates = await getFundingRates({ exchange: "deribit" });
    expect(rates.map((r) => r.symbol).sort()).toEqual(["BTC-PERPETUAL", "ETH-PERPETUAL"]);
    const eth = rates.find((r) => r.symbol === "ETH-PERPETUAL")!;
    expect(eth.ratePercent).toBeCloseTo(-0.01, 12);
  });

  it("contributes to default cross-venue fan-out (binance/bybit/okx down → deribit survives)", async () => {
    // beforeEach already routes non-deribit URLs to 503, so allSettled
    // should keep just deribit's results.
    const rates = await getFundingRates({ symbol: "BTCUSDT" });
    expect(rates.some((r) => r.exchange === "deribit")).toBe(true);
    expect(rates.find((r) => r.exchange === "deribit")?.symbol).toBe("BTC-PERPETUAL");
  });
});

describe("Deribit OI adapter", () => {
  it("maps open_interest (USD) and mark_price → oi (base) + oiUsd", async () => {
    const ois = await getOpenInterest({ exchange: "deribit", symbol: "BTCUSDT" });
    expect(ois).toHaveLength(1);
    const o = ois[0];
    expect(o.exchange).toBe("deribit");
    expect(o.symbol).toBe("BTC-PERPETUAL");
    expect(o.oiUsd).toBe(31_200);
    // 31_200 / 78_000 = 0.4
    expect(o.oi).toBeCloseTo(0.4, 12);
  });

  it("guards against zero mark_price", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        result: {
          instrument_name: "BTC-PERPETUAL",
          funding_8h: 0,
          current_funding: 0,
          open_interest: 100,
          mark_price: 0,           // pathological — shouldn't divide-by-zero
          timestamp: 1,
        },
      }),
    ) as typeof fetch;
    const [o] = await getOpenInterest({ exchange: "deribit", symbol: "BTC-PERPETUAL" });
    expect(o.oi).toBe(0);
    expect(o.oiUsd).toBe(100);
  });
});

// ── OKX coverage — instruments listing → cap-80 fan-out ─────────────────────

describe("OKX funding adapter", () => {
  function buildInstruments(count: number) {
    return {
      code: "0",
      data: Array.from({ length: count }, (_, i) => ({
        instId: `SYM${i}-USDT-SWAP`,
        instType: "SWAP",
        settleCcy: "USDT",
        state: "live",
      })),
    };
  }

  function fundingRateFor(instId: string) {
    return {
      code: "0",
      data: [{
        instId,
        fundingRate: "0.0001",
        nextFundingTime: "1770000010000",
        ts: "1770000000000",
      }],
    };
  }

  beforeEach(() => {
    // 100-instrument listing — adapter must cap to 80
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("okx.com/api/v5/public/instruments")) {
        return jsonResponse(buildInstruments(100));
      }
      if (url.includes("okx.com/api/v5/public/funding-rate?instId=")) {
        const id = url.split("instId=")[1];
        return jsonResponse(fundingRateFor(id));
      }
      return notOkResponse(503);
    }) as typeof fetch;
  });

  it("caps OKX symbol fan-out at 80 instruments per refresh", async () => {
    const rates = await getFundingRates({ exchange: "okx" });
    expect(rates.length).toBe(80);
    expect(rates.every((r) => r.exchange === "okx")).toBe(true);
  });

  it("filters listing to live + USDT-settled SWAPs only", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("okx.com/api/v5/public/instruments")) {
        return jsonResponse({
          code: "0",
          data: [
            { instId: "BTC-USDT-SWAP", instType: "SWAP", settleCcy: "USDT", state: "live" },
            { instId: "BTC-USD-SWAP",  instType: "SWAP", settleCcy: "BTC",  state: "live" },   // wrong settleCcy
            { instId: "DEAD-USDT-SWAP", instType: "SWAP", settleCcy: "USDT", state: "suspend" }, // wrong state
          ],
        });
      }
      if (url.includes("okx.com/api/v5/public/funding-rate?instId=")) {
        const id = url.split("instId=")[1];
        return jsonResponse(fundingRateFor(id));
      }
      return notOkResponse(503);
    }) as typeof fetch;
    const rates = await getFundingRates({ exchange: "okx" });
    expect(rates.map((r) => r.symbol)).toEqual(["BTC-USDT-SWAP"]);
  });

  it("falls back to a default 10-symbol set when the listing call fails", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("okx.com/api/v5/public/instruments")) {
        return notOkResponse(500);
      }
      if (url.includes("okx.com/api/v5/public/funding-rate?instId=")) {
        const id = url.split("instId=")[1];
        return jsonResponse(fundingRateFor(id));
      }
      return notOkResponse(503);
    }) as typeof fetch;
    const rates = await getFundingRates({ exchange: "okx" });
    expect(rates.length).toBe(10);
    expect(rates.find((r) => r.symbol === "BTC-USDT-SWAP")).toBeDefined();
    expect(rates.find((r) => r.symbol === "ETH-USDT-SWAP")).toBeDefined();
  });

  it("translates BTCUSDT shorthand → BTC-USDT-SWAP when symbol is provided", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("okx.com/api/v5/public/funding-rate?instId=BTC-USDT-SWAP")) {
        return jsonResponse(fundingRateFor("BTC-USDT-SWAP"));
      }
      return notOkResponse(404);
    }) as typeof fetch;
    const rates = await getFundingRates({ exchange: "okx", symbol: "BTCUSDT" });
    expect(rates).toHaveLength(1);
    expect(rates[0].symbol).toBe("BTC-USDT-SWAP");
    expect(rates[0].rate).toBe(0.0001);
    expect(rates[0].ratePercent).toBeCloseTo(0.01, 12);
  });

  it("preserves OKX-style instId verbatim when already in canonical form", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("okx.com/api/v5/public/funding-rate?instId=ETH-USDT-SWAP")) {
        return jsonResponse(fundingRateFor("ETH-USDT-SWAP"));
      }
      return notOkResponse(404);
    }) as typeof fetch;
    const rates = await getFundingRates({ exchange: "okx", symbol: "ETH-USDT-SWAP" });
    expect(rates[0].symbol).toBe("ETH-USDT-SWAP");
  });

  it("drops failed per-instrument funding fetches without aborting the batch", async () => {
    let toggle = 0;
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("okx.com/api/v5/public/instruments")) {
        return jsonResponse(buildInstruments(5));
      }
      if (url.includes("okx.com/api/v5/public/funding-rate?instId=")) {
        const id = url.split("instId=")[1];
        toggle++;
        if (toggle === 3) return notOkResponse(503);  // one failure
        return jsonResponse(fundingRateFor(id));
      }
      return notOkResponse(503);
    }) as typeof fetch;
    const rates = await getFundingRates({ exchange: "okx" });
    expect(rates.length).toBe(4);  // 5 - 1 failure
  });
});

// ── Deribit funding — additional coverage ───────────────────────────────────

describe("Deribit funding adapter — extras", () => {
  it("emits ratePercent = rate × 100 with sign preserved", async () => {
    const rates = await getFundingRates({ exchange: "deribit", symbol: "ETHUSDT" });
    expect(rates[0].rate).toBeLessThan(0);
    expect(rates[0].ratePercent).toBeLessThan(0);
    expect(rates[0].ratePercent).toBeCloseTo(rates[0].rate * 100, 12);
  });

  it("strips USD suffix as well as USDT when normalizing instrument name", async () => {
    const rates = await getFundingRates({ exchange: "deribit", symbol: "BTCUSD" });
    expect(rates[0].symbol).toBe("BTC-PERPETUAL");
  });

  it("fan-out yields one entry per default symbol when no symbol is given", async () => {
    const rates = await getFundingRates({ exchange: "deribit" });
    expect(rates).toHaveLength(2);
    expect(new Set(rates.map((r) => r.symbol)))
      .toEqual(new Set(["BTC-PERPETUAL", "ETH-PERPETUAL"]));
  });
});
