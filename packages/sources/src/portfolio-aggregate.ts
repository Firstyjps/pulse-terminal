// Unified portfolio aggregator with priority dispatch:
//   1. CoinStats Premium API (if COINSTATS_API_KEY set + populated) → canonical
//   2. Multi-CEX (Binance/Bybit/OKX) + DeFi (Meteora/Pendle/Orca/Aave) → fallback
//
// CoinStats is preferred because the user's full portfolio (~$32K+ across
// 10+ assets and many wallets) lives there. The CEX/DeFi adapters only see
// each individual exchange/wallet API key and miss anything not connected.
import { getCoinStatsPortfolio } from "./coinstats.js";
import type { CoinStatsPortfolio } from "./coinstats.js";
import { getMultiPortfolio } from "./portfolio-multi.js";
import { getMeteoraPositions } from "./meteora-positions.js";
import { getPendlePositions } from "./pendle-positions.js";
import { getOrcaPositions } from "./orca-positions.js";
import { getAavePositions } from "./aave-positions.js";
import type { Position, PositionResult } from "./position-types.js";
import type { PortfolioSnapshot } from "./portfolio.js";

export interface VenueBalance {
  asset: string;
  type: Position["type"];
  units: number;
  usdValue: number;
}

export interface VenueSummary {
  name: string;
  totalUsd: number;
  balances: VenueBalance[];
}

export interface AssetSummary {
  ticker: string;
  totalUnits: number;
  totalUsd: number;
  /** Distinct venues that hold this asset, sorted alphabetically. */
  venues: string[];
}

export type PortfolioSourceTag = "coinstats" | "multi-cex" | "none";

export interface AggregateSnapshot {
  totalUsd: number;
  byVenue: VenueSummary[];
  byAsset: AssetSummary[];
  /** LP positions kept separate — pair tickers don't slot into single-asset buckets. */
  lp: Position[];
  asOf: number;
  /** Which upstream produced the data. */
  _source: PortfolioSourceTag;
  /** Per-source failures collected from CEX status + DeFi error arrays. */
  errors?: string[];
}

const CEX_SOURCES = ["binance", "bybit", "okx"] as const;

function cexBalancesToPositions(snap: PortfolioSnapshot): Position[] {
  return snap.balances.map((b) => ({
    venue: snap.source,
    type: "spot",
    asset: b.asset,
    units: b.total,
    usdValue: b.usdValue ?? 0,
  }));
}

/**
 * Map a CoinStats portfolio into the AggregateSnapshot shape. CoinStats
 * already aggregates across every connected wallet/exchange, so we expose it
 * as a single virtual venue named "coinstats" and let the per-asset bucket
 * fan out from there.
 */
function coinStatsToAggregate(p: CoinStatsPortfolio): AggregateSnapshot {
  const balances: VenueBalance[] = p.assets.map((a) => ({
    asset: a.symbol,
    type: "spot",
    units: a.amount,
    usdValue: a.usdValue,
  }));
  const byVenue: VenueSummary[] = balances.length
    ? [{ name: "coinstats", totalUsd: p.totalUsd, balances }]
    : [];
  const byAsset: AssetSummary[] = p.assets
    .map((a) => ({
      ticker: a.symbol,
      totalUnits: a.amount,
      totalUsd: a.usdValue,
      venues: ["coinstats"],
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);
  return {
    totalUsd: p.totalUsd,
    byVenue,
    byAsset,
    lp: [],
    asOf: Date.parse(p.asOf) || Date.now(),
    _source: "coinstats",
  };
}

/**
 * Aggregate the user's portfolio with priority dispatch.
 *
 *   1. CoinStats Premium API → canonical (set COINSTATS_API_KEY)
 *   2. Multi-CEX + DeFi adapters → fallback for when no CoinStats key exists
 *      OR the CoinStats key has zero connected wallets (populated:false).
 *
 * Failure isolation: each underlying source is fetched via Promise.allSettled,
 * so a failing adapter contributes zero positions and a single line in
 * `errors[]` rather than throwing the whole aggregation.
 */
export async function getAggregatePortfolio(): Promise<AggregateSnapshot> {
  // ── CoinStats first ──────────────────────────────────────────────────────
  try {
    const cs = await getCoinStatsPortfolio();
    if (cs && cs.populated) return coinStatsToAggregate(cs);
    // key set but empty → still fall through to CEX/DeFi so the user sees
    // at least their connected exchanges while they wire up CoinStats.
  } catch (err) {
    // surface as an error line but keep going to the fallback chain
    const msg = err instanceof Error ? err.message : String(err);
    return {
      ...(await fallbackAggregate()),
      errors: [`coinstats: ${msg}`],
    } as AggregateSnapshot;
  }

  return fallbackAggregate();
}

async function fallbackAggregate(): Promise<AggregateSnapshot> {
  const settled = await Promise.allSettled([
    getMultiPortfolio(),
    getMeteoraPositions(),
    getPendlePositions(),
    getOrcaPositions(),
    getAavePositions(),
  ]);

  const [cex, meteora, pendle, orca, aave] = settled;
  const errors: string[] = [];
  const allPositions: Position[] = [];

  // ── CEX ──────────────────────────────────────────────────────────────────
  if (cex.status === "fulfilled") {
    for (const snap of cex.value.sources) {
      allPositions.push(...cexBalancesToPositions(snap));
    }
    for (const s of cex.value.status) {
      if (s.error) errors.push(`${s.source}: ${s.error}`);
    }
  } else {
    errors.push(`cex: ${cex.reason instanceof Error ? cex.reason.message : String(cex.reason)}`);
  }

  // ── DeFi ─────────────────────────────────────────────────────────────────
  const defiSettled: Array<[string, PromiseSettledResult<PositionResult>]> = [
    ["meteora", meteora],
    ["pendle", pendle],
    ["orca", orca],
    ["aave", aave],
  ];
  for (const [name, r] of defiSettled) {
    if (r.status === "fulfilled") {
      allPositions.push(...r.value.positions);
      if (r.value.errors) errors.push(...r.value.errors);
    } else {
      errors.push(`${name}: ${r.reason instanceof Error ? r.reason.message : String(r.reason)}`);
    }
  }

  // ── Group ────────────────────────────────────────────────────────────────
  const venueMap = new Map<string, VenueSummary>();
  const assetMap = new Map<string, AssetSummary & { _venues: Set<string> }>();
  const lp: Position[] = [];
  let totalUsd = 0;

  for (const p of allPositions) {
    totalUsd += p.usdValue;

    let venue = venueMap.get(p.venue);
    if (!venue) {
      venue = { name: p.venue, totalUsd: 0, balances: [] };
      venueMap.set(p.venue, venue);
    }
    venue.totalUsd += p.usdValue;
    venue.balances.push({ asset: p.asset, type: p.type, units: p.units, usdValue: p.usdValue });

    if (p.type === "lp") {
      lp.push(p);
      continue; // don't pollute byAsset with pair tickers
    }

    let asset = assetMap.get(p.asset);
    if (!asset) {
      asset = { ticker: p.asset, totalUnits: 0, totalUsd: 0, venues: [], _venues: new Set() };
      assetMap.set(p.asset, asset);
    }
    asset.totalUnits += p.units;
    asset.totalUsd += p.usdValue;
    asset._venues.add(p.venue);
  }

  const byVenue = [...venueMap.values()].sort((a, b) => b.totalUsd - a.totalUsd);
  const byAsset = [...assetMap.values()]
    .map(({ ticker, totalUnits, totalUsd: usd, _venues }) => ({
      ticker,
      totalUnits,
      totalUsd: usd,
      venues: [..._venues].sort(),
    }))
    .sort((a, b) => b.totalUsd - a.totalUsd);

  const _source: PortfolioSourceTag = totalUsd === 0 && byVenue.length === 0 ? "none" : "multi-cex";

  return {
    totalUsd,
    byVenue,
    byAsset,
    lp,
    asOf: Date.now(),
    _source,
    ...(errors.length ? { errors } : {}),
  };
}

export const _internal = { CEX_SOURCES, cexBalancesToPositions, coinStatsToAggregate, fallbackAggregate };
