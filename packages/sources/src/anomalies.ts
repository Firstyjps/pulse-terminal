// Cross-source anomaly detection — single source of truth shared by:
//   - apps/mcp (detect_anomalies tool)
//   - apps/alerts (background worker)
//   - apps/web (/api/alerts/scan)
// Keeps thresholds + categorisation in one place so backtests stay coherent.

import type { FundflowSnapshot } from "./types";
import { getFullSnapshot } from "./snapshot";
import { getFundingRates } from "./funding";

export type AnomalySeverity = "low" | "med" | "high";
export type AnomalyCategory =
  | "etf"
  | "stablecoin"
  | "funding"
  | "futures"
  | "tvl"
  | "dex";

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

  findings.sort((a, b) => SEV_RANK[a.severity] - SEV_RANK[b.severity]);
  return findings;
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
