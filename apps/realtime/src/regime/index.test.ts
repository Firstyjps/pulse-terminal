import { describe, expect, it } from "vitest";
import {
  REGIME_THRESHOLDS,
  RegimeStore,
  computeRegime,
  type RegimeReading,
} from "./index.js";

const NOW = 1_745_842_200_000; // fixed reference time

// Baseline reading — neutral on every axis. Spread + override per fixture.
const NEUTRAL: RegimeReading = {
  dominance: 53,
  dxy: 105,
  btcFunding: 0.005, // below FUNDING_POS, above 0
  ethFunding: 0.005,
  solFunding: 0.005,
};

// Prior reading from 24h ago, used to fabricate trend deltas. Defaults to a
// copy of NEUTRAL so trend deltas are zero unless a fixture overrides them.
const flatPrior: RegimeReading = { ...NEUTRAL };

describe("computeRegime — branch coverage", () => {
  it("Risk-Off (3/3 triggers): dom rising+high, DXY rising+high, funding cluster negative → score -1", () => {
    const current: RegimeReading = {
      dominance: 58,
      dxy: 108,
      btcFunding: -0.02,
      ethFunding: -0.015,
      solFunding: -0.04,
    };
    const prior: RegimeReading = { dominance: 56, dxy: 106.5, btcFunding: 0, ethFunding: 0, solFunding: 0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.regime).toBe("Risk-Off");
    expect(r.signals.riskOffCount).toBe(3);
    expect(r.signals.riskOnCount).toBe(0);
    expect(r.score).toBe(-1);
    expect(r.reason).toContain("BTC dom 58.0% rising");
    expect(r.reason).toContain("DXY 108.0 firming");
    expect(r.reason).toContain("funding negative on 3/3 majors");
  });

  it("Risk-Off (2/3 triggers) with one offsetting risk-on signal: regime stays Risk-Off, intensity dampened to -1/3", () => {
    const current: RegimeReading = {
      dominance: 57,
      dxy: 103.5,            // weak DXY → 1 risk-on signal, but DXY trigger requires rising AND high → no risk-off contribution
      btcFunding: -0.01,
      ethFunding: -0.02,
      solFunding: 0.005,     // 1 positive — still 2 negatives = cluster
    };
    const prior: RegimeReading = { dominance: 55.5, dxy: 103.5, btcFunding: 0, ethFunding: 0, solFunding: 0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.regime).toBe("Risk-Off");          // 2 risk-off triggers wins regardless of risk-on dampening
    expect(r.signals.riskOffCount).toBe(2);
    expect(r.signals.dxyWeak).toBe(true);
    expect(r.signals.riskOnCount).toBe(1);      // dxyWeak alone
    // score = (riskOn - riskOff)/3 = (1 - 2)/3 = -0.333
    expect(r.score).toBeCloseTo(-1 / 3, 2);
  });

  it("Risk-Off (2/3 triggers, clean): dom rising+high + DXY rising+high, no offsetting risk-on → score -2/3", () => {
    const current: RegimeReading = {
      dominance: 57,
      dxy: 108,
      btcFunding: 0.005, // neutral funding — no cluster either way
      ethFunding: 0.005,
      solFunding: 0.005,
    };
    const prior: RegimeReading = { dominance: 55.5, dxy: 106.5, btcFunding: 0, ethFunding: 0, solFunding: 0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.regime).toBe("Risk-Off");
    expect(r.signals.riskOffCount).toBe(2);
    expect(r.signals.riskOnCount).toBe(0);
    expect(r.score).toBeCloseTo(-2 / 3, 2);
  });

  it("Risk-On (3/3 triggers): dom falling, funding positive cluster, DXY weak → score +1", () => {
    const current: RegimeReading = {
      dominance: 49,
      dxy: 102,
      btcFunding: 0.04,
      ethFunding: 0.03,
      solFunding: 0.05,
    };
    const prior: RegimeReading = { dominance: 51, dxy: 105, btcFunding: 0, ethFunding: 0, solFunding: 0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.regime).toBe("Risk-On");
    expect(r.signals.riskOnCount).toBe(3);
    expect(r.score).toBe(1);
    expect(r.reason).toContain("BTC dom falling to 49.0%");
    expect(r.reason).toContain("funding positive on 3/3 majors");
    expect(r.reason).toContain("DXY soft at 102.0");
  });

  it("Range — 2/3 risk-on triggers (need ALL 3): falling + cluster but DXY mid → not Risk-On", () => {
    const current: RegimeReading = {
      dominance: 50,
      dxy: 105,             // mid-range — neither weak nor high
      btcFunding: 0.03,
      ethFunding: 0.04,
      solFunding: 0.02,
    };
    const prior: RegimeReading = { dominance: 52, dxy: 105, btcFunding: 0, ethFunding: 0, solFunding: 0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.regime).toBe("Range");
    expect(r.signals.riskOnCount).toBe(2);
    expect(r.signals.riskOffCount).toBe(0);
    expect(r.score).toBeCloseTo(2 / 3, 2); // Range can still lean bullish on score
    expect(r.reason).toContain("2/3 risk-on triggers");
  });

  it("Range — flat (no signals, no prior): all neutral → score 0", () => {
    const r = computeRegime({ current: NEUTRAL, now: NOW });
    expect(r.regime).toBe("Range");
    expect(r.signals.riskOffCount).toBe(0);
    expect(r.signals.riskOnCount).toBe(0);
    expect(r.signals.hasPrior).toBe(false);
    expect(r.score).toBe(0);
    expect(r.reason).toContain("no decisive macro signal");
    expect(r.reason).toContain("no prior reading");
  });

  it("Range — net-zero (1 risk-off + 1 risk-on): cancels out → score 0", () => {
    const current: RegimeReading = {
      dominance: 50,         // not high — so dom rising+high trigger fails
      dxy: 103,              // weak (Risk-On trigger)
      btcFunding: -0.02,
      ethFunding: -0.03,
      solFunding: -0.04,     // negative cluster (Risk-Off trigger)
    };
    const prior: RegimeReading = { dominance: 50, dxy: 103, btcFunding: 0, ethFunding: 0, solFunding: 0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.regime).toBe("Range");
    expect(r.signals.riskOffCount).toBe(1);
    expect(r.signals.riskOnCount).toBeGreaterThanOrEqual(1);
    // score = (riskOn - riskOff) / 3; with 1-1 it's 0
    expect(r.score).toBe(0);
  });

  it("BTC vix panic nudges Risk-Off score (clamped at -1)", () => {
    const current: RegimeReading = {
      dominance: 58,
      dxy: 108,
      btcFunding: -0.02,
      ethFunding: -0.015,
      solFunding: -0.04,
      btcVix: 80,
    };
    const prior: RegimeReading = { dominance: 56, dxy: 106.5, btcFunding: 0, ethFunding: 0, solFunding: 0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.regime).toBe("Risk-Off");
    expect(r.score).toBe(-1); // already at floor
  });

  it("BTC vix panic on Range pushes score below zero", () => {
    const current: RegimeReading = { ...NEUTRAL, btcVix: 80 };
    const r = computeRegime({ current, prior: flatPrior, now: NOW });
    expect(r.regime).toBe("Range");
    expect(r.score).toBeLessThan(0);
    expect(r.score).toBeCloseTo(-REGIME_THRESHOLDS.VIX_NUDGE, 3);
  });

  it("boundary — dominance exactly at HIGH_DOM is NOT high", () => {
    const current: RegimeReading = {
      dominance: REGIME_THRESHOLDS.HIGH_DOM, // 55
      dxy: 108,
      btcFunding: -0.02,
      ethFunding: -0.015,
      solFunding: -0.04,
    };
    const prior: RegimeReading = { dominance: 53, dxy: 106.5, btcFunding: 0, ethFunding: 0, solFunding: 0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.signals.btcDomHigh).toBe(false); // strict >, not >=
    // dom rising-but-not-high fails the dom trigger; DXY rising+high + funding cluster = 2 → still Risk-Off
    expect(r.signals.riskOffCount).toBe(2);
    expect(r.regime).toBe("Risk-Off");
  });

  it("trend epsilon — sub-noise dominance moves don't count as rising", () => {
    const current: RegimeReading = { ...NEUTRAL, dominance: 55.05 };
    const prior: RegimeReading = { ...NEUTRAL, dominance: 55.0 };
    const r = computeRegime({ current, prior, now: NOW });
    expect(r.signals.btcDomRising).toBe(false); // delta 0.05 < 0.1 eps
    expect(r.signals.btcDomFalling).toBe(false);
  });
});

describe("RegimeStore — rolling 24h prior", () => {
  it("first record has no prior; trends collapse to false", () => {
    const store = new RegimeStore();
    const snap = store.record(NEUTRAL, NOW);
    expect(snap.signals.hasPrior).toBe(false);
    expect(snap.signals.btcDomRising).toBe(false);
  });

  it("uses 24h-prior reading for trend detection once history fills", () => {
    const store = new RegimeStore();
    const past: RegimeReading = { ...NEUTRAL, dominance: 53, dxy: 105 };
    const present: RegimeReading = { ...NEUTRAL, dominance: 56, dxy: 107 };

    // record reading from ~24h ago
    store.record(past, NOW - 24 * 3_600_000);
    // record reading "now"
    const snap = store.record(present, NOW);

    expect(snap.signals.hasPrior).toBe(true);
    expect(snap.signals.btcDomRising).toBe(true);
    expect(snap.signals.dxyRising).toBe(true);
  });

  it("ignores readings within 6h (too fresh to call trend)", () => {
    const store = new RegimeStore();
    const past: RegimeReading = { ...NEUTRAL, dominance: 53 };
    const present: RegimeReading = { ...NEUTRAL, dominance: 57 };

    store.record(past, NOW - 3 * 3_600_000); // only 3h ago
    const snap = store.record(present, NOW);

    expect(snap.signals.hasPrior).toBe(false); // window guard kicks in
    expect(snap.signals.btcDomRising).toBe(false);
  });

  it("ignores readings older than 30h (stale)", () => {
    const store = new RegimeStore();
    const past: RegimeReading = { ...NEUTRAL, dominance: 53 };
    const present: RegimeReading = { ...NEUTRAL, dominance: 57 };

    store.record(past, NOW - 36 * 3_600_000); // 36h ago — pruned/ignored
    const snap = store.record(present, NOW);

    expect(snap.signals.hasPrior).toBe(false);
  });

  it("get() returns latest snapshot; null before any record", () => {
    const store = new RegimeStore();
    expect(store.get()).toBeNull();
    store.record(NEUTRAL, NOW);
    expect(store.get()).not.toBeNull();
    expect(store.get()?.reading).toEqual(NEUTRAL);
  });

  it("prunes history older than retention window", () => {
    const store = new RegimeStore();
    store.record(NEUTRAL, NOW - 40 * 3_600_000); // older than 30h retain
    store.record(NEUTRAL, NOW - 20 * 3_600_000);
    store.record(NEUTRAL, NOW);
    // After the third record, the 40h-old entry should be pruned.
    expect(store.size()).toBe(2);
  });
});
