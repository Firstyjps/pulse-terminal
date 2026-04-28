// Cross-source anomaly detection — single source of truth shared by:
//   - apps/mcp (detect_anomalies tool)
//   - apps/alerts (background worker)
//   - apps/web (/api/alerts/scan)
// Keeps thresholds + categorisation in one place so backtests stay coherent.

import type { FundflowSnapshot } from "./types.js";
import type { OptionData } from "./options/types.js";
import { getFullSnapshot } from "./snapshot.js";
import { getFundingRates } from "./funding.js";

export type AnomalySeverity = "low" | "med" | "high";
export type AnomalyCategory =
  | "etf"
  | "stablecoin"
  | "funding"
  | "futures"
  | "tvl"
  | "dex"
  | "options"
  | "bybit";

/**
 * Optional extra inputs to `deriveAnomalies`. Each block is independent —
 * pass only what you have. Existing callers that omit `ctx` see no behavior
 * change.
 */
export interface AnomalyContext {
  options?: {
    /** Full option chain for the asset of interest. */
    snapshot: OptionData[];
    underlyingPrice: number;
    /**
     * Strike with the highest combined OI from a *prior* reading. Used to
     * detect cluster shift. Pass undefined to skip that detector.
     */
    priorMaxOiStrike?: number;
  };
  aprHistory?: {
    /**
     * Recent APR percent values (rolling window, most-recent last).
     * Need ≥ 7 samples for the regime-change detector to fire.
     */
    recent: number[];
    /** Current APR percent — compared against the recent distribution. */
    current: number;
  };
}

export interface AnomalyFinding {
  category: AnomalyCategory;
  severity: AnomalySeverity;
  signal: string;
  evidence: Record<string, unknown>;
}

export interface AnomalyScan {
  generatedAt: string;
  symbol: string;
  findings: AnomalyFinding[];
  marker: { btcPrice?: number; ethPrice?: number };
}

const SEV_RANK: Record<AnomalySeverity, number> = { high: 0, med: 1, low: 2 };

/**
 * Pure function: derive findings from a snapshot + funding sample.
 * No I/O — call the loader form below if you need to fetch first.
 */
export function deriveAnomalies(
  snap: FundflowSnapshot,
  fundingRates: { exchange: string; symbol: string; ratePercent: number }[],
  symbol: string,
  ctx?: AnomalyContext,
): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];

  // ETF
  if (snap.etf?.summary) {
    const e = snap.etf.summary;
    if (e.btc7dSum < -2e8) {
      findings.push({
        category: "etf",
        severity: "high",
        signal: "BTC ETF heavy 7d outflow",
        evidence: { btc7dSumUSD: e.btc7dSum, btcLast: e.btcLast },
      });
    } else if (e.btc7dSum < 0) {
      findings.push({
        category: "etf",
        severity: "low",
        signal: "BTC ETF mild 7d outflow",
        evidence: { btc7dSumUSD: e.btc7dSum },
      });
    }
    if (e.eth7dSum < -1e8) {
      findings.push({
        category: "etf",
        severity: "med",
        signal: "ETH ETF 7d outflow",
        evidence: { eth7dSumUSD: e.eth7dSum },
      });
    }
  }

  // Stablecoin supply
  if (snap.stablecoins?.summary) {
    const s = snap.stablecoins.summary;
    if (s.change7dPercent > 1.5) {
      findings.push({
        category: "stablecoin",
        severity: "med",
        signal: "Stablecoin supply expanding fast (dry powder building)",
        evidence: { change7dPercent: s.change7dPercent },
      });
    } else if (s.change7dPercent < -1.0) {
      findings.push({
        category: "stablecoin",
        severity: "high",
        signal: "Stablecoin supply contracting (capital leaving crypto)",
        evidence: { change7dPercent: s.change7dPercent },
      });
    }
  }

  // Funding
  if (fundingRates.length) {
    const matched = fundingRates.filter(
      (r) => r.symbol.toUpperCase().replace(/-USDT-SWAP$/, "USDT") === symbol.toUpperCase(),
    );
    const sample = matched.length ? matched : fundingRates;
    const avg = sample.reduce((s, r) => s + r.ratePercent, 0) / sample.length;
    if (avg > 0.05) {
      findings.push({
        category: "funding",
        severity: "med",
        signal: `${symbol} funding overheated long across venues`,
        evidence: { avgPercent: avg, venues: sample.length },
      });
    } else if (avg < -0.02) {
      findings.push({
        category: "funding",
        severity: "med",
        signal: `${symbol} funding overheated short across venues`,
        evidence: { avgPercent: avg, venues: sample.length },
      });
    }
    const min = Math.min(...sample.map((r) => r.ratePercent));
    const max = Math.max(...sample.map((r) => r.ratePercent));
    if (max - min > 0.04) {
      findings.push({
        category: "funding",
        severity: "low",
        signal: `${symbol} funding spread between venues unusually wide`,
        evidence: { spreadPercent: max - min, min, max },
      });
    }
  }

  // Cross: ETF outflow + hot funding
  if (
    snap.etf?.summary?.btc7dSum != null &&
    snap.etf.summary.btc7dSum < 0 &&
    snap.futures?.btc?.fundingRate != null &&
    snap.futures.btc.fundingRate > 0.04
  ) {
    findings.push({
      category: "futures",
      severity: "high",
      signal: "BTC ETF outflow paired with hot funding — leveraged longs vulnerable",
      evidence: {
        etfBtc7dSum: snap.etf.summary.btc7dSum,
        fundingRate: snap.futures.btc.fundingRate,
      },
    });
  }

  // TVL stress
  if (snap.tvl?.summary && snap.tvl.summary.change7d < -5) {
    findings.push({
      category: "tvl",
      severity: "med",
      signal: "DeFi TVL contracting (>5% 7d drop)",
      evidence: { change7dPercent: snap.tvl.summary.change7d },
    });
  }

  // DEX stress
  if (snap.dex?.summary && snap.dex.summary.change24h < -25) {
    findings.push({
      category: "dex",
      severity: "low",
      signal: "DEX 24h volume collapse",
      evidence: { change24hPercent: snap.dex.summary.change24h },
    });
  }

  // Options — skew flip + OI cluster shift (only when caller supplies a chain)
  if (ctx?.options?.snapshot.length) {
    const skew = detectSkewFlip(ctx.options.snapshot, ctx.options.underlyingPrice);
    if (skew) findings.push(skew);
    if (ctx.options.priorMaxOiStrike != null) {
      const shift = detectMaxOiShift(ctx.options.snapshot, ctx.options.priorMaxOiStrike);
      if (shift) findings.push(shift);
    }
  }

  // Bybit APR regime change
  if (ctx?.aprHistory && ctx.aprHistory.recent.length >= 7) {
    const apr = detectAprRegimeChange(ctx.aprHistory.recent, ctx.aprHistory.current);
    if (apr) findings.push(apr);
  }

  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  return findings;
}

// ────────────────────────────────────────────────────────────────────────
// Pure detectors — exported for unit testing and one-off use.
// ────────────────────────────────────────────────────────────────────────

/**
 * Detect call-vs-put IV inversion at the money. Normal regime: put IV ≥ call IV
 * (downside crash insurance pricier than upside). When call IV exceeds put IV
 * by more than 2pp at the ATM strikes, market is paying up for upside —
 * historically pre-rally signal in BTC/ETH options.
 */
export function detectSkewFlip(
  options: OptionData[],
  underlyingPrice: number,
): AnomalyFinding | null {
  if (!options.length || !Number.isFinite(underlyingPrice)) return null;

  // Find the 3 strikes nearest the underlying price
  const sortedByDistance = [...options].sort(
    (a, b) => Math.abs(a.strike - underlyingPrice) - Math.abs(b.strike - underlyingPrice),
  );
  const atmStrikes = new Set<number>();
  for (const o of sortedByDistance) {
    atmStrikes.add(o.strike);
    if (atmStrikes.size >= 3) break;
  }

  const atm = options.filter((o) => atmStrikes.has(o.strike));
  const calls = atm.filter((o) => o.side === "call");
  const puts = atm.filter((o) => o.side === "put");
  if (!calls.length || !puts.length) return null;

  const avg = (arr: OptionData[]) => arr.reduce((s, o) => s + o.iv, 0) / arr.length;
  const callIv = avg(calls);
  const putIv = avg(puts);
  const delta = callIv - putIv;

  if (delta > 2) {
    return {
      category: "options",
      severity: delta > 5 ? "high" : "med",
      signal: "Options skew flipped — call IV exceeds put IV at ATM",
      evidence: { callIvAtm: callIv, putIvAtm: putIv, deltaPp: delta, atmStrikes: [...atmStrikes] },
    };
  }
  return null;
}

/**
 * Detect a meaningful shift in the strike that holds the most combined
 * (call + put) OI. A move > 5% from the prior reading indicates positioning
 * has rolled to a new "max-pain" / pin level.
 */
export function detectMaxOiShift(
  options: OptionData[],
  priorMaxOiStrike: number,
): AnomalyFinding | null {
  if (!options.length || !Number.isFinite(priorMaxOiStrike) || priorMaxOiStrike === 0) return null;

  const oiByStrike = new Map<number, number>();
  for (const o of options) {
    oiByStrike.set(o.strike, (oiByStrike.get(o.strike) ?? 0) + o.oi);
  }
  let currentMax = 0;
  let currentStrike = priorMaxOiStrike;
  for (const [strike, oi] of oiByStrike) {
    if (oi > currentMax) {
      currentMax = oi;
      currentStrike = strike;
    }
  }
  const shiftPct = Math.abs((currentStrike - priorMaxOiStrike) / priorMaxOiStrike) * 100;
  if (shiftPct > 5) {
    return {
      category: "options",
      severity: shiftPct > 12 ? "high" : "med",
      signal: "Options OI cluster shifted to a new strike",
      evidence: {
        priorStrike: priorMaxOiStrike,
        currentStrike,
        shiftPercent: shiftPct,
        currentOi: currentMax,
      },
    };
  }
  return null;
}

/**
 * Detect when the current APR is more than 2σ from the recent rolling mean.
 * Useful for Bybit dual-asset: if APR jumps far above its trailing distribution,
 * IV is likely repricing → user should consider entry timing.
 *
 * Returns null when fewer than 7 samples are provided (insufficient stats).
 */
export function detectAprRegimeChange(
  recent: number[],
  current: number,
): AnomalyFinding | null {
  if (recent.length < 7 || !Number.isFinite(current)) return null;

  const mean = recent.reduce((s, v) => s + v, 0) / recent.length;
  const variance = recent.reduce((s, v) => s + (v - mean) ** 2, 0) / recent.length;
  const stdev = Math.sqrt(variance);
  if (stdev === 0) return null;

  const z = (current - mean) / stdev;
  if (Math.abs(z) > 2) {
    return {
      category: "bybit",
      severity: Math.abs(z) > 3 ? "high" : "med",
      signal: z > 0
        ? "Bybit APR regime jumped — current APR > 2σ above recent mean"
        : "Bybit APR regime collapsed — current APR > 2σ below recent mean",
      evidence: {
        currentAprPct: current,
        recentMeanAprPct: mean,
        stdevPp: stdev,
        zScore: z,
        sampleCount: recent.length,
      },
    };
  }
  return null;
}

/**
 * Convenience loader: fetch snapshot + funding rates and derive findings in one go.
 * Used by web `/api/alerts/scan`, MCP `detect_anomalies`, and the alerts worker.
 */
export async function scanAnomalies(symbol = "BTCUSDT"): Promise<AnomalyScan> {
  const [snap, fundingRates] = await Promise.all([
    getFullSnapshot(),
    getFundingRates({ symbol }).catch(() => [] as Array<{ exchange: string; symbol: string; ratePercent: number }>),
  ]);
  const findings = deriveAnomalies(snap, fundingRates, symbol);
  return {
    generatedAt: snap.generatedAt,
    symbol,
    findings,
    marker: {
      btcPrice: snap.futures?.btc?.price,
      ethPrice: snap.futures?.eth?.price,
    },
  };
}
