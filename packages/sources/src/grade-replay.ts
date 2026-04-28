// Phase 4 — graded backtest engine.
//
// `grade_signal` (the MCP tool) hands the host LLM a rubric and lets it grade
// inline. To *evaluate* the rubric — does higher-confidence track reality? —
// we need a deterministic, replay-friendly version. This file is that:
//
//   applyRubric(finding, ctx?)  → { confidence, inputs }   pure function
//   scoreOutcome(direction, klines, opts)
//                                → { hit, realizedPct }     pure function
//   replayFindings(scans, ohlcvFor)
//                                → ReplayResult[]           pure (I/O via callback)
//   aggregateReport(results)    → AggregateReport          pure
//
// The rubric formula here mirrors the one `buildGradeSignalRubric()` documents
// to the LLM (`confidence = clamp(Σ weight_i × input_i, 0, 1)`), with concrete
// per-category extractors driving the inputs. If the LLM grades a finding
// significantly differently from what `applyRubric` produces, the gap is the
// signal we want to study — calibration drift, not failure.
//
// Browser-safe: no I/O imports. JSONL reads + binance kline fetches happen in
// callers (apps/web API route or a node CLI), which inject the OHLCV via
// `ohlcvFor` callback.

import type {
  AnomalyCategory,
  AnomalyFinding,
  AnomalySeverity,
} from "./anomalies.js";

// ── Types ───────────────────────────────────────────────────────────────────

/** OHLCV row in Binance-style ordering (open, high, low, close, volume). */
export interface OhlcvRow {
  ts: number; // ms epoch of candle open
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface ApplyRubricContext {
  /** Coexisting findings in the SAME scan — used for cross-source confirmation. */
  coexistingFindings?: AnomalyFinding[];
  /** Optional macro regime: "risk-on" | "risk-off" | "chop" — used for regime alignment. */
  regime?: "risk-on" | "risk-off" | "chop";
  /** Optional historical hit-rate map keyed by `${category}:${severity}` (from a prior aggregate report). */
  priorHitRate?: Record<string, number>;
}

export interface ApplyRubricResult {
  confidence: number;            // 0..1, post severity-band clamp
  rawConfidence: number;         // pre severity-band clamp (= weighted sum, clamped 0..1)
  inputs: {
    signalStrength: number;      // 0..1
    regimeAlignment: number;     // 0..1
    crossSourceConfirmation: number; // 0..1
    historicalHitRate: number;   // 0..1
  };
  expectedDirection: "up" | "down" | "neutral";
  severityBandApplied: boolean;  // true if confidence was clamped INTO the severity band
}

export interface ScoreOutcomeResult {
  hit: boolean;
  realizedPct: number;           // (last - first) / first × 100
  expectedDirection: "up" | "down" | "neutral";
  threshold: number;             // % move that counts as a directional hit
  candlesUsed: number;
}

export interface ReplayInput {
  finding: AnomalyFinding;
  scanTs: number;                // ms epoch of the scan that produced the finding
  scanId?: string;
  /** Optional symbol override; defaults to BTCUSDT (matches the scanner's default). */
  symbol?: string;
}

export interface ReplayResult extends ReplayInput {
  rubric: ApplyRubricResult;
  outcome: ScoreOutcomeResult | null; // null = no OHLCV available (lookahead truncated)
}

export interface BucketStats {
  count: number;
  hits: number;
  hitRate: number;               // hits / count
  meanConfidence: number;        // mean of rubric.confidence
  meanRealizedPct: number;       // mean of outcome.realizedPct (excludes nulls)
}

export interface CalibrationBucket {
  bin: string;                   // e.g. "0.0-0.2"
  binMin: number;
  binMax: number;
  count: number;
  hitRate: number;
  meanConfidence: number;
}

export interface AggregateReport {
  generatedAt: string;
  totalReplayed: number;
  totalScored: number;           // count with non-null outcome
  byCategory: Partial<Record<AnomalyCategory, BucketStats>>;
  bySeverity: Record<AnomalySeverity, BucketStats>;
  calibration: CalibrationBucket[];
  overall: BucketStats;
}

// ── Constants ───────────────────────────────────────────────────────────────

const WEIGHTS: Record<AnomalyCategory, ApplyRubricResult["inputs"]> = {
  funding:    { signalStrength: 0.45, regimeAlignment: 0.15, crossSourceConfirmation: 0.25, historicalHitRate: 0.15 },
  futures:    { signalStrength: 0.4,  regimeAlignment: 0.2,  crossSourceConfirmation: 0.25, historicalHitRate: 0.15 },
  stablecoin: { signalStrength: 0.3,  regimeAlignment: 0.3,  crossSourceConfirmation: 0.2,  historicalHitRate: 0.2  },
  etf:        { signalStrength: 0.4,  regimeAlignment: 0.2,  crossSourceConfirmation: 0.2,  historicalHitRate: 0.2  },
  tvl:        { signalStrength: 0.4,  regimeAlignment: 0.2,  crossSourceConfirmation: 0.2,  historicalHitRate: 0.2  },
  dex:        { signalStrength: 0.4,  regimeAlignment: 0.2,  crossSourceConfirmation: 0.2,  historicalHitRate: 0.2  },
  options:    { signalStrength: 0.4,  regimeAlignment: 0.2,  crossSourceConfirmation: 0.2,  historicalHitRate: 0.2  },
  bybit:      { signalStrength: 0.4,  regimeAlignment: 0.2,  crossSourceConfirmation: 0.2,  historicalHitRate: 0.2  },
};

const EXPECTED_DIRECTION: Record<AnomalyCategory, "up" | "down" | "neutral"> = {
  etf: "down", funding: "down", futures: "down", stablecoin: "up",
  tvl: "down", dex: "down", options: "neutral", bybit: "neutral",
};

const SEVERITY_BAND: Record<AnomalySeverity, { min: number; max: number }> = {
  low:  { min: 0.0,  max: 0.65 },
  med:  { min: 0.2,  max: 0.85 },
  high: { min: 0.35, max: 1.0  },
};

/** Categories that confirm a primary category — "if I see X, also seeing Y reinforces it". */
const CONFIRMING: Record<AnomalyCategory, AnomalyCategory[]> = {
  etf:        ["funding", "futures", "dex"],
  funding:    ["etf", "futures", "options"],
  futures:    ["etf", "funding", "options"],
  stablecoin: ["etf", "dex", "tvl"],
  tvl:        ["stablecoin", "dex"],
  dex:        ["stablecoin", "tvl"],
  options:    ["funding", "futures"],
  bybit:      ["options", "funding"],
};
const MAX_CONFIRMING = 3;

// ── Pure helpers ────────────────────────────────────────────────────────────

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Extract a 0..1 signal-strength score from a finding's evidence. Per-category
 * thresholds — "what does an extreme reading look like for THIS pattern?".
 * Falls back to 0.5 if the relevant evidence field is missing (the LLM gets a
 * neutral signal — the finding existing at all is a partial signal).
 */
export function extractSignalStrength(finding: AnomalyFinding): number {
  const e = finding.evidence;
  const num = (k: string): number | undefined => {
    const v = e?.[k];
    return typeof v === "number" && Number.isFinite(v) ? v : undefined;
  };

  switch (finding.category) {
    case "etf": {
      // Reference: -$500M / 7d = textbook extreme outflow → 1.0
      const v = num("btc7dSumUSD") ?? num("eth7dSumUSD") ?? num("btcLast");
      return v == null ? 0.5 : clamp01(Math.abs(v) / 5e8);
    }
    case "funding": {
      // 0.10% / 8h is rough cap → 1.0
      const v = num("avgPercent") ?? num("ratePercent");
      return v == null ? 0.5 : clamp01(Math.abs(v) / 0.10);
    }
    case "futures": {
      // funding 0.05% = warning, 0.10% = extreme
      const v = num("fundingRate") ?? num("fundingPercent");
      return v == null ? 0.5 : clamp01(Math.abs(v) / 0.05);
    }
    case "stablecoin": {
      // 3% / 7d is fast — at 1.5% we want 0.5
      const v = num("change7dPercent");
      return v == null ? 0.5 : clamp01(Math.abs(v) / 3.0);
    }
    case "tvl": {
      // 10% / 7d = systemic stress → 1.0
      const v = num("change7dPercent");
      return v == null ? 0.5 : clamp01(Math.abs(v) / 10);
    }
    case "dex": {
      // 50% / 24h volume collapse = max
      const v = num("change24hPercent");
      return v == null ? 0.5 : clamp01(Math.abs(v) / 50);
    }
    case "options": {
      // 5pp IV skew shift = max; or 12% max-OI strike shift = max
      const iv = num("deltaIvPp");
      if (iv != null) return clamp01(Math.abs(iv) / 5);
      const oi = num("oiShiftPercent");
      if (oi != null) return clamp01(Math.abs(oi) / 12);
      return 0.5;
    }
    case "bybit": {
      // |z-score| > 3 = max
      const z = num("zScore") ?? num("z");
      return z == null ? 0.5 : clamp01(Math.abs(z) / 3);
    }
  }
}

function regimeAlignmentScore(
  expected: "up" | "down" | "neutral",
  regime: ApplyRubricContext["regime"],
): number {
  if (!regime || expected === "neutral") return 0.5;
  if (regime === "chop") return 0.5;
  // risk-off favors down moves; risk-on favors up
  if (expected === "down") return regime === "risk-off" ? 1.0 : 0.0;
  if (expected === "up")   return regime === "risk-on"  ? 1.0 : 0.0;
  return 0.5;
}

function crossSourceScore(
  primary: AnomalyCategory,
  coexisting: AnomalyFinding[] | undefined,
): number {
  if (!coexisting?.length) return 0;
  const confirmingSet = new Set(CONFIRMING[primary] ?? []);
  const distinctConfirming = new Set<AnomalyCategory>();
  for (const f of coexisting) {
    if (f.category !== primary && confirmingSet.has(f.category)) {
      distinctConfirming.add(f.category);
    }
  }
  return clamp01(distinctConfirming.size / MAX_CONFIRMING);
}

// ── applyRubric ─────────────────────────────────────────────────────────────

/**
 * Deterministic version of `buildGradeSignalRubric` — produces a confidence
 * score using the same formula and weights, but with concrete extractors for
 * each input dimension. Used by the replay harness to grade every historical
 * finding consistently and at scale (no LLM call).
 *
 * Output `confidence` is post severity-band clamp; `rawConfidence` is the raw
 * weighted sum (also clamped to [0,1] but ignoring the severity floor/ceiling)
 * so calibration analysis can study whether the band actually helps.
 */
export function applyRubric(
  finding: AnomalyFinding,
  ctx: ApplyRubricContext = {},
): ApplyRubricResult {
  const w = WEIGHTS[finding.category];
  const expectedDirection = EXPECTED_DIRECTION[finding.category];

  const inputs = {
    signalStrength: extractSignalStrength(finding),
    regimeAlignment: regimeAlignmentScore(expectedDirection, ctx.regime),
    crossSourceConfirmation: crossSourceScore(finding.category, ctx.coexistingFindings),
    historicalHitRate:
      ctx.priorHitRate?.[`${finding.category}:${finding.severity}`] ??
      ctx.priorHitRate?.[finding.category] ??
      0.5,
  };

  const rawConfidence = clamp01(
    w.signalStrength * inputs.signalStrength +
    w.regimeAlignment * inputs.regimeAlignment +
    w.crossSourceConfirmation * inputs.crossSourceConfirmation +
    w.historicalHitRate * inputs.historicalHitRate,
  );

  const band = SEVERITY_BAND[finding.severity];
  const confidence = Math.max(band.min, Math.min(band.max, rawConfidence));
  const severityBandApplied = confidence !== rawConfidence;

  return { confidence, rawConfidence, inputs, expectedDirection, severityBandApplied };
}

// ── scoreOutcome ────────────────────────────────────────────────────────────

/**
 * Score a finding's expected direction against future OHLCV. Hit if:
 *   - "down" and realizedPct < -threshold
 *   - "up"   and realizedPct >  threshold
 *   - "neutral" and |realizedPct| < threshold (range-bound = expectation met)
 *
 * Returns null-equivalent (just `null` from the caller) when klines are too
 * sparse to score.
 */
export function scoreOutcome(
  expectedDirection: "up" | "down" | "neutral",
  klines: OhlcvRow[],
  opts: { thresholdPercent?: number; maxCandles?: number } = {},
): ScoreOutcomeResult | null {
  const { thresholdPercent = 1.0, maxCandles } = opts;
  if (klines.length < 2) return null;

  const slice = maxCandles != null ? klines.slice(0, maxCandles + 1) : klines;
  if (slice.length < 2) return null;

  const first = slice[0].close;
  const last = slice[slice.length - 1].close;
  if (!first || !last) return null;

  const realizedPct = ((last - first) / first) * 100;

  let hit = false;
  if (expectedDirection === "down") hit = realizedPct < -thresholdPercent;
  else if (expectedDirection === "up") hit = realizedPct > thresholdPercent;
  else hit = Math.abs(realizedPct) < thresholdPercent;

  return {
    hit,
    realizedPct,
    expectedDirection,
    threshold: thresholdPercent,
    candlesUsed: slice.length - 1,
  };
}

// ── replayFindings ──────────────────────────────────────────────────────────

/**
 * Replay a list of historical findings: for each, compute a deterministic
 * rubric grade and score the outcome against post-event OHLCV.
 *
 * `ohlcvFor(symbol, fromTs)` is injected so the pure function stays pure;
 * callers use it to fetch klines from Binance / a cache / a fixture.
 *
 * Findings are grouped by `scanId` (or `scanTs` if absent) so cross-source
 * confirmation is computed against findings from the SAME scan only.
 */
export async function replayFindings(
  inputs: ReplayInput[],
  ohlcvFor: (symbol: string, fromTs: number) => Promise<OhlcvRow[]>,
  opts: {
    thresholdPercent?: number;
    maxCandles?: number;
    priorHitRate?: Record<string, number>;
  } = {},
): Promise<ReplayResult[]> {
  // Group by scan key so coexisting findings are visible to applyRubric.
  const groups = new Map<string, ReplayInput[]>();
  for (const inp of inputs) {
    const key = inp.scanId ?? String(inp.scanTs);
    const arr = groups.get(key) ?? [];
    arr.push(inp);
    groups.set(key, arr);
  }

  const results: ReplayResult[] = [];
  for (const [, group] of groups) {
    const allFindings = group.map((g) => g.finding);
    for (const inp of group) {
      const rubric = applyRubric(inp.finding, {
        coexistingFindings: allFindings.filter((f) => f !== inp.finding),
        priorHitRate: opts.priorHitRate,
      });
      let outcome: ScoreOutcomeResult | null = null;
      try {
        const klines = await ohlcvFor(inp.symbol ?? "BTCUSDT", inp.scanTs);
        outcome = scoreOutcome(rubric.expectedDirection, klines, opts);
      } catch {
        outcome = null;
      }
      results.push({ ...inp, rubric, outcome });
    }
  }
  return results;
}

// ── aggregateReport ─────────────────────────────────────────────────────────

const CONFIDENCE_BINS: Array<[number, number]> = [
  [0.0, 0.2],
  [0.2, 0.4],
  [0.4, 0.6],
  [0.6, 0.8],
  [0.8, 1.000001], // upper-bound inclusive of 1.0
];

function emptyBucket(): BucketStats {
  return { count: 0, hits: 0, hitRate: 0, meanConfidence: 0, meanRealizedPct: 0 };
}

function finalize(b: BucketStats, sumConf: number, sumRealized: number, scored: number): BucketStats {
  return {
    count: b.count,
    hits: b.hits,
    hitRate: b.count ? b.hits / b.count : 0,
    meanConfidence: b.count ? sumConf / b.count : 0,
    meanRealizedPct: scored ? sumRealized / scored : 0,
  };
}

/**
 * Bucket replay results by category, severity, and confidence bin. Hit rate
 * is computed per bucket; calibration bins ask "do high-confidence findings
 * actually hit more often?" — a well-calibrated rubric shows a monotone
 * confidence → hitRate curve.
 */
export function aggregateReport(results: ReplayResult[]): AggregateReport {
  const byCategory: Record<string, { b: BucketStats; sumConf: number; sumReal: number; scored: number }> = {};
  const bySeverity: Record<AnomalySeverity, { b: BucketStats; sumConf: number; sumReal: number; scored: number }> = {
    low:  { b: emptyBucket(), sumConf: 0, sumReal: 0, scored: 0 },
    med:  { b: emptyBucket(), sumConf: 0, sumReal: 0, scored: 0 },
    high: { b: emptyBucket(), sumConf: 0, sumReal: 0, scored: 0 },
  };
  const calBins = CONFIDENCE_BINS.map(([lo, hi]) => ({
    lo,
    hi,
    count: 0,
    hits: 0,
    sumConf: 0,
  }));

  let total = 0;
  let totalScored = 0;
  let overallSumConf = 0;
  let overallSumReal = 0;
  let overallHits = 0;

  for (const r of results) {
    total += 1;
    overallSumConf += r.rubric.confidence;

    const cat = r.finding.category;
    const sev = r.finding.severity;
    if (!byCategory[cat]) byCategory[cat] = { b: emptyBucket(), sumConf: 0, sumReal: 0, scored: 0 };
    const cBucket = byCategory[cat];
    const sBucket = bySeverity[sev];

    cBucket.b.count += 1;
    cBucket.sumConf += r.rubric.confidence;
    sBucket.b.count += 1;
    sBucket.sumConf += r.rubric.confidence;

    if (r.outcome) {
      totalScored += 1;
      overallSumReal += r.outcome.realizedPct;
      if (r.outcome.hit) {
        overallHits += 1;
        cBucket.b.hits += 1;
        sBucket.b.hits += 1;
      }
      cBucket.sumReal += r.outcome.realizedPct;
      sBucket.sumReal += r.outcome.realizedPct;
      cBucket.scored += 1;
      sBucket.scored += 1;

      const bin = calBins.find((b) => r.rubric.confidence >= b.lo && r.rubric.confidence < b.hi);
      if (bin) {
        bin.count += 1;
        bin.sumConf += r.rubric.confidence;
        if (r.outcome.hit) bin.hits += 1;
      }
    }
  }

  const byCategoryOut: Partial<Record<AnomalyCategory, BucketStats>> = {};
  for (const [k, v] of Object.entries(byCategory)) {
    byCategoryOut[k as AnomalyCategory] = finalize(v.b, v.sumConf, v.sumReal, v.scored);
  }

  const bySeverityOut: Record<AnomalySeverity, BucketStats> = {
    low:  finalize(bySeverity.low.b,  bySeverity.low.sumConf,  bySeverity.low.sumReal,  bySeverity.low.scored),
    med:  finalize(bySeverity.med.b,  bySeverity.med.sumConf,  bySeverity.med.sumReal,  bySeverity.med.scored),
    high: finalize(bySeverity.high.b, bySeverity.high.sumConf, bySeverity.high.sumReal, bySeverity.high.scored),
  };

  const calibration: CalibrationBucket[] = calBins.map((b) => ({
    bin: `${b.lo.toFixed(1)}-${b.hi >= 1 ? "1.0" : b.hi.toFixed(1)}`,
    binMin: b.lo,
    binMax: Math.min(1, b.hi),
    count: b.count,
    hitRate: b.count ? b.hits / b.count : 0,
    meanConfidence: b.count ? b.sumConf / b.count : 0,
  }));

  return {
    generatedAt: new Date().toISOString(),
    totalReplayed: total,
    totalScored,
    byCategory: byCategoryOut,
    bySeverity: bySeverityOut,
    calibration,
    overall: {
      count: total,
      hits: overallHits,
      hitRate: total ? overallHits / total : 0,
      meanConfidence: total ? overallSumConf / total : 0,
      meanRealizedPct: totalScored ? overallSumReal / totalScored : 0,
    },
  };
}

/**
 * Convenience: derive a `priorHitRate` map (keyed `${category}:${severity}`
 * AND fallback `${category}`) from a previous AggregateReport, suitable for
 * feeding back into `applyRubric` on a subsequent replay run.
 */
export function priorHitRateFromReport(report: AggregateReport): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cat, stats] of Object.entries(report.byCategory)) {
    if (stats) out[cat] = stats.hitRate;
  }
  // Per (category, severity) refinement would need raw results, not the
  // aggregated bySeverity (which collapses across categories). Caller can
  // pass a richer map if desired.
  return out;
}
