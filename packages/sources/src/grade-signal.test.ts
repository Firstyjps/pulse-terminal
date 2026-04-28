import { describe, expect, it } from "vitest";
import { buildGradeSignalRubric } from "./grade-signal.js";
import type { AnomalyFinding } from "./anomalies.js";

const ETF_OUTFLOW: AnomalyFinding = {
  category: "etf",
  severity: "high",
  signal: "BTC ETF heavy 7d outflow",
  evidence: { btc7dSumUSD: -3.5e8, btcLast: -2e8 },
};

const FUNDING_HOT: AnomalyFinding = {
  category: "funding",
  severity: "med",
  signal: "BTCUSDT funding overheated long across venues",
  evidence: { avgPercent: 0.07, venues: 4 },
};

const STABLECOIN_BUILDUP: AnomalyFinding = {
  category: "stablecoin",
  severity: "med",
  signal: "Stablecoin supply expanding fast (dry powder building)",
  evidence: { change7dPercent: 2.1 },
};

describe("buildGradeSignalRubric", () => {
  it("echoes the finding and includes a category-specific rubric", () => {
    const out = buildGradeSignalRubric(ETF_OUTFLOW);
    expect(out.finding).toBe(ETF_OUTFLOW);
    expect(out.rubric.expectedDirection).toBe("down");
    expect(out.rubric.considerations.length).toBeGreaterThanOrEqual(3);
    // Every consideration should mention something concrete (not generic).
    for (const c of out.rubric.considerations) {
      expect(c.length).toBeGreaterThan(20);
    }
  });

  it("weights for funding category bias toward signal strength", () => {
    const out = buildGradeSignalRubric(FUNDING_HOT);
    const w = out.rubric.weights;
    expect(w.signalStrength).toBeGreaterThan(w.regimeAlignment);
    expect(w.signalStrength).toBeGreaterThan(w.historicalHitRate);
    // Weights should sum to ~1
    const sum = w.signalStrength + w.regimeAlignment + w.crossSourceConfirmation + w.historicalHitRate;
    expect(sum).toBeCloseTo(1, 5);
  });

  it("stablecoin findings get expectedDirection 'up' (matches backtest scorer)", () => {
    const out = buildGradeSignalRubric(STABLECOIN_BUILDUP);
    expect(out.rubric.expectedDirection).toBe("up");
  });

  it("instructions reference the severity confidence band", () => {
    const out = buildGradeSignalRubric(ETF_OUTFLOW);  // high severity → 0.35–1.0 band
    expect(out.instructions).toMatch(/0\.35/);
    expect(out.instructions).toMatch(/1/);
    expect(out.instructions.toLowerCase()).toContain("high");
  });

  it("low-severity findings cap the upper band below 1.0", () => {
    const lowSev: AnomalyFinding = {
      category: "dex",
      severity: "low",
      signal: "DEX 24h volume collapse",
      evidence: { change24hPercent: -28 },
    };
    const out = buildGradeSignalRubric(lowSev);
    expect(out.instructions).toMatch(/0\.65/);
  });

  it("output schema lists all 4 required fields", () => {
    const out = buildGradeSignalRubric(ETF_OUTFLOW);
    const keys = Object.keys(out.outputSchema).sort();
    expect(keys).toEqual(["confidence", "reasoning", "risk_flags", "suggested_action"]);
  });

  it("formula string references all four weights", () => {
    const out = buildGradeSignalRubric(ETF_OUTFLOW);
    expect(out.rubric.formula).toContain("signalStrength");
    expect(out.rubric.formula).toContain("regimeAlignment");
    expect(out.rubric.formula).toContain("crossSourceConfirmation");
    expect(out.rubric.formula).toContain("historicalHitRate");
    expect(out.rubric.formula).toContain("clamp");
  });

  it("passes through marketContext when provided", () => {
    const ctx = { btcPrice: 76800, regime: "risk-off" };
    const out = buildGradeSignalRubric(ETF_OUTFLOW, ctx);
    expect(out.marketContext).toEqual(ctx);
  });

  it("marketContext defaults to null and instructions flag the absence", () => {
    const out = buildGradeSignalRubric(ETF_OUTFLOW);
    expect(out.marketContext).toBeNull();
    expect(out.instructions.toLowerCase()).toContain("marketcontext");
  });
});
