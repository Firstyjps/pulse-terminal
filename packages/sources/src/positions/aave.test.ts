import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getAavePositions } from "./aave.js";

const EVM = "0x1234567890abcdef1234567890abcdef12345678";
const SOL = "So11111111111111111111111111111111111111112";

// Mainnet fixture: 1 USDC supply (6 decimals), 1 WETH supply (18) + small WETH borrow.
const ETH_FIXTURE = {
  data: {
    userReserves: [
      {
        currentATokenBalance: "10000000000",        // 10,000 USDC (6 decimals)
        currentVariableDebt: "0",
        reserve: { symbol: "USDC", decimals: 6, price: { priceInEth: "0.0003" } },
      },
      {
        currentATokenBalance: "5000000000000000000",  // 5 WETH (18)
        currentVariableDebt: "1000000000000000000",   // 1 WETH borrowed
        reserve: { symbol: "WETH", decimals: 18, price: { priceInEth: "1" } },
      },
    ],
  },
};
const ARB_FIXTURE = { data: { userReserves: [] } };

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
  process.env.PULSE_WALLETS = EVM;
  process.env.THEGRAPH_API_KEY = "test-key";
  process.env.ETH_USD_OVERRIDE = "3000";
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.PULSE_WALLETS;
  delete process.env.THEGRAPH_API_KEY;
  delete process.env.ETH_USD_OVERRIDE;
  delete process.env.THEGRAPH_GATEWAY_URL;
  vi.restoreAllMocks();
});

describe("getAavePositions — env / opt-in", () => {
  it("returns empty when no wallets configured", async () => {
    delete process.env.PULSE_WALLETS;
    expect(await getAavePositions()).toEqual({ positions: [] });
  });

  it("ignores Solana wallets (EVM-only)", async () => {
    process.env.PULSE_WALLETS = SOL;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("should not be called");
    }) as typeof fetch;
    expect(await getAavePositions()).toEqual({ positions: [] });
  });

  it("returns clear error when THEGRAPH_API_KEY is missing", async () => {
    delete process.env.THEGRAPH_API_KEY;
    const out = await getAavePositions();
    expect(out.positions).toEqual([]);
    expect(out.errors).toEqual(["aave: THEGRAPH_API_KEY not set"]);
  });
});

describe("getAavePositions — parsing", () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      // Subgraph IDs differ per chain; route by which fixture to return
      if (url.includes("JCNWRypm7FYwV8fx5HhzZPSFaMxgkPuw4TnR3Gpi81zk")) return jsonResponse(ETH_FIXTURE);
      return jsonResponse(ARB_FIXTURE);
    }) as typeof fetch;
  });

  it("emits a `lending` position for non-zero aToken balance", async () => {
    const { positions } = await getAavePositions();
    const usdc = positions.find((p) => p.type === "lending" && p.asset === "USDC");
    expect(usdc?.units).toBe(10_000);
    expect(usdc?.usdValue).toBeCloseTo(10_000 * 0.0003 * 3000, 6); // 9000
    expect(usdc?.meta).toMatchObject({ chain: "ethereum", chainId: 1 });
  });

  it("emits a `borrow` position with negative units and negative usdValue", async () => {
    const { positions } = await getAavePositions();
    const borrow = positions.find((p) => p.type === "borrow" && p.asset === "WETH");
    expect(borrow?.units).toBe(-1);
    expect(borrow?.usdValue).toBeCloseTo(-1 * 1 * 3000, 6); // -3000
  });

  it("emits both lending + borrow for a reserve with both", async () => {
    const { positions } = await getAavePositions();
    const wethRows = positions.filter((p) => p.asset === "WETH");
    expect(wethRows.map((p) => p.type).sort()).toEqual(["borrow", "lending"]);
  });

  it("usdValue is 0 when ETH_USD_OVERRIDE is unset (no oracle)", async () => {
    delete process.env.ETH_USD_OVERRIDE;
    const { positions } = await getAavePositions();
    expect(positions.every((p) => p.usdValue === 0)).toBe(true);
    expect(positions.find((p) => p.asset === "USDC")?.units).toBe(10_000);
  });

  it("posts a GraphQL query body containing the wallet address", async () => {
    const captured: Array<{ url: string; body: string }> = [];
    globalThis.fetch = vi.fn(async (input, init?: RequestInit) => {
      captured.push({
        url: typeof input === "string" ? input : input.toString(),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return jsonResponse(ARB_FIXTURE);
    }) as typeof fetch;

    await getAavePositions();
    expect(captured.length).toBeGreaterThan(0);
    expect(captured[0].url).toContain("test-key");
    const parsed = JSON.parse(captured[0].body);
    expect(parsed.query).toContain("userReserves");
    expect(parsed.variables.user).toBe(EVM);
  });
});

describe("getAavePositions — error handling", () => {
  it("captures HTTP non-2xx per chain", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({}, 502)) as typeof fetch;
    const out = await getAavePositions();
    expect(out.positions).toEqual([]);
    expect(out.errors?.length).toBeGreaterThanOrEqual(1);
    expect(out.errors?.[0]).toMatch(/HTTP 502/);
  });

  it("captures GraphQL `errors` array as a single error message", async () => {
    globalThis.fetch = vi.fn(async () =>
      jsonResponse({ errors: [{ message: "rate limited" }] }),
    ) as typeof fetch;
    const out = await getAavePositions();
    expect(out.errors?.[0]).toMatch(/rate limited/);
  });

  it("isolates per-chain failure from healthy chain", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("DLuE98kEb5pQNXAcKFQGQgfSQ57Xdou4jnVbAEqMfy3B")) return jsonResponse({}, 500); // arb down
      return jsonResponse(ETH_FIXTURE);
    }) as typeof fetch;

    const out = await getAavePositions();
    expect(out.positions.length).toBeGreaterThan(0);
    expect(out.errors?.some((e) => e.includes("arbitrum") && e.includes("500"))).toBe(true);
  });
});
