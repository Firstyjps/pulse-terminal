import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getPendlePositions } from "./pendle.js";

const EVM = "0x1234567890abcdef1234567890abcdef12345678";
const SOL = "So11111111111111111111111111111111111111112";

const ETH_FIXTURE = {
  openPositions: [
    {
      symbol: "PT-sUSDe-25APR",
      balance: "1000",
      valuation: { valuation: "950" },
      pnl: "12.34",
      expiry: "2026-04-25",
      marketAddress: "0xMarketEth",
    },
    {
      // no valuation → skipped
      symbol: "PT-uniBTC",
      balance: "5",
      valuation: { valuation: "0" },
    },
  ],
};
const ARB_FIXTURE = {
  openPositions: [
    {
      symbol: "PT-rsETH-26JUN",
      balance: "20",
      valuation: { valuation: "60000" },
      expiry: "2026-06-26",
      marketAddress: "0xMarketArb",
    },
  ],
};
const EMPTY_FIXTURE = { openPositions: [] };

function jsonResponse(payload: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload),
    json: async () => payload,
  } as unknown as Response;
}

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.PULSE_WALLETS;
  vi.restoreAllMocks();
});

describe("getPendlePositions — env / opt-in", () => {
  it("returns empty when no wallets configured", async () => {
    expect(await getPendlePositions()).toEqual({ positions: [] });
  });

  it("ignores Solana wallets (EVM-only adapter)", async () => {
    process.env.PULSE_WALLETS = SOL;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("should not be called");
    }) as typeof fetch;
    expect(await getPendlePositions()).toEqual({ positions: [] });
  });
});

describe("getPendlePositions — parsing", () => {
  beforeEach(() => {
    process.env.PULSE_WALLETS = EVM;
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/1/")) return jsonResponse(ETH_FIXTURE);
      if (url.includes("/42161/")) return jsonResponse(ARB_FIXTURE);
      return jsonResponse(EMPTY_FIXTURE);
    }) as typeof fetch;
  });

  it("maps PT positions across multiple chains as yield_token", async () => {
    const { positions } = await getPendlePositions();
    expect(positions.every((p) => p.venue === "pendle" && p.type === "yield_token")).toBe(true);
    expect(positions.find((p) => p.asset === "PT-sUSDe-25APR")).toBeDefined();
    expect(positions.find((p) => p.asset === "PT-rsETH-26JUN")).toBeDefined();
  });

  it("uses valuation.valuation as usdValue and balance as units", async () => {
    const { positions } = await getPendlePositions();
    const eth = positions.find((p) => p.asset === "PT-sUSDe-25APR");
    expect(eth?.usdValue).toBe(950);
    expect(eth?.units).toBe(1000);
    expect(eth?.pnl).toBe(12.34);
  });

  it("skips positions with usdValue <= 0", async () => {
    const { positions } = await getPendlePositions();
    expect(positions.find((p) => p.asset === "PT-uniBTC")).toBeUndefined();
  });

  it("annotates chain + chainId + market in meta", async () => {
    const { positions } = await getPendlePositions();
    const arb = positions.find((p) => p.asset === "PT-rsETH-26JUN");
    expect(arb?.meta).toMatchObject({
      chain: "arbitrum",
      chainId: 42161,
      market: "0xMarketArb",
      wallet: EVM,
    });
  });

  it("queries 4 chains × N wallets", async () => {
    const wallet2 = "0xabcabcabcabcabcabcabcabcabcabcabcabcabca";
    process.env.PULSE_WALLETS = `${EVM},${wallet2}`;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input) => {
      calls.push(typeof input === "string" ? input : input.toString());
      return jsonResponse(EMPTY_FIXTURE);
    }) as typeof fetch;

    await getPendlePositions();
    expect(calls).toHaveLength(8); // 2 wallets × 4 chains
    expect(calls.filter((c) => c.includes(EVM))).toHaveLength(4);
    expect(calls.filter((c) => c.includes(wallet2))).toHaveLength(4);
  });
});

describe("getPendlePositions — error handling", () => {
  beforeEach(() => {
    process.env.PULSE_WALLETS = EVM;
  });

  it("captures per-chain HTTP failures without dropping other chains", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/56/")) return jsonResponse({}, 503);    // BSC down
      if (url.includes("/1/")) return jsonResponse(ETH_FIXTURE);
      return jsonResponse(EMPTY_FIXTURE);
    }) as typeof fetch;

    const out = await getPendlePositions();
    expect(out.positions.find((p) => p.asset === "PT-sUSDe-25APR")).toBeDefined();
    expect(out.errors?.some((e) => e.includes("bsc") && e.includes("503"))).toBe(true);
  });

  it("captures thrown errors per chain", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("ECONNRESET");
    }) as typeof fetch;
    const out = await getPendlePositions();
    expect(out.positions).toEqual([]);
    expect(out.errors?.length).toBe(4); // one per chain
    expect(out.errors?.every((e) => e.includes("ECONNRESET"))).toBe(true);
  });
});
