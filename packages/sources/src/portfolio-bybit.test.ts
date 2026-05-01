import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { getBybitPortfolio } from "./portfolio-bybit.js";

const FROZEN_TIME = 1_700_000_000_000;

const WALLET_FIXTURE = {
  retCode: 0,
  retMsg: "OK",
  result: {
    list: [
      {
        accountType: "UNIFIED",
        totalEquity: "100000",
        totalAvailableBalance: "50000",
        coin: [
          { coin: "BTC",  equity: "0.5",   walletBalance: "0.5",   free: "0.5",   locked: "0", usdValue: "40000" },
          { coin: "ETH",  equity: "10",    walletBalance: "10",    free: "10",    locked: "0", usdValue: "30000" },
          { coin: "USDT", equity: "30000", walletBalance: "30000", free: "30000", locked: "0", usdValue: "30000" },
          { coin: "ZERO", equity: "0",     walletBalance: "0",     free: "0",     locked: "0", usdValue: "0" },
        ],
      },
    ],
  },
};

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

beforeEach(() => {
  process.env.BYBIT_API_KEY = "TEST_BYBIT_KEY";
  process.env.BYBIT_API_SECRET = "TEST_BYBIT_SECRET";
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME);
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  delete process.env.BYBIT_API_KEY;
  delete process.env.BYBIT_API_SECRET;
  vi.restoreAllMocks();
});

describe("getBybitPortfolio — env / opt-in", () => {
  it("returns null when no API keys are set", async () => {
    delete process.env.BYBIT_API_KEY;
    delete process.env.BYBIT_API_SECRET;
    expect(await getBybitPortfolio()).toBeNull();
  });

  it("returns null when only API key is set (missing secret)", async () => {
    delete process.env.BYBIT_API_SECRET;
    expect(await getBybitPortfolio()).toBeNull();
  });

  it("returns null when only API secret is set (missing key)", async () => {
    delete process.env.BYBIT_API_KEY;
    expect(await getBybitPortfolio()).toBeNull();
  });
});

describe("getBybitPortfolio — signature", () => {
  it("signs as HMAC-SHA256(secret, ts + apiKey + recvWindow + query) hex", async () => {
    let capturedSig = "";
    let capturedTs = "";
    globalThis.fetch = vi.fn(async (_input, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      capturedSig = headers["X-BAPI-SIGN"];
      capturedTs = headers["X-BAPI-TIMESTAMP"];
      return jsonResponse(WALLET_FIXTURE);
    }) as typeof fetch;

    await getBybitPortfolio();

    const expectedPrehash = `${FROZEN_TIME}TEST_BYBIT_KEY10000accountType=UNIFIED`;
    const expected = createHmac("sha256", "TEST_BYBIT_SECRET").update(expectedPrehash).digest("hex");
    expect(capturedTs).toBe(String(FROZEN_TIME));
    expect(capturedSig).toBe(expected);
    expect(capturedSig).toMatch(/^[a-f0-9]{64}$/);
  });

  it("sends all four required Bybit V5 auth headers", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    globalThis.fetch = vi.fn(async (_input, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return jsonResponse(WALLET_FIXTURE);
    }) as typeof fetch;

    await getBybitPortfolio();

    expect(capturedHeaders!["X-BAPI-API-KEY"]).toBe("TEST_BYBIT_KEY");
    expect(capturedHeaders!["X-BAPI-RECV-WINDOW"]).toBe("10000");
    expect(capturedHeaders!["X-BAPI-TIMESTAMP"]).toBe(String(FROZEN_TIME));
    expect(typeof capturedHeaders!["X-BAPI-SIGN"]).toBe("string");
  });

  it("hits the V5 wallet-balance URL with accountType=UNIFIED", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn(async (input) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return jsonResponse(WALLET_FIXTURE);
    }) as typeof fetch;

    await getBybitPortfolio();

    expect(capturedUrl).toBe("https://api.bybit.com/v5/account/wallet-balance?accountType=UNIFIED");
  });

  it("emits a different timestamp + signature on rapid sequential calls", async () => {
    const sigs: string[] = [];
    const timestamps: string[] = [];
    globalThis.fetch = vi.fn(async (_input, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      sigs.push(headers["X-BAPI-SIGN"]);
      timestamps.push(headers["X-BAPI-TIMESTAMP"]);
      return jsonResponse(WALLET_FIXTURE);
    }) as typeof fetch;

    await getBybitPortfolio();
    vi.setSystemTime(FROZEN_TIME + 1);
    await getBybitPortfolio();
    vi.setSystemTime(FROZEN_TIME + 2);
    await getBybitPortfolio();

    expect(new Set(timestamps).size).toBe(3);
    expect(new Set(sigs).size).toBe(3);
  });
});

describe("getBybitPortfolio — parsing", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => jsonResponse(WALLET_FIXTURE)) as typeof fetch;
  });

  it("parses balances with usdValue from response", async () => {
    const snap = await getBybitPortfolio();
    expect(snap?.source).toBe("bybit");
    const btc = snap?.balances.find((b) => b.asset === "BTC");
    expect(btc?.total).toBe(0.5);
    expect(btc?.free).toBe(0.5);
    expect(btc?.usdValue).toBe(40_000);
  });

  it("uses totalEquity for totalUsd (no client-side sum)", async () => {
    const snap = await getBybitPortfolio();
    expect(snap?.totalUsd).toBe(100_000);
  });

  it("drops zero-balance entries", async () => {
    const snap = await getBybitPortfolio();
    expect(snap?.balances.find((b) => b.asset === "ZERO")).toBeUndefined();
  });

  it("sorts balances by usdValue descending", async () => {
    const snap = await getBybitPortfolio();
    const usd = snap!.balances.map((b) => b.usdValue ?? 0);
    for (let i = 1; i < usd.length; i++) {
      expect(usd[i - 1]).toBeGreaterThanOrEqual(usd[i]);
    }
    expect(snap!.balances[0].asset).toBe("BTC");
  });

  it("returns empty snapshot when result.list is empty", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ retCode: 0, retMsg: "OK", result: { list: [] } }),
    ) as typeof fetch;
    const snap = await getBybitPortfolio();
    expect(snap?.balances).toEqual([]);
    expect(snap?.totalUsd).toBe(0);
    expect(snap?.source).toBe("bybit");
  });

  it("leaves usdValue undefined when API returns usdValue '0'", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        retCode: 0,
        retMsg: "OK",
        result: {
          list: [
            {
              accountType: "UNIFIED",
              totalEquity: "100",
              totalAvailableBalance: "100",
              coin: [
                { coin: "DOGE", equity: "100", walletBalance: "100", free: "100", locked: "0", usdValue: "0" },
              ],
            },
          ],
        },
      }),
    ) as typeof fetch;
    const snap = await getBybitPortfolio();
    const doge = snap?.balances.find((b) => b.asset === "DOGE");
    expect(doge?.usdValue).toBeUndefined();
    expect(doge?.total).toBe(100);
  });
});

describe("getBybitPortfolio — error handling", () => {
  it("throws when HTTP status is non-2xx, including body excerpt", async () => {
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: false,
        status: 401,
        text: async () => "invalid signature",
        json: async () => ({}),
      }) as unknown as Response,
    ) as typeof fetch;
    await expect(getBybitPortfolio()).rejects.toThrow(/Bybit account error 401.*invalid signature/);
  });

  it("throws when retCode !== 0", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ retCode: 10003, retMsg: "API key invalid", result: { list: [] } }),
    ) as typeof fetch;
    await expect(getBybitPortfolio()).rejects.toThrow(/Bybit retCode 10003: API key invalid/);
  });

  it("propagates malformed JSON parse errors", async () => {
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: true,
        status: 200,
        text: async () => "<!doctype html>",
        json: async () => {
          throw new SyntaxError("Unexpected token <");
        },
      }) as unknown as Response,
    ) as typeof fetch;
    await expect(getBybitPortfolio()).rejects.toThrow(/Unexpected token/);
  });
});
