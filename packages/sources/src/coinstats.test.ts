import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getCoinStatsPortfolio, _internal } from "./coinstats.js";

const ORIGINAL_KEY = process.env.COINSTATS_API_KEY;

beforeEach(() => {
  vi.restoreAllMocks();
  process.env.COINSTATS_API_KEY = "test-key-1234ABCD";
});

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.COINSTATS_API_KEY;
  else process.env.COINSTATS_API_KEY = ORIGINAL_KEY;
});

function jsonResponse(body: unknown, init: Partial<Response> = {}): Response {
  return {
    ok: true,
    status: 200,
    json: async () => body,
    text: async () => JSON.stringify(body),
    ...init,
  } as Response;
}

describe("maskKey", () => {
  it("masks all but last 4 chars", () => {
    expect(_internal.maskKey("aaaaaaaaXYZ8")).toBe("…XYZ8");
    expect(_internal.maskKey("ab")).toBe("****");
    expect(_internal.maskKey("")).toBe("(unset)");
  });
});

describe("getCoinStatsPortfolio — env handling", () => {
  it("returns null when COINSTATS_API_KEY is unset", async () => {
    delete process.env.COINSTATS_API_KEY;
    const out = await getCoinStatsPortfolio();
    expect(out).toBeNull();
  });
});

describe("getCoinStatsPortfolio — request shape", () => {
  it("calls /portfolio/coins + /portfolio/value with X-API-KEY header", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/portfolio/coins")) return jsonResponse({ result: [] });
      if (u.includes("/portfolio/value")) return jsonResponse({ totalValue: 0 });
      throw new Error(`unexpected ${u}`);
    });

    await getCoinStatsPortfolio();

    const calls = fetchSpy.mock.calls;
    expect(calls).toHaveLength(2);
    const urls = calls.map((c) => String(c[0])).sort();
    expect(urls[0]).toContain("openapiv1.coinstats.app/portfolio/coins?currency=USD");
    expect(urls[1]).toContain("openapiv1.coinstats.app/portfolio/value?currency=USD");

    for (const [, init] of calls) {
      const headers = (init as RequestInit).headers as Record<string, string>;
      expect(headers["X-API-KEY"]).toBe("test-key-1234ABCD");
      expect(headers.accept).toBe("application/json");
    }
  });

  it("masks the API key in error messages on HTTP failure", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => ({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as Response));

    await expect(getCoinStatsPortfolio()).rejects.toThrow(/key …ABCD/);
    await expect(getCoinStatsPortfolio()).rejects.not.toThrow(/test-key-1234/);
  });
});

describe("getCoinStatsPortfolio — parse + aggregate", () => {
  it("returns populated:false when API key is set but no holdings", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/portfolio/coins")) return jsonResponse({ result: [] });
      return jsonResponse({ totalValue: 0 });
    });

    const out = await getCoinStatsPortfolio();
    expect(out).not.toBeNull();
    expect(out!.populated).toBe(false);
    expect(out!.totalUsd).toBe(0);
    expect(out!.assets).toEqual([]);
    expect(out!._source).toBe("coinstats");
  });

  it("parses per-coin holdings and sorts by usdValue desc", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/portfolio/coins")) {
        return jsonResponse({
          result: [
            { symbol: "ETH", name: "Ethereum", count: 5.38, price: 3000, totalValue: 16140, priceChange1d: 1.2 },
            { symbol: "USDC", name: "USD Coin", count: 8000, price: 1, totalValue: 8000, priceChange1d: 0 },
            { symbol: "SOL", name: "Solana", count: 50, price: 140, totalValue: 7000, priceChange1d: 3.5, exchange: "Binance" },
            { symbol: "ZERO", count: 0, price: 1, totalValue: 0 }, // filtered out (zero amount)
          ],
        });
      }
      return jsonResponse({
        totalValue: 31140,
        unrealizedProfitLoss: 1500,
        unrealizedProfitLossPercent: 5.0,
      });
    });

    const out = await getCoinStatsPortfolio();
    expect(out!.populated).toBe(true);
    expect(out!.totalUsd).toBe(31140);
    expect(out!.assets).toHaveLength(3);
    expect(out!.assets[0].symbol).toBe("ETH");
    expect(out!.assets[0].usdValue).toBe(16140);
    expect(out!.assets[2].symbol).toBe("SOL");
    expect(out!.assets[2].venue).toBe("Binance");
  });

  it("derives change24hUsd from per-asset % when value endpoint omits it", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/portfolio/coins")) {
        return jsonResponse({
          result: [
            { symbol: "BTC", count: 1, price: 80000, totalValue: 80000, priceChange1d: 10 }, // +10% means +$7272.7 over yesterday
          ],
        });
      }
      return jsonResponse({ totalValue: 80000 });
    });

    const out = await getCoinStatsPortfolio();
    expect(out!.change24hUsd).toBeCloseTo(80000 - 80000 / 1.1, 1);
  });

  it("falls back to summing assets when /portfolio/value totalValue is 0", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/portfolio/coins")) {
        return jsonResponse({
          result: [
            { symbol: "BTC", count: 0.5, price: 80000, totalValue: 40000, priceChange1d: 0 },
            { symbol: "ETH", count: 2,   price: 3000,  totalValue: 6000,  priceChange1d: 0 },
          ],
        });
      }
      return jsonResponse({ totalValue: 0 }); // weird empty value response
    });

    const out = await getCoinStatsPortfolio();
    expect(out!.totalUsd).toBe(46000);
  });

  it("handles 'amount' field instead of 'count' (CoinStats schema variation)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const u = String(url);
      if (u.includes("/portfolio/coins")) {
        return jsonResponse({
          result: [
            { symbol: "XRP", amount: 1000, priceUsd: 0.5, priceChange24h: -1.5 }, // no totalValue
          ],
        });
      }
      return jsonResponse({});
    });

    const out = await getCoinStatsPortfolio();
    expect(out!.assets[0].symbol).toBe("XRP");
    expect(out!.assets[0].amount).toBe(1000);
    expect(out!.assets[0].priceUsd).toBe(0.5);
    expect(out!.assets[0].usdValue).toBe(500);
    expect(out!.assets[0].change24h).toBe(-1.5);
  });
});
