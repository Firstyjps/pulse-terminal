// Snapshot collector — pulls live overview + top10 markets, stores to SQLite.
//
// Lives in @pulse/sources/server because it uses better-sqlite3 (server-only).
// Called from apps/alerts cron at 00:05 UTC daily.

import { getOverview } from "./overview.js";
import { fetchJson } from "./_helpers.js";
import { saveDailySnapshot, type MarketSnapshot, type MarketSnapshotTop10 } from "./snapshot-history.js";

interface CGMarketRow {
  id: string;
  symbol: string;
  current_price: number;
  market_cap: number;
  price_change_percentage_24h_in_currency?: number;
}

async function fetchTop10(): Promise<MarketSnapshotTop10[]> {
  const data = await fetchJson<CGMarketRow[]>(
    "https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1&price_change_percentage=24h",
    { revalidate: 60, retries: 1 },
  );
  return data.map((c) => ({
    id: c.id,
    symbol: c.symbol.toUpperCase(),
    price: c.current_price ?? 0,
    mcap: c.market_cap ?? 0,
    change24h: c.price_change_percentage_24h_in_currency ?? 0,
  }));
}

/** Build today's snapshot. Throws on overview fetch failure. */
export async function collectDailySnapshot(): Promise<MarketSnapshot> {
  const [overview, top10] = await Promise.all([getOverview(), fetchTop10()]);
  const date = new Date().toISOString().slice(0, 10);

  return {
    date,
    ts: Date.now(),
    totalMcap: overview.totalMarketCap,
    totalVolume: overview.totalVolume24h,
    btcDominance: overview.btcDominance,
    ethDominance: overview.ethDominance,
    fgValue: overview.fearGreedIndex?.value ?? null,
    fgLabel: overview.fearGreedIndex?.classification ?? null,
    top10,
  };
}

/** Collect + persist. No-op if today's row already exists with non-zero mcap. */
export async function collectAndSaveDailySnapshot(opts: {
  /** Force overwrite even if today's row exists. Default false. */
  force?: boolean;
} = {}): Promise<MarketSnapshot | { skipped: true; reason: string }> {
  const snap = await collectDailySnapshot();
  if (snap.totalMcap <= 0 && !opts.force) {
    return { skipped: true, reason: "overview returned zero mcap (probably CoinGecko rate-limited)" };
  }
  saveDailySnapshot(snap);
  return snap;
}
