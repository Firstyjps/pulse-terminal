import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { getOkxPortfolio } from "./okx.js";

const FROZEN_TIME = new Date("2024-01-15T12:00:00.000Z");

const BALANCE_FIXTURE = {
  code: "0",
  msg: "",
  data: [
    {
      totalEq: "100000",
      details: [
        { ccy: "BTC",  eq: "0.5",   cashBal: "0.5",   availBal: "0.5",   frozenBal: "0", eqUsd: "40000" },
        { ccy: "ETH",  eq: "10",    cashBal: "10",    availBal: "10",    frozenBal: "0", eqUsd: "30000" },
        { ccy: "USDT", eq: "30000", cashBal: "30000", availBal: "30000", frozenBal: "0", eqUsd: "30000" },
        { ccy: "ZERO", eq: "0",     cashBal: "0",     availBal: "0",     frozenBal: "0", eqUsd: "0" },
      ],
    },
  ],
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
  process.env.OKX_API_KEY = "TEST_OKX_KEY";
  process.env.OKX_API_SECRET = "TEST_OKX_SECRET";
  process.env.OKX_API_PASSPHRASE = "TEST_OKX_PASS";
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_TIME);
});

afterEach(() => {
  vi.useRealTimers();
  globalThis.fetch = originalFetch;
  delete process.env.OKX_API_KEY;
  delete process.env.OKX_API_SECRET;
  delete process.env.OKX_API_PASSPHRASE;
  vi.restoreAllMocks();
});

describe("getOkxPortfolio — env / opt-in", () => {
  it("returns null when none of the three creds are set", async () => {
    delete process.env.OKX_API_KEY;
    delete process.env.OKX_API_SECRET;
    delete process.env.OKX_API_PASSPHRASE;
    expect(await getOkxPortfolio()).toBeNull();
  });

  it("returns null when API key is missing", async () => {
    delete process.env.OKX_API_KEY;
    expect(await getOkxPortfolio()).toBeNull();
  });

  it("returns null when secret is missing", async () => {
    delete process.env.OKX_API_SECRET;
    expect(await getOkxPortfolio()).toBeNull();
  });

  it("returns null when passphrase is missing (OKX-specific 3rd cred)", async () => {
    delete process.env.OKX_API_PASSPHRASE;
    expect(await getOkxPortfolio()).toBeNull();
  });
});

describe("getOkxPortfolio — signature", () => {
  it("signs as base64(HMAC-SHA256(secret, ts + 'GET' + path + body)) per OKX V5 spec", async () => {
    let capturedSig = "";
    let capturedTs = "";
    globalThis.fetch = vi.fn(async (_input, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      capturedSig = headers["OK-ACCESS-SIGN"];
      capturedTs = headers["OK-ACCESS-TIMESTAMP"];
      return jsonResponse(BALANCE_FIXTURE);
    }) as typeof fetch;

    await getOkxPortfolio();

    const expectedTs = FROZEN_TIME.toISOString();
    const prehash = `${expectedTs}GET/api/v5/account/balance`;
    const expected = createHmac("sha256", "TEST_OKX_SECRET").update(prehash).digest("base64");
    expect(capturedTs).toBe(expectedTs);
    expect(capturedSig).toBe(expected);
  });

  it("uses ISO 8601 timestamp (not epoch ms like Bybit)", async () => {
    let capturedTs = "";
    globalThis.fetch = vi.fn(async (_input, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      capturedTs = headers["OK-ACCESS-TIMESTAMP"];
      return jsonResponse(BALANCE_FIXTURE);
    }) as typeof fetch;

    await getOkxPortfolio();
    expect(capturedTs).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });

  it("sends all OKX V5 auth headers + JSON content-type", async () => {
    let capturedHeaders: Record<string, string> | undefined;
    globalThis.fetch = vi.fn(async (_input, init?: RequestInit) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return jsonResponse(BALANCE_FIXTURE);
    }) as typeof fetch;

    await getOkxPortfolio();

    expect(capturedHeaders!["OK-ACCESS-KEY"]).toBe("TEST_OKX_KEY");
    expect(capturedHeaders!["OK-ACCESS-PASSPHRASE"]).toBe("TEST_OKX_PASS");
    expect(capturedHeaders!["OK-ACCESS-TIMESTAMP"]).toBe(FROZEN_TIME.toISOString());
    expect(capturedHeaders!["Content-Type"]).toBe("application/json");
    expect(capturedHeaders!["OK-ACCESS-SIGN"]).toMatch(/^[A-Za-z0-9+/]+=*$/);
  });

  it("hits the V5 balance URL", async () => {
    let capturedUrl = "";
    globalThis.fetch = vi.fn(async (input) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return jsonResponse(BALANCE_FIXTURE);
    }) as typeof fetch;

    await getOkxPortfolio();

    expect(capturedUrl).toBe("https://www.okx.com/api/v5/account/balance");
  });

  it("emits a different ISO timestamp + signature on rapid sequential calls", async () => {
    const sigs: string[] = [];
    const timestamps: string[] = [];
    globalThis.fetch = vi.fn(async (_input, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>;
      sigs.push(headers["OK-ACCESS-SIGN"]);
      timestamps.push(headers["OK-ACCESS-TIMESTAMP"]);
      return jsonResponse(BALANCE_FIXTURE);
    }) as typeof fetch;

    await getOkxPortfolio();
    vi.setSystemTime(new Date(FROZEN_TIME.getTime() + 1000));
    await getOkxPortfolio();
    vi.setSystemTime(new Date(FROZEN_TIME.getTime() + 2000));
    await getOkxPortfolio();

    expect(new Set(timestamps).size).toBe(3);
    expect(new Set(sigs).size).toBe(3);
  });
});

describe("getOkxPortfolio — parsing", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async () => jsonResponse(BALANCE_FIXTURE)) as typeof fetch;
  });

  it("parses balances with eqUsd", async () => {
    const snap = await getOkxPortfolio();
    expect(snap?.source).toBe("okx");
    const btc = snap?.balances.find((b) => b.asset === "BTC");
    expect(btc?.total).toBe(0.5);
    expect(btc?.usdValue).toBe(40_000);
  });

  it("uses totalEq for totalUsd", async () => {
    const snap = await getOkxPortfolio();
    expect(snap?.totalUsd).toBe(100_000);
  });

  it("drops zero-balance entries", async () => {
    const snap = await getOkxPortfolio();
    expect(snap?.balances.find((b) => b.asset === "ZERO")).toBeUndefined();
  });

  it("sorts by usdValue descending", async () => {
    const snap = await getOkxPortfolio();
    const usd = snap!.balances.map((b) => b.usdValue ?? 0);
    for (let i = 1; i < usd.length; i++) {
      expect(usd[i - 1]).toBeGreaterThanOrEqual(usd[i]);
    }
    expect(snap!.balances[0].asset).toBe("BTC");
  });

  it("returns empty snapshot when data is empty", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: "0", msg: "", data: [] }),
    ) as typeof fetch;
    const snap = await getOkxPortfolio();
    expect(snap?.balances).toEqual([]);
    expect(snap?.totalUsd).toBe(0);
    expect(snap?.source).toBe("okx");
  });

  it("splits free vs locked from availBal/frozenBal", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({
        code: "0",
        msg: "",
        data: [
          {
            totalEq: "1000",
            details: [
              { ccy: "BTC", eq: "1", cashBal: "1", availBal: "0.7", frozenBal: "0.3", eqUsd: "80000" },
            ],
          },
        ],
      }),
    ) as typeof fetch;
    const snap = await getOkxPortfolio();
    expect(snap?.balances[0].free).toBe(0.7);
    expect(snap?.balances[0].locked).toBe(0.3);
    expect(snap?.balances[0].total).toBe(1);
  });
});

describe("getOkxPortfolio — error handling", () => {
  it("throws on HTTP non-2xx with response body excerpt in message", async () => {
    globalThis.fetch = vi.fn(async () =>
      ({
        ok: false,
        status: 401,
        text: async () => "Unauthorized",
        json: async () => ({}),
      }) as unknown as Response,
    ) as typeof fetch;
    await expect(getOkxPortfolio()).rejects.toThrow(/OKX account error 401.*Unauthorized/);
  });

  it("throws when body code !== '0' (note: string code, not number)", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: "50111", msg: "Invalid OK-ACCESS-KEY", data: [] }),
    ) as typeof fetch;
    await expect(getOkxPortfolio()).rejects.toThrow(/OKX code 50111: Invalid OK-ACCESS-KEY/);
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
    await expect(getOkxPortfolio()).rejects.toThrow(/Unexpected token/);
  });
});
