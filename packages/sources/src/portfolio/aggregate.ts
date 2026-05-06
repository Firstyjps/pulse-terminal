// Unified portfolio aggregator with priority dispatch:
//   1. CoinStats Premium API (if COINSTATS_API_KEY set + populated) → canonical
//   2. Multi-CEX (Binance/Bybit/OKX) + DeFi (Meteora/Pendle/Orca/Aave) → fallback
//
// CoinStats is preferred because the user's full portfolio (~$32K+ across
// 10+ assets and many wallets) lives there. The CEX/DeFi adapters only see
// each individual exchange/wallet API key and miss anything not connected.
import { getCoinStatsPortfolio } from "../coinstats.js";
import type { CoinStatsPortfolio } from "../coinstats.js";
import { getMultiPortfolio } from "./multi.js";
import { getMeteoraPositions } from "../positions/meteora.js";
import { getPendlePositions } from "../positions/pendle.js";
import { getOrcaPositions } from "../positions/orca.js";
import { getAavePositions } from "../positions/aave.js";
import type { Position, PositionResult } from "../positions/types.js";
import type { PortfolioSnapshot } from "./binance.js";

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

export interface PortfolioRiskExposure {
  topAssetPct: number;
  topVenuePct: number;
  stablecoinPct: number;
  lpPct: number;
  borrowUsd: number;
  concentration: "low" | "medium" | "high";
  notes: string[];
}

export interface AggregateSnapshot {
  totalUsd: number;
  byVenue: VenueSummary[];
  byAsset: AssetSummary[];
  /** LP positions kept separate — pair tickers don't slot into single-asset buckets. */
  lp: Position[];
  asOf: number;
  /** Which upstream produced the data. */
  _source: PortfolioSourceTag;
  /** Concentration and exposure summary for repeated risk review. */
  risk: PortfolioRiskExposure;
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
    risk: computeRisk(p.totalUsd, byVenue, byAsset, []),
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
    risk: computeRisk(totalUsd, byVenue, byAsset, lp),
    ...(errors.length ? { errors } : {}),
  };
}

const STABLECOINS = new Set(["USDT", "USDC", "DAI", "FDUSD", "TUSD", "USDE", "SUSDE", "USDS", "BUSD"]);

function computeRisk(
  totalUsd: number,
  byVenue: VenueSummary[],
  byAsset: AssetSummary[],
  lp: Position[],
): PortfolioRiskExposure {
  if (totalUsd <= 0) {
    return {
      topAssetPct: 0,
      topVenuePct: 0,
      stablecoinPct: 0,
      lpPct: 0,
      borrowUsd: 0,
      concentration: "low",
      notes: ["portfolio empty or not configured"],
    };
  }

  const stablecoinUsd = byAsset
    .filter((a) => STABLECOINS.has(a.ticker.toUpperCase()))
    .reduce((s, a) => s + Math.max(0, a.totalUsd), 0);
  const lpUsd = lp.reduce((s, p) => s + Math.max(0, p.usdValue), 0);
  const borrowUsd = byVenue
    .flatMap((v) => v.balances)
    .filter((b) => b.type === "borrow" || b.usdValue < 0)
    .reduce((s, b) => s + Math.abs(b.usdValue), 0);

  const topAssetPct = ((byAsset[0]?.totalUsd ?? 0) / totalUsd) * 100;
  const topVenuePct = ((byVenue[0]?.totalUsd ?? 0) / totalUsd) * 100;
  const stablecoinPct = (stablecoinUsd / totalUsd) * 100;
  const lpPct = (lpUsd / totalUsd) * 100;

  const notes: string[] = [];
  if (topAssetPct >= 60) notes.push("single-asset concentration > 60%");
  if (topVenuePct >= 70) notes.push("single-venue concentration > 70%");
  if (stablecoinPct < 10) notes.push("low stablecoin buffer < 10%");
  if (borrowUsd > totalUsd * 0.1) notes.push("borrow exposure > 10% of NAV");
  if (lpPct > 35) notes.push("LP exposure > 35% of NAV");

  const concentration =
    topAssetPct >= 65 || topVenuePct >= 75 || borrowUsd > totalUsd * 0.2
      ? "high"
      : topAssetPct >= 45 || topVenuePct >= 55 || lpPct > 25
        ? "medium"
        : "low";

  return {
    topAssetPct: roundPct(topAssetPct),
    topVenuePct: roundPct(topVenuePct),
    stablecoinPct: roundPct(stablecoinPct),
    lpPct: roundPct(lpPct),
    borrowUsd: +borrowUsd.toFixed(2),
    concentration,
    notes: notes.length ? notes : ["no major concentration flags"],
  };
}

function roundPct(n: number): number {
  return +n.toFixed(2);
}

export const _internal = { CEX_SOURCES, cexBalancesToPositions, coinStatsToAggregate, fallbackAggregate, computeRisk };
