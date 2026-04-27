import type { MarketOverview } from "./types";
import { fetchJson } from "./_helpers";

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
type FngResp = { data: { value: string; value_classification: string }[] };
type DefiTvl = { totalLiquidityUSD?: number; tvl?: number }[];

export async function getOverview(): Promise<MarketOverview> {
  const [global, fng, tvlSeries] = await Promise.allSettled([
    fetchJson<CGGlobal>("https://api.coingecko.com/api/v3/global", { revalidate: 120 }),
    fetchJson<FngResp>("https://api.alternative.me/fng/?limit=1", { revalidate: 600 }),
    fetchJson<DefiTvl>("https://api.llama.fi/v2/historicalChainTvl", { revalidate: 600 }),
  ]);

  const overview: MarketOverview = {
    totalMarketCap: 0,
    totalVolume24h: 0,
    btcDominance: 0,
    ethDominance: 0,
    marketCapChange24h: 0,
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
    overview.marketCapChange24h = d.market_cap_change_percentage_24h_usd;
    overview.activeCryptocurrencies = d.active_cryptocurrencies;
    overview.defiMarketCap = d.defi_market_cap ?? 0;
  }

  if (fng.status === "fulfilled" && fng.value.data?.[0]) {
    overview.fearGreedIndex = {
      value: parseInt(fng.value.data[0].value, 10),
      classification: fng.value.data[0].value_classification,
    };
  }

  if (tvlSeries.status === "fulfilled" && tvlSeries.value.length > 0) {
    const last = tvlSeries.value[tvlSeries.value.length - 1];
    overview.defiTvl = last.tvl ?? last.totalLiquidityUSD ?? 0;
  }

  return overview;
}
