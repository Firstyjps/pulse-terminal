import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getMeteoraPositions } from "./meteora-positions.js";

const SOL_A = "So11111111111111111111111111111111111111112";
const SOL_B = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
const EVM = "0x1234567890abcdef1234567890abcdef12345678";

const FIXTURE = [
  {
    pair: "SOL-USDC",
    poolAddress: "POOL111",
    tokenX: { symbol: "SOL",  amount: "10",   usdValue: "1500" },
    tokenY: { symbol: "USDC", amount: "1500", usdValue: "1500" },
    totalUsdValue: "3000",
    feesEarnedUsd: "12.5",
    inRange: true,
  },
  {
    pair: "JUP-USDC",
    poolAddress: "POOL222",
    tokenX: { symbol: "JUP",  amount: "1000", usdValue: "800" },
    tokenY: { symbol: "USDC", amount: "200",  usdValue: "200" },
    totalUsdValue: "1000",
    inRange: false,
  },
];

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

describe("getMeteoraPositions — env / opt-in", () => {
  it("returns empty when no wallets configured", async () => {
    expect(await getMeteoraPositions()).toEqual({ positions: [] });
  });

  it("ignores EVM wallets (Solana-only adapter)", async () => {
    process.env.PULSE_WALLETS = EVM;
    globalThis.fetch = vi.fn(async () => {
      throw new Error("should not be called");
    }) as typeof fetch;
    expect(await getMeteoraPositions()).toEqual({ positions: [] });
  });
});

describe("getMeteoraPositions — parsing", () => {
  beforeEach(() => {
    process.env.PULSE_WALLETS = SOL_A;
    globalThis.fetch = vi.fn(async () => jsonResponse(FIXTURE)) as typeof fetch;
  });

  it("maps every record to an LP position", async () => {
    const { positions, errors } = await getMeteoraPositions();
    expect(errors).toBeUndefined();
    expect(positions).toHaveLength(2);
    expect(positions.every((p) => p.venue === "meteora" && p.type === "lp")).toBe(true);
  });

  it("uses pair as asset, totalUsdValue as usdValue, feesEarnedUsd as pnl", async () => {
    const { positions } = await getMeteoraPositions();
    const sol = positions.find((p) => p.asset === "SOL-USDC");
    expect(sol?.usdValue).toBe(3000);
    expect(sol?.pnl).toBe(12.5);
    expect(sol?.units).toBe(1);
  });

  it("leaves pnl undefined when feesEarnedUsd is absent", async () => {
    const { positions } = await getMeteoraPositions();
    const jup = positions.find((p) => p.asset === "JUP-USDC");
    expect(jup?.pnl).toBeUndefined();
  });

  it("preserves chain + pool + tokenX/Y in meta", async () => {
    const { positions } = await getMeteoraPositions();
    const sol = positions.find((p) => p.asset === "SOL-USDC");
    expect(sol?.meta).toMatchObject({
      chain: "solana",
      pool: "POOL111",
      inRange: true,
      wallet: SOL_A,
    });
    expect(sol?.meta?.tokenX).toEqual({ symbol: "SOL", amount: 10 });
    expect(sol?.meta?.tokenY).toEqual({ symbol: "USDC", amount: 1500 });
  });

  it("queries one URL per Solana wallet", async () => {
    process.env.PULSE_WALLETS = `${SOL_A},${SOL_B}`;
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input) => {
      calls.push(typeof input === "string" ? input : input.toString());
      return jsonResponse(FIXTURE);
    }) as typeof fetch;

    await getMeteoraPositions();
    expect(calls).toHaveLength(2);
    expect(calls[0]).toContain(`/position/${SOL_A}`);
    expect(calls[1]).toContain(`/position/${SOL_B}`);
  });
});

describe("getMeteoraPositions — error handling", () => {
  beforeEach(() => {
    process.env.PULSE_WALLETS = SOL_A;
  });

  it("captures HTTP non-2xx as a per-wallet error, returns no positions for that wallet", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({}, 502)) as typeof fetch;
    const out = await getMeteoraPositions();
    expect(out.positions).toEqual([]);
    expect(out.errors).toEqual([`meteora ${SOL_A.slice(0, 6)}: HTTP 502`]);
  });

  it("captures non-array JSON shape", async () => {
    globalThis.fetch = vi.fn(async () => jsonResponse({ unexpected: "shape" })) as typeof fetch;
    const out = await getMeteoraPositions();
    expect(out.positions).toEqual([]);
    expect(out.errors?.[0]).toMatch(/expected array/);
  });

  it("isolates a failing wallet from a healthy one", async () => {
    process.env.PULSE_WALLETS = `${SOL_A},${SOL_B}`;
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes(SOL_A)) throw new Error("network down");
      return jsonResponse(FIXTURE);
    }) as typeof fetch;

    const out = await getMeteoraPositions();
    expect(out.positions).toHaveLength(2);
    expect(out.errors).toEqual([`meteora ${SOL_A.slice(0, 6)}: network down`]);
  });
});
