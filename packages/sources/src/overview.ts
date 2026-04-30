import type { MarketOverview } from "./types.js";
import { fetchJson } from "./_helpers.js";

type CGGlobal = {
  data: {
    total_market_cap: { usd: number };
    total_volume: { usd: number };
    market_cap_percentage: { btc: number; eth: number };
    market_cap_change_percentage_24h_usd: number;
    active_cryptocurrencies: number;
    defi_market_cap?: number;
  };
};
type FngResp = { data: { value: string; value_classification: string; timestamp: string }[] };
type DefiTvl = { totalLiquidityUSD?: number; tvl?: number }[];

// ── Volume history rolling buffer ────────────────────────────────────────────
// CoinGecko's /global endpoint doesn't expose 24h volume change, so we keep a
// process-local rolling buffer of recent samples and derive the delta against
// the sample closest to (now − 24h). On long-running pm2 prod this populates
// after a day; on dev cold-start it's undefined until enough history accrues.
type VolSample = { ts: number; volume: number };
const _volHistory: VolSample[] = [];
const VOL_RETENTION_MS = 26 * 60 * 60 * 1000; // keep 26h
const VOL_24H_WINDOW = 24 * 60 * 60 * 1000;
const VOL_TOLERANCE_MS = 60 * 60 * 1000;       // accept samples within ±1h of 24h target

function pushVolSample(volume: number): void {
  if (!Number.isFinite(volume) || volume <= 0) return;
  const now = Date.now();
  // Skip near-duplicate timestamps (within 30s)
  if (_volHistory.length > 0 && now - _volHistory[_volHistory.length - 1].ts < 30_000) {
    _volHistory[_volHistory.length - 1] = { ts: now, volume };
  } else {
    _volHistory.push({ ts: now, volume });
  }
  const cutoff = now - VOL_RETENTION_MS;
  while (_volHistory.length > 0 && _volHistory[0].ts < cutoff) {
    _volHistory.shift();
  }
}

function deriveVolumeChange24h(currentVolume: number): number | undefined {
  if (_volHistory.length < 2) return undefined;
  const now = Date.now();
  const target = now - VOL_24H_WINDOW;
  let best: VolSample | null = null;
  let bestDist = VOL_TOLERANCE_MS;
  for (const s of _volHistory) {
    const dist = Math.abs(s.ts - target);
    if (dist <= bestDist) {
      bestDist = dist;
      best = s;
    }
  }
  if (!best || best.volume <= 0) return undefined;
  return ((currentVolume - best.volume) / best.volume) * 100;
}

export async function getOverview(): Promise<MarketOverview> {
  const [global, fng, tvlSeries] = await Promise.allSettled([
    fetchJson<CGGlobal>("https://api.coingecko.com/api/v3/global", { revalidate: 120 }),
    fetchJson<FngResp>("https://api.alternative.me/fng/?limit=7", { revalidate: 600 }),
    fetchJson<DefiTvl>("https://api.llama.fi/v2/historicalChainTvl", { revalidate: 600 }),
  ]);

  const overview: MarketOverview = {
    totalMarketCap: 0,
    totalVolume24h: 0,
    btcDominance: 0,
    ethDominance: 0,
    altDominance: 0,
    marketCapChange24h: 0,
    volumeTurnoverPct: 0,
    activeCryptocurrencies: 0,
    defiMarketCap: 0,
    defiTvl: 0,
  };

  if (global.status === "fulfilled") {
    const d = global.value.data;
    overview.totalMarketCap = d.total_market_cap.usd;
    overview.totalVolume24h = d.total_volume.usd;
    overview.btcDominance = d.market_cap_percentage.btc;
    overview.ethDominance = d.market_cap_percentage.eth;
    overview.altDominance = Math.max(
      0,
      100 - d.market_cap_percentage.btc - d.market_cap_percentage.eth,
    );
    overview.marketCapChange24h = d.market_cap_change_percentage_24h_usd;
    overview.activeCryptocurrencies = d.active_cryptocurrencies;
    overview.defiMarketCap = d.defi_market_cap ?? 0;

    // record volume sample + derive delta
    pushVolSample(overview.totalVolume24h);
    const volChange = deriveVolumeChange24h(overview.totalVolume24h);
    if (volChange !== undefined) overview.volumeChange24h = volChange;

    overview.volumeTurnoverPct =
      overview.totalMarketCap > 0
        ? (overview.totalVolume24h / overview.totalMarketCap) * 100
        : 0;
  }

  if (fng.status === "fulfilled" && fng.value.data?.[0]) {
    // alternative.me returns newest-first; we want oldest → newest for charting.
    const series = [...fng.value.data].reverse();
    overview.fearGreedIndex = {
      value: parseInt(fng.value.data[0].value, 10),
      classification: fng.value.data[0].value_classification,
      history: series.map((d) => ({
        value: parseInt(d.value, 10),
        classification: d.value_classification,
        ts: parseInt(d.timestamp, 10) * 1000,
      })),
    };
  }

  if (tvlSeries.status === "fulfilled" && tvlSeries.value.length > 0) {
    const last = tvlSeries.value[tvlSeries.value.length - 1];
    overview.defiTvl = last.tvl ?? last.totalLiquidityUSD ?? 0;
  }

  return overview;
}
