import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getOrcaPositions } from "./orca-positions.js";

const SOL_A = "So11111111111111111111111111111111111111112";
const EVM = "0x1234567890abcdef1234567890abcdef12345678";

const FIXTURE = {
  positions: [
    {
      positionMint: "MINT111",
      whirlpool: "POOL_SOL_USDC",
      tokenA: { symbol: "SOL",  amount: "5" },
      tokenB: { symbol: "USDC", amount: "750" },
      valueUsd: "1500",
      feesEarnedUsd: "8.25",
      inRange: true,
    },
    {
      positionMint: "MINT222",
      whirlpool: "POOL_BONK_SOL",
      tokenA: { symbol: "BONK", amount: "1000000" },
      tokenB: { symbol: "SOL",  amount: "0.5" },
      valueUsd: "500",
      inRange: false,
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

afterEach(() => {
  globalThis.fetch = originalFetch;
  delete process.env.PULSE_WALLETS;
  delete process.env.ORCA_API_URL;
  vi.restoreAllMocks();
});

describe("getOrcaPositions — env / opt-in", () => {
  it("returns empty when no wallets configured", async () => {
    expect(await getOrcaPositions()).toEqual({ positions: [] });
  });

  it("ignores EVM wallets (Solana-only)", async () => {
    process.env.PULSE_WALLETS = EVM;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("should not be called");
    }) as typeof fetch;
    expect(await getOrcaPositions()).toEqual({ positions: [] });
  });
});

describe("getOrcaPositions — parsing", () => {
  beforeEach(() => {
    process.env.PULSE_WALLETS = SOL_A;
    globalThis.fetch = vi.fn(async () => jsonResponse(FIXTURE)) as typeof fetch;
  });

  it("maps every record to an LP position with pair ticker", async () => {
    const { positions } = await getOrcaPositions();
    expect(positions).toHaveLength(2);
    expect(positions.find((p) => p.asset === "SOL-USDC")).toBeDefined();
    expect(positions.find((p) => p.asset === "BONK-SOL")).toBeDefined();
    expect(positions.every((p) => p.venue === "orca" && p.type === "lp")).toBe(true);
  });

  it("uses valueUsd and feesEarnedUsd correctly", async () => {
    const { positions } = await getOrcaPositions();
    const sol = positions.find((p) => p.asset === "SOL-USDC");
    expect(sol?.usdValue).toBe(1500);
    expect(sol?.pnl).toBe(8.25);
    expect(sol?.units).toBe(1);
  });

  it("leaves pnl undefined when feesEarnedUsd absent", async () => {
    const { positions } = await getOrcaPositions();
    const bonk = positions.find((p) => p.asset === "BONK-SOL");
    expect(bonk?.pnl).toBeUndefined();
  });

  it("preserves whirlpool + positionMint + tokenA/B in meta", async () => {
    const { positions } = await getOrcaPositions();
    const sol = positions.find((p) => p.asset === "SOL-USDC");
    expect(sol?.meta).toMatchObject({
      chain: "solana",
      whirlpool: "POOL_SOL_USDC",
      positionMint: "MINT111",
      inRange: true,
    });
  });

  it("respects ORCA_API_URL override", async () => {
    process.env.ORCA_API_URL = "https://custom-orca.example.com";
    let capturedUrl = "";
    globalThis.fetch = vi.fn(async (input) => {
      capturedUrl = typeof input === "string" ? input : input.toString();
      return jsonResponse(FIXTURE);
    }) as typeof fetch;

    await getOrcaPositions();
    expect(capturedUrl).toBe(`https://custom-orca.example.com/v1/whirlpool/positions/${SOL_A}`);
  });
});

describe("getOrcaPositions — error handling", () => {
  beforeEach(() => {
    process.env.PULSE_WALLETS = SOL_A;
  });

  it("captures HTTP non-2xx as a per-wallet error", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({}, 404)) as typeof fetch;
    const out = await getOrcaPositions();
    expect(out.positions).toEqual([]);
    expect(out.errors?.[0]).toMatch(/HTTP 404/);
  });

  it("captures thrown errors per wallet", async () => {
    globalThis.fetch = vi.fn(async () => {
      throw new Error("DNS failure");
    }) as typeof fetch;
    const out = await getOrcaPositions();
    expect(out.errors?.[0]).toMatch(/DNS failure/);
  });

  it("handles missing positions array gracefully", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({})) as typeof fetch;
    const out = await getOrcaPositions();
    expect(out.positions).toEqual([]);
    expect(out.errors).toBeUndefined();
  });
});
