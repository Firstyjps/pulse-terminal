import { describe, expect, it } from "vitest";
import {
  deriveAnomalies,
  detectAprRegimeChange,
  detectMaxOiShift,
  detectSkewFlip,
} from "./anomalies.js";
import type { FundflowSnapshot } from "./types.js";
import type { OptionData } from "./options/types.js";

function buildOption(overrides: Partial<OptionData>): OptionData {
  return {
    strike: 200,
    exchange: "Deribit",
    side: "call",
    asset: "SOL",
    expiry: "20260630",
    bid: 0,
    ask: 0,
    mark: 0,
    iv: 60,
    delta: 0,
    gamma: 0,
    theta: 0,
    vega: 0,
    oi: 0,
    volume: 0,
    size_bid: 0,
    size_ask: 0,
    ...overrides,
  };
}

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

  it("ignores options + APR context when not provided (back-compat)", () => {
    // Same call as before — no ctx, no options/bybit findings expected.
    const findings = deriveAnomalies(empty(), [], "BTCUSDT");
    expect(findings.find((f) => f.category === "options")).toBeUndefined();
    expect(findings.find((f) => f.category === "bybit")).toBeUndefined();
  });

  it("threads options context to detect skew flip via deriveAnomalies", () => {
    const findings = deriveAnomalies(empty(), [], "SOLUSDT", {
      options: {
        underlyingPrice: 200,
        snapshot: [
          buildOption({ strike: 195, side: "put", iv: 62 }),
          buildOption({ strike: 200, side: "put", iv: 60 }),
          buildOption({ strike: 205, side: "put", iv: 61 }),
          buildOption({ strike: 195, side: "call", iv: 70 }),
          buildOption({ strike: 200, side: "call", iv: 68 }),
          buildOption({ strike: 205, side: "call", iv: 71 }),
        ],
      },
    });
    expect(findings.some((f) => f.category === "options" && f.signal.includes("skew"))).toBe(true);
  });

  it("threads APR history to detect regime change via deriveAnomalies", () => {
    const findings = deriveAnomalies(empty(), [], "BTCUSDT", {
      aprHistory: {
        recent: [8, 8.2, 8.5, 8.1, 8.3, 8.4, 8.2],
        current: 25, // way above 2σ
      },
    });
    expect(findings.some((f) => f.category === "bybit")).toBe(true);
  });
});

describe("detectSkewFlip", () => {
  it("flags when ATM call IV exceeds put IV by > 2pp", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 200, side: "call", iv: 65 }),
      buildOption({ strike: 200, side: "put", iv: 60 }),
    ];
    const f = detectSkewFlip(opts, 200);
    expect(f).not.toBeNull();
    expect(f?.category).toBe("options");
    expect(f?.signal).toContain("skew");
  });

  it("escalates severity to high when delta > 5pp", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 200, side: "call", iv: 70 }),
      buildOption({ strike: 200, side: "put", iv: 60 }),
    ];
    expect(detectSkewFlip(opts, 200)?.severity).toBe("high");
  });

  it("returns null when put IV ≥ call IV (normal regime)", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 200, side: "call", iv: 60 }),
      buildOption({ strike: 200, side: "put", iv: 65 }),
    ];
    expect(detectSkewFlip(opts, 200)).toBeNull();
  });

  it("returns null when difference is within 2pp noise band", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 200, side: "call", iv: 61 }),
      buildOption({ strike: 200, side: "put", iv: 60 }),
    ];
    expect(detectSkewFlip(opts, 200)).toBeNull();
  });

  it("returns null when no options or no underlying price", () => {
    expect(detectSkewFlip([], 200)).toBeNull();
    expect(detectSkewFlip([buildOption({})], NaN)).toBeNull();
  });

  it("returns null when only one side is present at ATM", () => {
    const opts: OptionData[] = [buildOption({ strike: 200, side: "call", iv: 80 })];
    expect(detectSkewFlip(opts, 200)).toBeNull();
  });
});

describe("detectMaxOiShift", () => {
  it("flags when current max-OI strike is > 5% from prior", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 200, oi: 100 }),
      buildOption({ strike: 220, oi: 1000 }),
    ];
    const f = detectMaxOiShift(opts, 200);
    expect(f).not.toBeNull();
    expect(f?.category).toBe("options");
    expect((f?.evidence as { currentStrike: number }).currentStrike).toBe(220);
  });

  it("escalates to high severity when shift > 12%", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 200, oi: 100 }),
      buildOption({ strike: 240, oi: 1000 }),
    ];
    expect(detectMaxOiShift(opts, 200)?.severity).toBe("high");
  });

  it("returns null when shift is within 5%", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 200, oi: 100 }),
      buildOption({ strike: 205, oi: 1000 }),
    ];
    expect(detectMaxOiShift(opts, 200)).toBeNull();
  });

  it("aggregates OI across call + put on the same strike", () => {
    const opts: OptionData[] = [
      buildOption({ strike: 200, side: "call", oi: 50 }),
      buildOption({ strike: 200, side: "put", oi: 60 }),
      buildOption({ strike: 240, side: "call", oi: 100 }),
      // 200's combined = 110, 240's combined = 100 → max stays at 200
    ];
    expect(detectMaxOiShift(opts, 200)).toBeNull();
  });

  it("returns null on missing inputs", () => {
    expect(detectMaxOiShift([], 200)).toBeNull();
    expect(detectMaxOiShift([buildOption({})], 0)).toBeNull();
  });
});

describe("detectAprRegimeChange", () => {
  const stable = [8, 8.1, 8, 8.2, 7.9, 8.1, 8];

  it("flags when current is > 2σ above recent mean", () => {
    const f = detectAprRegimeChange(stable, 25);
    expect(f).not.toBeNull();
    expect(f?.category).toBe("bybit");
    expect(f?.signal).toContain("jumped");
  });

  it("flags when current is > 2σ below recent mean", () => {
    const f = detectAprRegimeChange(stable, 0);
    expect(f).not.toBeNull();
    expect(f?.signal).toContain("collapsed");
  });

  it("escalates severity to high when |z| > 3", () => {
    const f = detectAprRegimeChange(stable, 100);
    expect(f?.severity).toBe("high");
  });

  it("returns null when current is within 2σ of mean", () => {
    // baseline mean ≈ 8.04 with stdev ≈ 0.09 → 2σ ≈ ±0.18, so 8.15 stays inside
    expect(detectAprRegimeChange(stable, 8.15)).toBeNull();
  });

  it("returns null when fewer than 7 samples (insufficient stats)", () => {
    expect(detectAprRegimeChange([8, 8, 8], 50)).toBeNull();
  });

  it("returns null when stdev is 0 (constant series)", () => {
    expect(detectAprRegimeChange([8, 8, 8, 8, 8, 8, 8], 25)).toBeNull();
  });
});
