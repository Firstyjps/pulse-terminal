import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getTVL, computeChainDelta } from "./tvl.js";

const HISTORICAL_OVERALL = [
  { date: 1777334400, tvl: 138_000_000_000 }, // 30d ago anchor
  ...Array.from({ length: 28 }, (_, i) => ({
    date: 1777420800 + i * 86_400,
    tvl: 140_000_000_000 + i * 100_000_000,
  })),
  { date: 1777420800 + 28 * 86_400, tvl: 144_500_000_000 }, // -1d
  { date: 1777420800 + 29 * 86_400, tvl: 145_000_000_000 }, // today
];

const CHAINS = [
  { name: "Ethereum", tvl: 45_300_000_000 },
  { name: "BSC",      tvl: 5_500_000_000  },
  { name: "Solana",   tvl: 5_400_000_000  },
  { name: "Bitcoin",  tvl: 5_200_000_000  },
  { name: "Tron",     tvl: 5_100_000_000  },
  { name: "Base",     tvl: 4_500_000_000  },
  { name: "Arbitrum", tvl: 1_700_000_000  },
  { name: "Provenance", tvl: 1_600_000_000 },
];

// Each chain history: 30 daily points. Today -1 = 99% of today, -7 = 95% of today.
function chainHistoryFor(currentTvl: number): Array<{ date: number; tvl: number }> {
  const points: Array<{ date: number; tvl: number }> = [];
  for (let i = 30; i >= 0; i--) {
    const ratio = i === 0 ? 1.00 : i === 1 ? 0.99 : i === 7 ? 0.95 : 1 - i * 0.005;
    points.push({ date: 1777420800 + (30 - i) * 86_400, tvl: currentTvl * ratio });
  }
  return points;
}

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
  vi.restoreAllMocks();
});

describe("computeChainDelta — pure helper", () => {
  it("computes 1d and 7d % from a healthy series", () => {
    const series = chainHistoryFor(100);
    // history tail: 100, prev1 = 99, prev7 = 95
    const r = computeChainDelta(series, 100);
    expect(r.change1d).toBeCloseTo((100 - 99) / 99 * 100, 6);
    expect(r.change7d).toBeCloseTo((100 - 95) / 95 * 100, 6);
  });

  it("uses liveTvl over series tail when liveTvl > 0 (intraday accuracy)", () => {
    const series = chainHistoryFor(100);
    const r = computeChainDelta(series, 102); // intraday bumped 2%
    expect(r.change1d).toBeCloseTo((102 - 99) / 99 * 100, 6);
  });

  it("falls back to series tail when liveTvl is 0", () => {
    const series = chainHistoryFor(100);
    const r = computeChainDelta(series, 0);
    expect(r.change1d).toBeCloseTo((100 - 99) / 99 * 100, 6);
  });

  it("returns zero deltas for an empty series", () => {
    expect(computeChainDelta([], 100)).toEqual({ change1d: 0, change7d: 0 });
  });

  it("uses tail value as prev when series has <8 points (7d undefined)", () => {
    const series = [
      { date: 1, tvl: 50 },
      { date: 2, tvl: 99 },
      { date: 3, tvl: 100 },
    ];
    const r = computeChainDelta(series, 100);
    // prev1 = 99 → 1d = ~1.01%
    expect(r.change1d).toBeCloseTo(1.0101, 3);
    // prev7 missing → falls to tail (100) → 7d = 0
    expect(r.change7d).toBe(0);
  });
});

describe("getTVL — integration", () => {
  function setupHappyFetch() {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v2/historicalChainTvl")) return jsonResponse(HISTORICAL_OVERALL);
      if (url.endsWith("/v2/chains")) return jsonResponse(CHAINS);
      // per-chain history
      const m = url.match(/\/v2\/historicalChainTvl\/(.+)$/);
      if (m) {
        const chainName = decodeURIComponent(m[1]);
        const c = CHAINS.find((x) => x.name === chainName);
        return jsonResponse(chainHistoryFor(c?.tvl ?? 0));
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;
  }

  it("populates non-zero change1d for every top chain (the bug under fix)", async () => {
    setupHappyFetch();
    const r = await getTVL();
    expect(r.byChain.length).toBe(8);
    for (const c of r.byChain) {
      expect(c.change1d).not.toBe(0);
      expect(c.change7d).not.toBe(0);
    }
  });

  it("ranks chains by tvl desc and slices to top 12", async () => {
    setupHappyFetch();
    const r = await getTVL();
    const tvls = r.byChain.map((c) => c.tvl);
    for (let i = 1; i < tvls.length; i++) {
      expect(tvls[i - 1]).toBeGreaterThanOrEqual(tvls[i]);
    }
    expect(r.byChain[0].name).toBe("Ethereum");
  });

  it("computes overall summary deltas from /v2/historicalChainTvl", async () => {
    setupHappyFetch();
    const r = await getTVL();
    expect(r.summary.total).toBe(145_000_000_000);
    expect(r.summary.change1d).toBeCloseTo(
      (145_000_000_000 - 144_500_000_000) / 144_500_000_000 * 100,
      6,
    );
  });

  it("isolates per-chain history failure → 0 delta for that chain only, others fine", async () => {
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v2/historicalChainTvl")) return jsonResponse(HISTORICAL_OVERALL);
      if (url.endsWith("/v2/chains")) return jsonResponse(CHAINS);
      if (url.includes("/historicalChainTvl/Solana")) return jsonResponse({}, 500);
      const m = url.match(/\/v2\/historicalChainTvl\/(.+)$/);
      if (m) {
        const c = CHAINS.find((x) => x.name === decodeURIComponent(m[1]));
        return jsonResponse(chainHistoryFor(c?.tvl ?? 0));
      }
      return jsonResponse({}, 404);
    }) as typeof fetch;

    const r = await getTVL();
    const solana = r.byChain.find((c) => c.name === "Solana");
    expect(solana?.change1d).toBe(0);
    expect(solana?.change7d).toBe(0);
    const eth = r.byChain.find((c) => c.name === "Ethereum");
    expect(eth?.change1d).not.toBe(0);
  });

  it("URL-encodes chain names with spaces or special chars", async () => {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      calls.push(url);
      if (url.endsWith("/v2/historicalChainTvl")) return jsonResponse(HISTORICAL_OVERALL);
      if (url.endsWith("/v2/chains")) {
        return jsonResponse([
          { name: "Hyperliquid L1", tvl: 9_000_000_000 },
          { name: "OP Mainnet",     tvl: 8_000_000_000 },
        ]);
      }
      const m = url.match(/\/v2\/historicalChainTvl\/(.+)$/);
      if (m) return jsonResponse(chainHistoryFor(1));
      return jsonResponse({}, 404);
    }) as typeof fetch;

    await getTVL();
    expect(calls).toContain("https://api.llama.fi/v2/historicalChainTvl/Hyperliquid%20L1");
    expect(calls).toContain("https://api.llama.fi/v2/historicalChainTvl/OP%20Mainnet");
  });

  it("does not read change_1d / change_7d from /v2/chains anymore", async () => {
    // Even if upstream re-adds the fields, we must ignore them and derive from
    // per-chain history. The previous bug was reading these.
    globalThis.fetch = vi.fn(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.endsWith("/v2/historicalChainTvl")) return jsonResponse(HISTORICAL_OVERALL);
      if (url.endsWith("/v2/chains")) {
        return jsonResponse([
          { name: "Ethereum", tvl: 45_300_000_000, change_1d: 999, change_7d: -999 },
        ]);
      }
      const m = url.match(/\/v2\/historicalChainTvl\/(.+)$/);
      if (m) return jsonResponse(chainHistoryFor(45_300_000_000));
      return jsonResponse({}, 404);
    }) as typeof fetch;

    const r = await getTVL();
    expect(r.byChain[0].change1d).not.toBe(999);
    expect(r.byChain[0].change7d).not.toBe(-999);
  });
});
