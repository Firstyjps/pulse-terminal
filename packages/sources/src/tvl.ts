import type { TvlResponse } from "./types";
import { fetchJson } from "./_helpers";

type LlamaHistorical = { date: number; tvl: number };
type LlamaChain = {
  name: string;
  tvl?: number;
  change_1d?: number;
  change_7d?: number;
};

export async function getTVL(): Promise<TvlResponse> {
  const [series, chainList] = await Promise.all([
    fetchJson<LlamaHistorical[]>(
      "https://api.llama.fi/v2/historicalChainTvl",
      { revalidate: 600 },
    ),
    fetchJson<LlamaChain[]>(
      "https://api.llama.fi/v2/chains",
      { revalidate: 600 },
    ),
  ]);

  const points = series.slice(-180).map((p) => ({
    date: new Date(p.date * 1000).toISOString().slice(0, 10),
    tvl: p.tvl,
  }));

  const total = points[points.length - 1]?.tvl ?? 0;
  const prev1 = points[points.length - 2]?.tvl ?? total;
  const prev7 = points[points.length - 8]?.tvl ?? total;
  const prev30 = points[points.length - 31]?.tvl ?? total;

  const change1d = prev1 > 0 ? ((total - prev1) / prev1) * 100 : 0;
  const change7d = prev7 > 0 ? ((total - prev7) / prev7) * 100 : 0;
  const change30d = prev30 > 0 ? ((total - prev30) / prev30) * 100 : 0;

  const byChain = chainList
    .filter((c) => (c.tvl ?? 0) > 0)
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, 12)
    .map((c) => ({
      name: c.name,
      tvl: c.tvl ?? 0,
      change1d:
        (c.change_1d ?? 0) *
        (c.change_1d && Math.abs(c.change_1d) < 1 ? 100 : 1),
      change7d:
        (c.change_7d ?? 0) *
        (c.change_7d && Math.abs(c.change_7d) < 1 ? 100 : 1),
    }));

  return {
    history: points,
    byChain,
    summary: { total, change1d, change7d, change30d },
  };
}
