import { afterEach, describe, expect, it, vi } from "vitest";
import { getWhaleFlow } from "./whale-flow.js";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

function mockFetch(handler: (url: string) => Response | Promise<Response>) {
  globalThis.fetch = vi.fn((url: string | URL | Request) =>
    Promise.resolve(handler(String(url))),
  ) as typeof fetch;
}

describe("getWhaleFlow", () => {
  it("returns shape with transfers + sources arrays", async () => {
    mockFetch((url) => {
      if (url.includes("simple/price"))
        return new Response(JSON.stringify({ bitcoin: { usd: 70000 } }), { status: 200 });
      if (url.includes("etherscan.io"))
        return new Response(JSON.stringify({ status: "1", result: [] }), { status: 200 });
      if (url.includes("mempool.space/api/blocks/tip/hash"))
        return new Response(JSON.stringify("0xdeadbeef"), { status: 200 });
      if (url.includes("mempool.space/api/block/"))
        return new Response(JSON.stringify([]), { status: 200 });
      return new Response("not mocked", { status: 500 });
    });

    const out = await getWhaleFlow();
    expect(Array.isArray(out.transfers)).toBe(true);
    expect(Array.isArray(out.sources.ok)).toBe(true);
    expect(Array.isArray(out.sources.fail)).toBe(true);
    expect(typeof out.ts).toBe("number");
  });

  it("filters Etherscan USDT transfers below WHALE_FLOW_MIN_USD threshold", async () => {
    process.env.WHALE_FLOW_MIN_USD = "5000000";
    // re-import to pick up env (whale-flow caches threshold at module load)
    vi.resetModules();
    const { getWhaleFlow: refreshed } = await import("./whale-flow.js");

    mockFetch((url) => {
      if (url.includes("simple/price"))
        return new Response(JSON.stringify({ bitcoin: { usd: 70000 } }), { status: 200 });
      if (url.includes("etherscan.io")) {
        return new Response(
          JSON.stringify({
            status: "1",
            result: [
              {
                hash: "0xsmall",
                from: "0xaaa",
                to: "0xbbb",
                value: "1000000000000", // 1M tokens (with 6 decimals)
                tokenDecimal: "6",
                tokenSymbol: "USDT",
                contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
                timeStamp: "1700000000",
              },
              {
                hash: "0xbig",
                from: "0xccc",
                to: "0xddd",
                value: "10000000000000", // 10M tokens
                tokenDecimal: "6",
                tokenSymbol: "USDT",
                contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
                timeStamp: "1700000100",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("mempool.space/api/blocks/tip/hash"))
        return new Response(JSON.stringify("0xdeadbeef"), { status: 200 });
      if (url.includes("mempool.space/api/block/"))
        return new Response(JSON.stringify([]), { status: 200 });
      return new Response("not mocked", { status: 500 });
    });

    const out = await refreshed();
    // Only the 10M tx should pass; 1M filtered out
    expect(out.transfers.find((t) => t.txHash === "0xsmall")).toBeUndefined();
    expect(out.transfers.find((t) => t.txHash === "0xbig")?.amount).toBe(10_000_000);
  });

  it("labels Binance/Coinbase addresses correctly + classifies direction", async () => {
    process.env.WHALE_FLOW_MIN_USD = "1000000";
    vi.resetModules();
    const { getWhaleFlow: refreshed } = await import("./whale-flow.js");

    mockFetch((url) => {
      if (url.includes("simple/price"))
        return new Response(JSON.stringify({ bitcoin: { usd: 70000 } }), { status: 200 });
      if (url.includes("etherscan.io")) {
        return new Response(
          JSON.stringify({
            status: "1",
            result: [
              {
                hash: "0xtoexchange",
                from: "0xUNKNOWN",
                to: "0x28C6c06298d514Db089934071355E5743bf21d60", // Binance
                value: "5000000000000",
                tokenDecimal: "6",
                tokenSymbol: "USDT",
                contractAddress: "0xdac17f958d2ee523a2206206994597c13d831ec7",
                timeStamp: "1700000000",
              },
            ],
          }),
          { status: 200 },
        );
      }
      if (url.includes("mempool.space/api/blocks/tip/hash"))
        return new Response(JSON.stringify("0xdeadbeef"), { status: 200 });
      if (url.includes("mempool.space/api/block/"))
        return new Response(JSON.stringify([]), { status: 200 });
      return new Response("not mocked", { status: 500 });
    });

    const out = await refreshed();
    const t = out.transfers.find((tx) => tx.txHash === "0xtoexchange");
    expect(t?.toLabel).toBe("BINANCE");
    expect(t?.fromLabel).toBe("UNKNOWN");
    expect(t?.direction).toBe("IN"); // money INTO an exchange
  });

  it("survives Etherscan failure (allSettled isolation)", async () => {
    mockFetch((url) => {
      if (url.includes("simple/price"))
        return new Response(JSON.stringify({ bitcoin: { usd: 70000 } }), { status: 200 });
      if (url.includes("etherscan.io"))
        return new Response("Internal Server Error", { status: 500 });
      if (url.includes("mempool.space/api/blocks/tip/hash"))
        return new Response(JSON.stringify("0xdeadbeef"), { status: 200 });
      if (url.includes("mempool.space/api/block/"))
        return new Response(JSON.stringify([]), { status: 200 });
      return new Response("nope", { status: 500 });
    });

    const out = await getWhaleFlow();
    // Should not throw; failures noted in sources.fail
    expect(out.sources.fail.some((s) => s.includes("etherscan"))).toBe(true);
  });
});
