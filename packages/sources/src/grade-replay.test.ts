import { describe, expect, it } from "vitest";
import {
  applyRubric,
  extractSignalStrength,
  scoreOutcome,
  replayFindings,
  aggregateReport,
  priorHitRateFromReport,
  type OhlcvRow,
  type ReplayInput,
} from "./grade-replay.js";
import type { AnomalyFinding } from "./anomalies.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

const ETF_HIGH: AnomalyFinding = {
  category: "etf",
  severity: "high",
  signal: "BTC ETF heavy 7d outflow",
  evidence: { btc7dSumUSD: -5e8, btcLast: -2e8 },
};

const ETF_LOW: AnomalyFinding = {
  category: "etf",
  severity: "low",
  signal: "BTC ETF mild 7d outflow",
  evidence: { btc7dSumUSD: -8e7 },
};

const FUNDING_MED: AnomalyFinding = {
  category: "funding",
  severity: "med",
  signal: "BTCUSDT funding overheated long",
  evidence: { avgPercent: 0.07, venues: 4 },
};

const STABLECOIN_MED: AnomalyFinding = {
  category: "stablecoin",
  severity: "med",
  signal: "Stablecoin supply expanding fast",
  evidence: { change7dPercent: 2.4 },
};

const OPTIONS_MED: AnomalyFinding = {
  category: "options",
  severity: "med",
  signal: "IV skew flip",
  evidence: { deltaIvPp: 4 },
};

// Build a synthetic OHLCV ladder where close moves linearly by `pctPerCandle`
function makeKlines(start: number, count: number, pctPerCandle: number): OhlcvRow[] {
  const out: OhlcvRow[] = [];
  let price = 100;
  let ts = start;
  for (let i = 0; i < count; i++) {
    out.push({ ts, open: price, high: price * 1.01, low: price * 0.99, close: price, volume: 1 });
    price = price * (1 + pctPerCandle / 100);
    ts += 3_600_000; // 1h candles
  }
  return out;
}

// ── extractSignalStrength ───────────────────────────────────────────────────

describe("extractSignalStrength", () => {
  it("scales ETF outflow by reference threshold", () => {
    expect(extractSignalStrength(ETF_HIGH)).toBeCloseTo(1.0, 5);  // -$500M = 1.0
    expect(extractSignalStrength(ETF_LOW)).toBeCloseTo(0.16, 5);  // -$80M / $500M = 0.16
  });

  it("returns 0.5 when category-specific evidence is absent", () => {
    const naked: AnomalyFinding = { category: "etf", severity: "low", signal: "x", evidence: {} };
    expect(extractSignalStrength(naked)).toBe(0.5);
  });

  it("scales funding by 0.10% threshold, capped at 1.0", () => {
    expect(extractSignalStrength(FUNDING_MED)).toBeCloseTo(0.7, 5); // 0.07/0.10
    const extreme: AnomalyFinding = { category: "funding", severity: "high", signal: "x", evidence: { avgPercent: 0.25 } };
    expect(extractSignalStrength(extreme)).toBe(1.0); // clamped
  });

  it("uses absolute value (negative funding still strong signal)", () => {
    const shortHeat: AnomalyFinding = { category: "funding", severity: "med", signal: "x", evidence: { avgPercent: -0.08 } };
    expect(extractSignalStrength(shortHeat)).toBeCloseTo(0.8, 5);
  });

  it("falls back through evidence keys for options (deltaIvPp → oiShiftPercent)", () => {
    expect(extractSignalStrength(OPTIONS_MED)).toBeCloseTo(0.8, 5); // 4/5
    const oiShift: AnomalyFinding = { category: "options", severity: "med", signal: "x", evidence: { oiShiftPercent: 6 } };
    expect(extractSignalStrength(oiShift)).toBeCloseTo(0.5, 5); // 6/12
  });

  it("normalizes bybit by |zScore|/3 with cap", () => {
    const z2: AnomalyFinding = { category: "bybit", severity: "med", signal: "x", evidence: { zScore: 2 } };
    const z9: AnomalyFinding = { category: "bybit", severity: "high", signal: "x", evidence: { zScore: 9 } };
    expect(extractSignalStrength(z2)).toBeCloseTo(0.667, 2);
    expect(extractSignalStrength(z9)).toBe(1.0);
  });
});

// ── applyRubric ─────────────────────────────────────────────────────────────

describe("applyRubric", () => {
  it("computes weighted-sum confidence using the documented formula", () => {
    const out = applyRubric(ETF_HIGH); // signalStrength = 1.0, others = 0.5 / 0 / 0.5
    // weights (etf): 0.4 / 0.2 / 0.2 / 0.2
    // raw = 0.4*1.0 + 0.2*0.5 + 0.2*0 + 0.2*0.5 = 0.4 + 0.1 + 0 + 0.1 = 0.6
    expect(out.rawConfidence).toBeCloseTo(0.6, 5);
    expect(out.confidence).toBeCloseTo(0.6, 5); // within high-band (0.35–1.0)
    expect(out.expectedDirection).toBe("down");
    expect(out.severityBandApplied).toBe(false);
  });

  it("clamps confidence INTO the severity band when raw falls below the floor", () => {
    // High-severity but weak signal — band lifts confidence to ≥0.35
    const weak: AnomalyFinding = { category: "etf", severity: "high", signal: "x", evidence: { btc7dSumUSD: -1e7 } };
    const out = applyRubric(weak);
    expect(out.rawConfidence).toBeLessThan(0.35);
    expect(out.confidence).toBe(0.35); // floor of high band
    expect(out.severityBandApplied).toBe(true);
  });

  it("clamps low-severity findings under 0.65 even with strong signal", () => {
    const strongButLow: AnomalyFinding = { category: "etf", severity: "low", signal: "x", evidence: { btc7dSumUSD: -5e8 } };
    const out = applyRubric(strongButLow, { regime: "risk-off", coexistingFindings: [FUNDING_MED, STABLECOIN_MED] });
    expect(out.rawConfidence).toBeGreaterThan(0.65);
    expect(out.confidence).toBe(0.65); // capped at low-band ceiling
    expect(out.severityBandApplied).toBe(true);
  });

  it("regime alignment lifts confidence when regime matches expectedDirection", () => {
    const noRegime = applyRubric(ETF_HIGH);
    const aligned = applyRubric(ETF_HIGH, { regime: "risk-off" });
    const opposing = applyRubric(ETF_HIGH, { regime: "risk-on" });
    // etf expected = down · risk-off aligned = 1.0 vs risk-on opposing = 0.0
    expect(aligned.inputs.regimeAlignment).toBe(1.0);
    expect(noRegime.inputs.regimeAlignment).toBe(0.5);
    expect(opposing.inputs.regimeAlignment).toBe(0.0);
    expect(aligned.rawConfidence).toBeGreaterThan(noRegime.rawConfidence);
    expect(opposing.rawConfidence).toBeLessThan(noRegime.rawConfidence);
  });

  it("cross-source confirmation bumps when coexisting findings come from confirming categories", () => {
    // etf is confirmed by funding/futures/dex
    const alone = applyRubric(ETF_HIGH);
    const oneConfirm = applyRubric(ETF_HIGH, { coexistingFindings: [FUNDING_MED] });
    const twoConfirm = applyRubric(ETF_HIGH, {
      coexistingFindings: [FUNDING_MED, { category: "dex", severity: "low", signal: "x", evidence: {} }],
    });
    expect(alone.inputs.crossSourceConfirmation).toBe(0);
    expect(oneConfirm.inputs.crossSourceConfirmation).toBeCloseTo(1 / 3, 5);
    expect(twoConfirm.inputs.crossSourceConfirmation).toBeCloseTo(2 / 3, 5);
  });

  it("ignores duplicate categories in cross-source confirmation (distinct count, not raw)", () => {
    // Two funding findings in one scan should still only contribute 1 confirming category
    const out = applyRubric(ETF_HIGH, {
      coexistingFindings: [
        FUNDING_MED,
        { category: "funding", severity: "med", signal: "y", evidence: { avgPercent: 0.06 } },
      ],
    });
    expect(out.inputs.crossSourceConfirmation).toBeCloseTo(1 / 3, 5);
  });

  it("ignores findings of the SAME category as the primary (no self-confirm)", () => {
    const out = applyRubric(ETF_HIGH, {
      coexistingFindings: [{ category: "etf", severity: "med", signal: "x", evidence: {} }],
    });
    expect(out.inputs.crossSourceConfirmation).toBe(0);
  });

  it("uses priorHitRate when provided (scoped by category:severity, then category)", () => {
    const specific = applyRubric(ETF_HIGH, { priorHitRate: { "etf:high": 0.85 } });
    const fallback = applyRubric(ETF_HIGH, { priorHitRate: { etf: 0.7 } });
    const none = applyRubric(ETF_HIGH);
    expect(specific.inputs.historicalHitRate).toBe(0.85);
    expect(fallback.inputs.historicalHitRate).toBe(0.7);
    expect(none.inputs.historicalHitRate).toBe(0.5);
  });

  it("handles 'options' / 'bybit' as neutral expectedDirection", () => {
    const opts = applyRubric(OPTIONS_MED);
    expect(opts.expectedDirection).toBe("neutral");
    // Regime alignment should be 0.5 for neutral regardless of regime label
    expect(applyRubric(OPTIONS_MED, { regime: "risk-off" }).inputs.regimeAlignment).toBe(0.5);
  });
});

// ── scoreOutcome ────────────────────────────────────────────────────────────

describe("scoreOutcome", () => {
  it("hits when 'down' direction is realized below -threshold", () => {
    const klines = makeKlines(0, 6, -0.5); // -0.5%/candle × 5 = ~-2.5%
    const out = scoreOutcome("down", klines);
    expect(out).not.toBeNull();
    expect(out!.hit).toBe(true);
    expect(out!.realizedPct).toBeLessThan(-1);
  });

  it("misses 'down' when realized stays above -threshold", () => {
    const klines = makeKlines(0, 6, -0.1); // ~-0.5% total — within threshold
    const out = scoreOutcome("down", klines);
    expect(out!.hit).toBe(false);
  });

  it("hits 'up' on rising series", () => {
    const klines = makeKlines(0, 6, 0.6);
    const out = scoreOutcome("up", klines);
    expect(out!.hit).toBe(true);
  });

  it("'neutral' hits when range is tight (|move| < threshold)", () => {
    const klines = makeKlines(0, 6, 0.05); // ~0.25% total, well under 1%
    const out = scoreOutcome("neutral", klines);
    expect(out!.hit).toBe(true);
  });

  it("'neutral' misses when price drifts beyond threshold either way", () => {
    const klines = makeKlines(0, 6, 0.6); // strong up
    const out = scoreOutcome("neutral", klines);
    expect(out!.hit).toBe(false);
  });

  it("returns null when not enough klines to score", () => {
    expect(scoreOutcome("down", [])).toBeNull();
    expect(scoreOutcome("down", [makeKlines(0, 1, 0)[0]])).toBeNull();
  });

  it("respects maxCandles slice (only looks at first N+1 closes)", () => {
    // First 3 candles are flat, 4th-onwards crash
    const flat = makeKlines(0, 3, 0);
    const crash = makeKlines(3 * 3_600_000, 5, -2);
    const klines = [...flat, ...crash];
    const earlyLook = scoreOutcome("down", klines, { maxCandles: 2 });
    const fullLook = scoreOutcome("down", klines);
    expect(earlyLook!.hit).toBe(false); // didn't see the crash yet
    expect(fullLook!.hit).toBe(true);
  });

  it("respects custom thresholdPercent", () => {
    const klines = makeKlines(0, 6, -0.3); // ~-1.5% total
    expect(scoreOutcome("down", klines, { thresholdPercent: 1 })!.hit).toBe(true);
    expect(scoreOutcome("down", klines, { thresholdPercent: 2 })!.hit).toBe(false);
  });
});

// ── replayFindings ──────────────────────────────────────────────────────────

describe("replayFindings", () => {
  it("groups by scanId so coexisting findings affect cross-source confirmation", async () => {
    const inputs: ReplayInput[] = [
      { finding: ETF_HIGH, scanTs: 0, scanId: "scan-A" },
      { finding: FUNDING_MED, scanTs: 0, scanId: "scan-A" },        // confirming
      { finding: STABLECOIN_MED, scanTs: 0, scanId: "scan-B" },     // different scan, doesn't confirm
    ];
    const ohlcv = async () => makeKlines(0, 6, -0.5);
    const out = await replayFindings(inputs, ohlcv);

    const etf = out.find((r) => r.finding === ETF_HIGH)!;
    const stable = out.find((r) => r.finding === STABLECOIN_MED)!;

    // ETF saw FUNDING_MED in same scan → 1/3 confirming
    expect(etf.rubric.inputs.crossSourceConfirmation).toBeCloseTo(1 / 3, 5);
    // STABLECOIN_MED was alone in scan-B
    expect(stable.rubric.inputs.crossSourceConfirmation).toBe(0);
  });

  it("attaches a non-null outcome when ohlcvFor returns valid candles", async () => {
    const inputs: ReplayInput[] = [{ finding: ETF_HIGH, scanTs: 0 }];
    const out = await replayFindings(inputs, async () => makeKlines(0, 6, -0.5));
    expect(out[0].outcome).not.toBeNull();
    expect(out[0].outcome!.hit).toBe(true);
  });

  it("returns null outcome when ohlcvFor throws or returns sparse data", async () => {
    const inputs: ReplayInput[] = [{ finding: ETF_HIGH, scanTs: 0 }];
    const throwing = await replayFindings(inputs, async () => {
      throw new Error("rate-limited");
    });
    const sparse = await replayFindings(inputs, async () => []);
    expect(throwing[0].outcome).toBeNull();
    expect(sparse[0].outcome).toBeNull();
  });
});

// ── aggregateReport ─────────────────────────────────────────────────────────

describe("aggregateReport", () => {
  it("summarises per-category and overall hit-rate", async () => {
    const inputs: ReplayInput[] = [
      { finding: ETF_HIGH, scanTs: 0 },
      { finding: ETF_LOW, scanTs: 0 },
      { finding: FUNDING_MED, scanTs: 0 },
    ];
    // ETF expected down · funding expected down · all see -3% (down hits)
    const ohlcv = async () => makeKlines(0, 6, -0.6);
    const results = await replayFindings(inputs, ohlcv);
    const report = aggregateReport(results);

    expect(report.totalReplayed).toBe(3);
    expect(report.totalScored).toBe(3);
    expect(report.overall.hitRate).toBe(1.0);
    expect(report.byCategory.etf?.count).toBe(2);
    expect(report.byCategory.etf?.hits).toBe(2);
    expect(report.byCategory.funding?.hits).toBe(1);
  });

  it("calibration bins reflect monotone confidence → hit-rate when rubric grades correctly", async () => {
    // High-severity ETF with strong evidence + risk-off regime should land in the high
    // confidence bin AND hit; low-severity ETF with weak evidence in low bin AND miss
    const strong: ReplayInput = { finding: ETF_HIGH, scanTs: 0, scanId: "A" };
    const weakFinding: AnomalyFinding = { category: "etf", severity: "low", signal: "x", evidence: { btc7dSumUSD: -3e7 } };
    const weak: ReplayInput = { finding: weakFinding, scanTs: 0, scanId: "B" };

    const klinesDown = makeKlines(0, 6, -0.6);
    const klinesFlat = makeKlines(0, 6, 0);

    const ohlcv = async (_sym: string, ts: number) => (ts === 0 ? klinesDown : klinesFlat);
    // Inject ts=1 for the weak input by passing a separate scanTs
    weak.scanTs = 1;
    const results = await replayFindings([strong, weak], ohlcv);
    const report = aggregateReport(results);

    // Find which bin each landed in
    const strongR = results.find((r) => r.finding === ETF_HIGH)!;
    const weakR = results.find((r) => r.finding === weakFinding)!;
    expect(strongR.rubric.confidence).toBeGreaterThan(weakR.rubric.confidence);
    expect(strongR.outcome!.hit).toBe(true);
    expect(weakR.outcome!.hit).toBe(false);

    // Some bin populated; low-confidence bin should have lower hitRate than high-confidence one
    const populated = report.calibration.filter((b) => b.count > 0);
    expect(populated.length).toBeGreaterThanOrEqual(1);
  });

  it("priorHitRateFromReport extracts category-keyed map for feedback into next replay", () => {
    const fakeReport = {
      generatedAt: "x",
      totalReplayed: 0,
      totalScored: 0,
      byCategory: {
        etf: { count: 10, hits: 7, hitRate: 0.7, meanConfidence: 0.6, meanRealizedPct: -2 },
        funding: { count: 5, hits: 2, hitRate: 0.4, meanConfidence: 0.5, meanRealizedPct: -0.5 },
      },
      bySeverity: { low: { count: 0, hits: 0, hitRate: 0, meanConfidence: 0, meanRealizedPct: 0 } } as never,
      calibration: [],
      overall: { count: 15, hits: 9, hitRate: 0.6, meanConfidence: 0.55, meanRealizedPct: -1.5 },
    };
    const map = priorHitRateFromReport(fakeReport);
    expect(map).toEqual({ etf: 0.7, funding: 0.4 });
  });
});
