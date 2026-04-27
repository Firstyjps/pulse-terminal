import { describe, expect, it } from "vitest";
import { deriveAnomalies } from "./anomalies.js";
import type { FundflowSnapshot } from "./types.js";

const empty = (overrides: Partial<FundflowSnapshot> = {}): FundflowSnapshot => ({
  generatedAt: "2026-04-28T00:00:00Z",
  ...overrides,
});

describe("deriveAnomalies", () => {
  it("returns empty findings when nothing is unusual", () => {
    const findings = deriveAnomalies(empty(), [], "BTCUSDT");
    expect(findings).toEqual([]);
  });

  it("flags heavy BTC ETF outflow as high severity", () => {
    const snap = empty({
      etf: {
        flows: [],
        summary: {
          btcLast: -3e8, ethLast: 0, btcCumulative: 0, ethCumulative: 0,
          btc7dSum: -3e8, eth7dSum: 0, btc30dSum: 0, eth30dSum: 0,
        },
      },
    });
    const findings = deriveAnomalies(snap, [], "BTCUSDT");
    expect(findings[0].category).toBe("etf");
    expect(findings[0].severity).toBe("high");
  });

  it("flags overheated long funding when avg > 0.05%", () => {
    const findings = deriveAnomalies(
      empty(),
      [
        { exchange: "binance", symbol: "BTCUSDT", ratePercent: 0.06 },
        { exchange: "bybit", symbol: "BTCUSDT", ratePercent: 0.07 },
      ],
      "BTCUSDT",
    );
    expect(findings.some((f) => f.category === "funding" && f.signal.includes("long"))).toBe(true);
  });

  it("flags ETF outflow + hot funding cross-source as high severity", () => {
    const snap = empty({
      etf: {
        flows: [],
        summary: {
          btcLast: -1e8, ethLast: 0, btcCumulative: 0, ethCumulative: 0,
          btc7dSum: -1e8, eth7dSum: 0, btc30dSum: 0, eth30dSum: 0,
        },
      },
      futures: {
        btc: {
          symbol: "BTCUSDT", openInterest: 7e9, fundingRate: 0.05,
          longShortRatio: 1.2, price: 76800, priceChange24h: 0, history: [],
        },
        eth: {
          symbol: "ETHUSDT", openInterest: 4e9, fundingRate: 0.01,
          longShortRatio: 1.5, price: 2300, priceChange24h: 0, history: [],
        },
      },
    });
    const findings = deriveAnomalies(snap, [], "BTCUSDT");
    expect(findings.some((f) => f.category === "futures" && f.severity === "high")).toBe(true);
  });

  it("sorts findings high → med → low", () => {
    const snap = empty({
      etf: {
        flows: [],
        summary: {
          btcLast: -3e8, ethLast: -2e8, btcCumulative: 0, ethCumulative: 0,
          btc7dSum: -3e8, eth7dSum: -2e8, btc30dSum: 0, eth30dSum: 0,
        },
      },
    });
    const findings = deriveAnomalies(snap, [], "BTCUSDT");
    const severities = findings.map((f) => f.severity);
    const rank = { high: 0, med: 1, low: 2 } as const;
    for (let i = 1; i < severities.length; i++) {
      expect(rank[severities[i]]).toBeGreaterThanOrEqual(rank[severities[i - 1]]);
    }
  });
});
