// DefiLlama TVL adapter.
//
// As of 2026-Q2 the `/v2/chains` (and `/chains` v1) endpoints stopped including
// `change_1d` / `change_7d` per chain — both responses now carry only
// `{name, tvl, …}`. Reading the missing field silently coerced to 0 and every
// row in the Top Chains table rendered "0.00%". Fix: derive deltas from the
// per-chain historical series (`/v2/historicalChainTvl/<chain>`) for the
// 12 chains we actually display. N=12 daily fetches, parallel, cached 600s.
import type { TvlResponse } from "./types.js";
import { fetchJson } from "./_helpers.js";

type LlamaHistorical = { date: number; tvl: number };
type LlamaChain = {
  name: string;
  tvl?: number;
};

const TOP_N = 12;

function pctChange(current: number, prev: number): number {
  return prev > 0 ? ((current - prev) / prev) * 100 : 0;
}

/** From a daily TVL series, compute 1d and 7d % deltas using the tail. */
export function computeChainDelta(
  series: LlamaHistorical[],
  liveTvl: number,
): { change1d: number; change7d: number } {
  if (!series.length) return { change1d: 0, change7d: 0 };
  const n = series.length;
  const prev1 = series[n - 2]?.tvl ?? series[n - 1].tvl;
  const prev7 = series[n - 8]?.tvl ?? series[n - 1].tvl;
  // Use liveTvl from /v2/chains as "current" — it's intraday-fresh; the
  // historical series only finalizes daily. Falls through to series tail
  // if liveTvl is 0/missing.
  const current = liveTvl > 0 ? liveTvl : series[n - 1].tvl;
  return {
    change1d: pctChange(current, prev1),
    change7d: pctChange(current, prev7),
  };
}

async function fetchChainHistory(name: string): Promise<LlamaHistorical[] | null> {
  try {
    return await fetchJson<LlamaHistorical[]>(
      `https://api.llama.fi/v2/historicalChainTvl/${encodeURIComponent(name)}`,
      { revalidate: 600 },
    );
  } catch {
    return null;
  }
}

export async function getTVL(): Promise<TvlResponse> {
  const [series, chainList] = await Promise.all([
    fetchJson<LlamaHistorical[]>("https://api.llama.fi/v2/historicalChainTvl", {
      revalidate: 600,
    }),
    fetchJson<LlamaChain[]>("https://api.llama.fi/v2/chains", { revalidate: 600 }),
  ]);

  const points = series.slice(-180).map((p) => ({
    date: new Date(p.date * 1000).toISOString().slice(0, 10),
    tvl: p.tvl,
  }));

  const total = points[points.length - 1]?.tvl ?? 0;
  const prev1 = points[points.length - 2]?.tvl ?? total;
  const prev7 = points[points.length - 8]?.tvl ?? total;
  const prev30 = points[points.length - 31]?.tvl ?? total;

  const change1d = pctChange(total, prev1);
  const change7d = pctChange(total, prev7);
  const change30d = pctChange(total, prev30);

  const top = chainList
    .filter((c) => (c.tvl ?? 0) > 0)
    .sort((a, b) => (b.tvl ?? 0) - (a.tvl ?? 0))
    .slice(0, TOP_N);

  // Parallel per-chain history fetch. Failures degrade to 0% delta for that
  // chain only — they don't kill the overall response.
  const histories = await Promise.all(top.map((c) => fetchChainHistory(c.name)));

  const byChain = top.map((c, i) => {
    const series = histories[i];
    const delta = series
      ? computeChainDelta(series, c.tvl ?? 0)
      : { change1d: 0, change7d: 0 };
    return {
      name: c.name,
      tvl: c.tvl ?? 0,
      change1d: delta.change1d,
      change7d: delta.change7d,
    };
  });

  return {
    history: points,
    byChain,
    summary: { total, change1d, change7d, change30d },
  };
}
