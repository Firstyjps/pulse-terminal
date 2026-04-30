// Multi-source portfolio aggregator — Binance + Bybit + OKX (read-only).
// Each source is opt-in via env keys; missing keys return null and are skipped.
import { getPortfolio } from "./portfolio.js";
import { getBybitPortfolio } from "./portfolio-bybit.js";
import { getOkxPortfolio } from "./portfolio-okx.js";
import type { PortfolioSnapshot, PortfolioSource } from "./portfolio.js";

export interface MultiPortfolioSnapshot {
  /** Per-source snapshots in fetch order; configured sources only. */
  sources: PortfolioSnapshot[];
  /** Sum of `totalUsd` across configured sources. */
  totalUsd: number;
  /** Source list with per-source error if fetch threw. */
  status: Array<{ source: PortfolioSource; configured: boolean; error?: string }>;
  ts: number;
}

const FETCHERS: Array<{ source: PortfolioSource; fetch: () => Promise<PortfolioSnapshot | null> }> = [
  { source: "binance", fetch: getPortfolio },
  { source: "bybit",   fetch: getBybitPortfolio },
  { source: "okx",     fetch: getOkxPortfolio },
];

/**
 * Fetch portfolio across every configured CEX in parallel. Failures on one
 * source do not affect the others — they surface as `status[].error`.
 */
export async function getMultiPortfolio(): Promise<MultiPortfolioSnapshot> {
  const settled = await Promise.allSettled(FETCHERS.map((f) => f.fetch()));

  const sources: PortfolioSnapshot[] = [];
  const status: MultiPortfolioSnapshot["status"] = [];
  let totalUsd = 0;

  settled.forEach((r, i) => {
    const source = FETCHERS[i].source;
    if (r.status === "fulfilled") {
      if (r.value) {
        sources.push(r.value);
        totalUsd += r.value.totalUsd;
        status.push({ source, configured: true });
      } else {
        status.push({ source, configured: false });
      }
    } else {
      status.push({
        source,
        configured: true,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  return { sources, totalUsd, status, ts: Date.now() };
}
