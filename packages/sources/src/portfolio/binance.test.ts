import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPortfolio } from "./binance.js";

const ACCOUNT_FIXTURE = {
  updateTime: 1_770_000_000_000,
  balances: [
    { asset: "BTC",   free: "0.5",       locked: "0" },          // 0.5 × 80000 = 40000
    { asset: "ETH",   free: "10",        locked: "0" },          // 10 × 3000  = 30000
    { asset: "SOL",   free: "100",       locked: "0" },          // 100 × 200  = 20000
    { asset: "USDT",  free: "5000",      locked: "0" },          // 5000
    { asset: "LDUSDT", free: "1000",     locked: "0" },          // Earn → 1000 (LD-prefix stripped → USDT stable)
    { asset: "LDBTC",  free: "0.1",      locked: "0" },          // Earn BTC → 0.1 × 80000 = 8000
    { asset: "LDDOGE", free: "100000",   locked: "0" },          // Earn for asset with no USDT pair → undefined usd
    { asset: "ZERO",   free: "0",        locked: "0" },          // dropped (total = 0)
    { asset: "FAKE",   free: "999",      locked: "0" },          // no price match anywhere → no usd
    { asset: "USDC",   free: "200",      locked: "0" },          // stable
  ],
};

const PRICE_FIXTURE = [
  { symbol: "BTCUSDT", price: "80000" },
  { symbol: "ETHUSDT", price: "3000" },
  { symbol: "SOLUSDT", price: "200" },
];

function jsonResponse(payload: unknown) {
  return {
    ok: true, status: 200,
    text: async () => "",
    json: async () => payload,
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.BINANCE_API_KEY = "test-key";
  process.env.BINANCE_API_SECRET = "test-secret";
  globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/v3/account")) return jsonResponse(ACCOUNT_FIXTURE);
    if (url.includes("/api/v3/ticker/price")) return jsonResponse(PRICE_FIXTURE);
    return { ok: false, status: 404, text: async () => "", json: async () => ({}) } as unknown as Response;
  }) as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.BINANCE_API_KEY;
  delete process.env.BINANCE_API_SECRET;
  vi.restoreAllMocks();
});

describe("getPortfolio", () => {
  it("returns null when API keys are absent (opt-in feature)", async () => {
    delete process.env.BINANCE_API_KEY;
    delete process.env.BINANCE_API_SECRET;
    expect(await getPortfolio()).toBeNull();
  });

  it("returns null when only one of the two keys is set", async () => {
    delete process.env.BINANCE_API_SECRET;
    expect(await getPortfolio()).toBeNull();
  });

  it("drops zero-balance entries", async () => {
    const snap = await getPortfolio();
    expect(snap?.balances.find((b) => b.asset === "ZERO")).toBeUndefined();
  });

  it("treats stablecoins as 1:1 USD", async () => {
    const snap = await getPortfolio();
    const usdt = snap?.balances.find((b) => b.asset === "USDT");
    expect(usdt?.usdValue).toBe(5000);
    const usdc = snap?.balances.find((b) => b.asset === "USDC");
    expect(usdc?.usdValue).toBe(200);
  });

  it("treats LD-prefixed Earn stablecoins as 1:1 USD via underlying lookup", async () => {
    const snap = await getPortfolio();
    const ldusdt = snap?.balances.find((b) => b.asset === "LDUSDT");
    expect(ldusdt?.usdValue).toBe(1000);
    expect(ldusdt?.total).toBe(1000);
    expect(ldusdt?.asset).toBe("LDUSDT");  // asset name preserved, not rewritten
  });

  it("prices LD-prefixed Earn non-stables via the underlying USDT pair", async () => {
    const snap = await getPortfolio();
    const ldbtc = snap?.balances.find((b) => b.asset === "LDBTC");
    // 0.1 × 80000 = 8000 (BTC's USDT price applies to LDBTC)
    expect(ldbtc?.usdValue).toBe(8000);
  });

  it("leaves usdValue undefined when no USDT/BUSD/USDC pair exists", async () => {
    const snap = await getPortfolio();
    const fake = snap?.balances.find((b) => b.asset === "FAKE");
    expect(fake?.usdValue).toBeUndefined();
    const lddoge = snap?.balances.find((b) => b.asset === "LDDOGE");
    expect(lddoge?.usdValue).toBeUndefined();
  });

  it("computes totalUsd as the sum of priced balances only", async () => {
    const snap = await getPortfolio();
    // 40000 + 30000 + 20000 + 5000 + 1000 + 8000 + 200 = 104200
    // FAKE + LDDOGE are unpriced → not counted
    expect(snap?.totalUsd).toBe(104_200);
  });

  it("sums free + locked into total", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v3/account")) {
        return jsonResponse({
          updateTime: 1,
          balances: [{ asset: "BTC", free: "0.3", locked: "0.2" }],
        });
      }
      if (url.includes("/api/v3/ticker/price")) return jsonResponse(PRICE_FIXTURE);
      return jsonResponse({});
    }) as typeof fetch;
    const snap = await getPortfolio();
    expect(snap?.balances[0].total).toBe(0.5);
    expect(snap?.balances[0].free).toBe(0.3);
    expect(snap?.balances[0].locked).toBe(0.2);
  });

  it("sorts balances by usdValue descending", async () => {
    const snap = await getPortfolio();
    const usdValues = snap!.balances.map((b) => b.usdValue ?? 0);
    for (let i = 1; i < usdValues.length; i++) {
      expect(usdValues[i - 1]).toBeGreaterThanOrEqual(usdValues[i]);
    }
    expect(snap!.balances[0].asset).toBe("BTC"); // 40000 highest
  });

  it("uses Binance updateTime as the snapshot timestamp", async () => {
    const snap = await getPortfolio();
    expect(snap?.ts).toBe(1_770_000_000_000);
    expect(snap?.source).toBe("binance");
  });

  it("throws on a Binance auth failure (401)", async () => {
    globalThis.fetch = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/api/v3/account")) {
        return {
          ok: false, status: 401,
          text: async () => '{"code":-2014,"msg":"API-key format invalid."}',
          json: async () => ({}),
        } as unknown as Response;
      }
      return jsonResponse({});
    }) as typeof fetch;
    await expect(getPortfolio()).rejects.toThrow(/Binance account error 401/);
  });

  it("signs the request with HMAC-SHA256 of the query string", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      // Capture API key header on the signed request
      if (url.includes("/api/v3/account")) {
        const apiKey = (init?.headers as Record<string, string>)?.["X-MBX-APIKEY"];
        expect(apiKey).toBe("test-key");
        expect(url).toContain("signature=");
        expect(url).toContain("timestamp=");
        expect(url).toContain("recvWindow=10000");
        return jsonResponse(ACCOUNT_FIXTURE);
      }
      if (url.includes("/api/v3/ticker/price")) return jsonResponse(PRICE_FIXTURE);
      return jsonResponse({});
    }) as typeof fetch;
    await getPortfolio();
    expect(calls.some((u) => u.includes("/api/v3/account"))).toBe(true);
  });
});
