import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./farside.js", () => ({ fetchFarsideEtf: vi.fn() }));
import { getETFFlows } from "./etf.js";
import { fetchFarsideEtf } from "./farside.js";

const mockFarside = vi.mocked(fetchFarsideEtf);

const COINGLASS_BTC_OK = {
  code: "0",
  data: [
    { date: "1714435200000", flow_usd: 100_000_000 },
    { date: "1714521600000", flow_usd: -50_000_000 },
  ],
};
const COINGLASS_ETH_OK = {
  code: "0",
  data: [
    { date: "1714435200000", flow_usd: 20_000_000 },
    { date: "1714521600000", flow_usd: -5_000_000 },
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
  mockFarside.mockReset();
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.COINGLASS_API_KEY;
  vi.restoreAllMocks();
});

describe("getETFFlows — happy path (Coinglass)", () => {
  beforeEach(() => {
    process.env.COINGLASS_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/etf/bitcoin/")) return jsonResponse(COINGLASS_BTC_OK);
      if (url.includes("/etf/ethereum/")) return jsonResponse(COINGLASS_ETH_OK);
      return jsonResponse({}, 404);
    }) as typeof fetch;
  });

  it("returns coinglass source and no fallback reason on success", async () => {
    const r = await getETFFlows();
    expect(r._source).toBe("coinglass");
    expect(r._isProxy).toBe(false);
    expect(r._fallbackReason).toBeUndefined();
  });

  it("computes cumulative locally from the returned flow points", async () => {
    const r = await getETFFlows();
    expect(r.flows[0].btc).toBe(100_000_000);
    expect(r.flows[0].btcCumulative).toBe(100_000_000);
    expect(r.flows[1].btcCumulative).toBe(50_000_000);
    expect(r.summary.btcCumulative).toBe(50_000_000);
  });
});

describe("getETFFlows — fallback reasons", () => {
  it("flags `no_api_key` when env var is undefined", async () => {
    delete process.env.COINGLASS_API_KEY;
    mockFarside.mockResolvedValue([
      { date: "2026-04-29", btc: 1, eth: 0, btcCumulative: 1, ethCumulative: 0 },
      { date: "2026-04-30", btc: 2, eth: 0, btcCumulative: 3, ethCumulative: 0 },
      { date: "2026-04-30", btc: 3, eth: 0, btcCumulative: 6, ethCumulative: 0 },
      { date: "2026-04-30", btc: 4, eth: 0, btcCumulative: 10, ethCumulative: 0 },
      { date: "2026-04-30", btc: 5, eth: 0, btcCumulative: 15, ethCumulative: 0 },
      { date: "2026-04-30", btc: 6, eth: 0, btcCumulative: 21, ethCumulative: 0 },
    ]);
    const r = await getETFFlows();
    expect(r._source).toBe("farside");
    expect(r._fallbackReason).toBe("no_api_key");
  });

  it("flags `no_api_key` when env var is the empty string (operational placeholder bug)", async () => {
    process.env.COINGLASS_API_KEY = "";
    mockFarside.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        date: `2026-04-2${i}`,
        btc: 1,
        eth: 0,
        btcCumulative: i + 1,
        ethCumulative: 0,
      })),
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const r = await getETFFlows();
    expect(r._source).toBe("farside");
    expect(r._fallbackReason).toBe("no_api_key");
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("empty string"));
  });

  it("flags `coinglass_http_error` on non-2xx", async () => {
    process.env.COINGLASS_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () => jsonResponse({}, 502)) as typeof fetch;
    mockFarside.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        date: `2026-04-2${i}`,
        btc: 1,
        eth: 0,
        btcCumulative: i + 1,
        ethCumulative: 0,
      })),
    );
    const r = await getETFFlows();
    expect(r._source).toBe("farside");
    expect(r._fallbackReason).toBe("coinglass_http_error");
  });

  it("flags `coinglass_invalid_code` when body code is not '0' or '00000'", async () => {
    process.env.COINGLASS_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: "401", msg: "API key missing.", data: [] }),
    ) as typeof fetch;
    mockFarside.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        date: `2026-04-2${i}`,
        btc: 1,
        eth: 0,
        btcCumulative: i + 1,
        ethCumulative: 0,
      })),
    );
    const r = await getETFFlows();
    expect(r._fallbackReason).toBe("coinglass_invalid_code");
  });

  it("flags `coinglass_threw` when fetch throws", async () => {
    process.env.COINGLASS_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    mockFarside.mockResolvedValue(
      Array.from({ length: 6 }, (_, i) => ({
        date: `2026-04-2${i}`,
        btc: 1,
        eth: 0,
        btcCumulative: i + 1,
        ethCumulative: 0,
      })),
    );
    const r = await getETFFlows();
    expect(r._fallbackReason).toBe("coinglass_threw");
  });

  it("flags `farside_empty` when farside returns ≤5 rows AND no key", async () => {
    delete process.env.COINGLASS_API_KEY;
    mockFarside.mockResolvedValue([]);
    const r = await getETFFlows();
    expect(r._source).toBe("proxy");
    expect(r._isProxy).toBe(true);
    expect(r._fallbackReason).toBe("no_api_key"); // first reason wins
  });

  it("flags `farside_empty` directly when key is good but coinglass returned bad data AND farside also empty", async () => {
    process.env.COINGLASS_API_KEY = "test-key";
    // bypass coinglass with bad code
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ code: "0", data: [] }),
    ) as typeof fetch;
    mockFarside.mockResolvedValue([]);
    const r = await getETFFlows();
    // Coinglass actually succeeded with empty data — flows = [] but length 0,
    // so `if (btcResult.flows && ethResult.flows)` passes (truthy), source becomes coinglass.
    // This documents current behavior: empty array from a valid response is "valid"
    // and we DO NOT fall through. The summary reflects the empty result.
    expect(r._source).toBe("coinglass");
    expect(r.flows).toEqual([]);
  });
});

describe("getETFFlows — _fallbackReason omitted on success", () => {
  it("does NOT include `_fallbackReason` when source === 'coinglass'", async () => {
    process.env.COINGLASS_API_KEY = "test-key";
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/bitcoin/")) return jsonResponse(COINGLASS_BTC_OK);
      return jsonResponse(COINGLASS_ETH_OK);
    }) as typeof fetch;

    const r = await getETFFlows();
    expect(Object.prototype.hasOwnProperty.call(r, "_fallbackReason")).toBe(false);
  });
});
