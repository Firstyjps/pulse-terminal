// In-memory cache populated by the snapshot poller + native WS streams.
// Served via the HTTP layer (`http-server.ts`) so MCP / local agents can hit
// localhost:8081 instead of round-tripping every external API.

import type {
  FundflowSnapshot,
  FundingRate,
  OpenInterest,
} from "@pulse/sources";

export interface UpstreamHealth {
  ok: boolean;
  ms: number;
  err?: string;
  ts: number;
}

export class HubCache {
  /** Latest snapshot (overview + stablecoins + etf + futures + dex + tvl). */
  snapshot: FundflowSnapshot | undefined;
  snapshotTs = 0;

  /** Per-(exchange:symbol) latest funding rate, keyed `${exchange}:${normalisedSymbol}`. */
  funding = new Map<string, FundingRate>();
  /** Per-(exchange:symbol) latest open interest. */
  oi = new Map<string, OpenInterest>();

  /** Per-source upstream health, set by the poller. */
  health: Record<string, UpstreamHealth> = {};

  /** ms-age of the snapshot (or `Infinity` if none yet). */
  snapshotAgeMs(): number {
    return this.snapshotTs ? Date.now() - this.snapshotTs : Infinity;
  }

  setSnapshot(snap: FundflowSnapshot) {
    this.snapshot = snap;
    this.snapshotTs = Date.parse(snap.generatedAt);
  }

  setFunding(rate: FundingRate) {
    const key = `${rate.exchange}:${normaliseSymbol(rate.symbol)}`;
    this.funding.set(key, rate);
  }

  setOi(o: OpenInterest) {
    const key = `${o.exchange}:${normaliseSymbol(o.symbol)}`;
    this.oi.set(key, o);
  }

  /** Funding rates filtered by `exchange?` and/or `symbol?`. */
  fundingList(opts: { exchange?: string; symbol?: string } = {}): FundingRate[] {
    const symbolN = opts.symbol ? normaliseSymbol(opts.symbol) : undefined;
    return [...this.funding.values()].filter(
      (f) =>
        (!opts.exchange || f.exchange === opts.exchange) &&
        (!symbolN || normaliseSymbol(f.symbol) === symbolN),
    );
  }

  oiList(opts: { exchange?: string; symbol?: string } = {}): OpenInterest[] {
    const symbolN = opts.symbol ? normaliseSymbol(opts.symbol) : undefined;
    return [...this.oi.values()].filter(
      (o) =>
        (!opts.exchange || o.exchange === opts.exchange) &&
        (!symbolN || normaliseSymbol(o.symbol) === symbolN),
    );
  }
}

/**
 * Collapse venue-specific symbol formats to a single key for cross-venue
 * comparison. We treat all "BTC perpetual swap" instruments as the same key
 * regardless of contract type (linear vs inverse) or quote currency, since the
 * funding-rate / OI signals are about the same underlying asset:
 *   - OKX        BTC-USDT-SWAP   → BTCUSDT
 *   - Deribit    BTC-PERPETUAL   → BTCUSDT  (inverse, USD-quoted)
 *   - Binance    BTCUSDT         → BTCUSDT
 *   - Bybit      BTCUSDT         → BTCUSDT
 */
export function normaliseSymbol(s: string): string {
  return s
    .toUpperCase()
    .replace(/-USDT-SWAP$/, "USDT")
    .replace(/-PERPETUAL$/, "USDT")
    .replace(/-/g, "");
}

export const cache = new HubCache();
