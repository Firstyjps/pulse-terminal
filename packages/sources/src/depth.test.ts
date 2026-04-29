import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDepth } from "./depth.js";

const originalFetch = globalThis.fetch;

beforeEach(() => {
  // No hub by default — exercises the REST fallback
  process.env.PULSE_HUB_URL = "http://127.0.0.1:65535"; // unbindable
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

describe("getDepth", () => {
  it("falls back to Binance REST when hub unreachable + parses bids/asks", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("65535")) throw new Error("ECONNREFUSED");
      if (u.startsWith("https://api.binance.com/api/v3/depth")) {
        return new Response(
          JSON.stringify({
            lastUpdateId: 1,
            bids: [["100.5", "1.5"], ["100.4", "2.0"]],
            asks: [["100.6", "0.8"], ["100.7", "3.2"]],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`unexpected url ${u}`);
    }) as typeof fetch;

    const book = await getDepth("BTCUSDT", 20);
    expect(book.symbol).toBe("BTCUSDT");
    expect(book.bids).toEqual([[100.5, 1.5], [100.4, 2.0]]);
    expect(book.asks).toEqual([[100.6, 0.8], [100.7, 3.2]]);
    expect(typeof book.ts).toBe("number");
  });

  it("uses hub when reachable and skips Binance REST", async () => {
    process.env.PULSE_HUB_URL = "http://hub-mock.local";
    const restCalls: string[] = [];
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      restCalls.push(u);
      if (u.includes("hub-mock.local")) {
        return new Response(
          JSON.stringify({
            symbol: "ETHUSDT",
            bids: [[2500.5, 1.0]],
            asks: [[2500.6, 1.0]],
            ts: 1234567890,
          }),
          { status: 200 },
        );
      }
      throw new Error(`unexpected ${u}`);
    }) as typeof fetch;

    const book = await getDepth("ETHUSDT");
    expect(book.symbol).toBe("ETHUSDT");
    expect(book.ts).toBe(1234567890);
    expect(restCalls.every((u) => !u.includes("api.binance.com"))).toBe(true);
  });

  it("uppercases the symbol", async () => {
    globalThis.fetch = vi.fn(async (url) => {
      const u = String(url);
      if (u.includes("hub")) throw new Error("no hub");
      expect(u).toContain("symbol=BTCUSDT");
      return new Response(JSON.stringify({ lastUpdateId: 1, bids: [], asks: [] }), { status: 200 });
    }) as typeof fetch;
    await getDepth("btcusdt");
  });
});
