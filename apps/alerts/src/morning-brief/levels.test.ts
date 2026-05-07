import { describe, expect, it } from "vitest";
import type { DepthBook } from "@pulse/sources/server";
import {
  fetchSupportResistance,
  SUPPORT_RESISTANCE_SYMBOLS,
  type OhlcRow,
  type SupportResistanceSymbol,
} from "./levels.js";

function makeKlines(base: number): OhlcRow[] {
  return Array.from({ length: 168 }, (_, i) => {
    const wave = Math.sin(i / 6) * base * 0.01;
    const close = base + wave + (i === 167 ? 0 : 0);
    return {
      ts: 1_700_000_000_000 + i * 60 * 60_000,
      open: close - base * 0.002,
      high: close + base * (i % 24 === 0 ? 0.045 : 0.018),
      low: close - base * (i % 24 === 12 ? 0.045 : 0.018),
      close: i === 167 ? base : close,
      volume: 100 + i,
    };
  });
}

function toBinanceRows(rows: OhlcRow[]) {
  return rows.map((r) => [
    r.ts,
    String(r.open),
    String(r.high),
    String(r.low),
    String(r.close),
    String(r.volume),
    r.ts + 60 * 60_000 - 1,
    "0",
    1,
    "0",
    "0",
    "0",
  ]);
}

function okJson(value: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => value,
  } as Response;
}

function fail(status = 500): Response {
  return {
    ok: false,
    status,
    json: async () => ({}),
  } as Response;
}

function symbolBase(symbol: SupportResistanceSymbol): number {
  return { BTCUSDT: 100_000, ETHUSDT: 3_000, SOLUSDT: 150 }[symbol];
}

function fetchImplWithFailure(failSymbol?: SupportResistanceSymbol): typeof fetch {
  return (async (url: string | URL | Request) => {
    const u = String(url);
    const symbol = SUPPORT_RESISTANCE_SYMBOLS.find((s) => u.includes(`symbol=${s}`));
    if (!symbol) return fail(404);
    if (symbol === failSymbol) return fail(503);
    return okJson(toBinanceRows(makeKlines(symbolBase(symbol))));
  }) as typeof fetch;
}

function makeDepth(symbol: SupportResistanceSymbol): DepthBook {
  const base = symbolBase(symbol);
  return {
    symbol,
    bids: [
      [base * 0.955, 25],
      [base * 0.982, 2],
      [base * 0.975, 1],
    ],
    asks: [
      [base * 1.045, 25],
      [base * 1.019, 2],
      [base * 1.028, 1],
    ],
    ts: 1_700_000_000_000,
  };
}

describe("fetchSupportResistance", () => {
  it("falls back to OHLC-only pivot levels when depth fails", async () => {
    const out = await fetchSupportResistance({
      fetchImpl: fetchImplWithFailure(),
      fetchDepth: async () => {
        throw new Error("depth down");
      },
    });

    expect(out).toHaveLength(3);
    for (const row of out) {
      expect(row.status).toBe("ok");
      expect(row.current).toBeGreaterThan(0);
      expect(row.support.s1?.tag).toBe("pivot");
      expect(row.support.s2?.tag).toBe("pivot");
      expect(row.resistance.r1?.tag).toBe("pivot");
      expect(row.resistance.r2?.tag).toBe("pivot");
    }
  });

  it("marks a symbol unavailable when klines fail without failing the whole brief", async () => {
    const out = await fetchSupportResistance({
      fetchImpl: fetchImplWithFailure("SOLUSDT"),
      fetchDepth: async (symbol) => makeDepth(symbol),
    });

    const btc = out.find((x) => x.symbol === "BTCUSDT");
    const sol = out.find((x) => x.symbol === "SOLUSDT");

    expect(btc?.status).toBe("ok");
    expect(sol).toMatchObject({
      symbol: "SOLUSDT",
      status: "unavailable",
      current: null,
      support: { s1: null, s2: null },
      resistance: { r1: null, r2: null },
    });
    expect(sol?.error).toContain("klines SOLUSDT 503");
  });

  it("returns formatter-ready BTC/ETH/SOL support and resistance shape", async () => {
    const out = await fetchSupportResistance({
      fetchImpl: fetchImplWithFailure(),
      fetchDepth: async (symbol) => makeDepth(symbol),
    });

    expect(out.map((x) => x.symbol)).toEqual(["BTCUSDT", "ETHUSDT", "SOLUSDT"]);
    for (const row of out) {
      expect(row.status).toBe("ok");
      expect(row.current).toBeTypeOf("number");
      expect(row.support.s1?.price).toBeLessThan(row.current ?? 0);
      expect(row.support.s2?.price).toBeLessThan(row.current ?? 0);
      expect(row.resistance.r1?.price).toBeGreaterThan(row.current ?? 0);
      expect(row.resistance.r2?.price).toBeGreaterThan(row.current ?? 0);
      expect(["pivot", "liquidity", "confluence"]).toContain(row.support.s1?.tag);
      expect(["pivot", "liquidity", "confluence"]).toContain(row.resistance.r1?.tag);
    }
  });
});
