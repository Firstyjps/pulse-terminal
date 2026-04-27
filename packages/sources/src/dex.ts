import type { DexVolumeResponse } from "./types";
import { fetchJson } from "./_helpers";

type LlamaTotal = {
  totalDataChart: [number, number][];
  totalDataChartBreakdown?: [number, Record<string, number>][];
  total24h?: number;
  total7d?: number;
  change_1d?: number;
};
type LlamaChainList = {
  protocols?: { name: string; total24h?: number }[];
};

export async function getDexVolume(): Promise<DexVolumeResponse> {
  const [overview, chains] = await Promise.all([
    fetchJson<LlamaTotal>(
      "https://api.llama.fi/overview/dexs?excludeTotalDataChart=false&excludeTotalDataChartBreakdown=false",
      { revalidate: 600 },
    ),
    fetchJson<LlamaChainList>(
      "https://api.llama.fi/overview/dexs?excludeTotalDataChart=true&excludeTotalDataChartBreakdown=true",
      { revalidate: 600 },
    ).catch(() => ({ protocols: [] }) as LlamaChainList),
  ]);

  const points = (overview.totalDataChart ?? []).slice(-180).map(
    ([ts, volume]) => ({
      date: new Date(ts * 1000).toISOString().slice(0, 10),
      volume,
    }),
  );

  const total24h = overview.total24h ?? points[points.length - 1]?.volume ?? 0;
  const total7d =
    overview.total7d ?? points.slice(-7).reduce((s, p) => s + p.volume, 0);

  const protocols = chains.protocols ?? [];
  const totalProto = protocols.reduce((s, p) => s + (p.total24h ?? 0), 0);
  const byChain = protocols
    .filter((p) => (p.total24h ?? 0) > 0)
    .sort((a, b) => (b.total24h ?? 0) - (a.total24h ?? 0))
    .slice(0, 8)
    .map((p) => ({
      name: p.name,
      volume24h: p.total24h ?? 0,
      share: totalProto > 0 ? ((p.total24h ?? 0) / totalProto) * 100 : 0,
    }));

  return {
    history: points,
    byChain,
    summary: {
      total24h,
      total7d,
      change24h: overview.change_1d ?? 0,
    },
  };
}
