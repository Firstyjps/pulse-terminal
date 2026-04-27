import type { StablecoinFlow, StablecoinPoint } from "./types.js";
import { fetchJson } from "./_helpers.js";

type LlamaStablecoin = {
  id: string;
  name: string;
  symbol: string;
  circulating: { peggedUSD?: number; peggedEUR?: number };
};
type LlamaStablecoinsResp = { peggedAssets: LlamaStablecoin[] };
type LlamaChartPoint = {
  date: string;
  totalCirculating: { peggedUSD?: number };
  totalCirculatingUSD?: { peggedUSD?: number };
};

export async function getStablecoins(): Promise<StablecoinFlow> {
  const [list, chart] = await Promise.all([
    fetchJson<LlamaStablecoinsResp>(
      "https://stablecoins.llama.fi/stablecoins?includePrices=true",
      { revalidate: 600 },
    ),
    fetchJson<LlamaChartPoint[]>(
      "https://stablecoins.llama.fi/stablecoincharts/all?stablecoin=1",
      { revalidate: 600 },
    ),
  ]);

  const top = list.peggedAssets
    .map((s) => ({ name: s.symbol, mcap: s.circulating?.peggedUSD ?? 0 }))
    .filter((s) => s.mcap > 0)
    .sort((a, b) => b.mcap - a.mcap);

  const totalMcap = top.reduce((sum, s) => sum + s.mcap, 0);
  const dominance = top.slice(0, 6).map((s) => ({
    name: s.name,
    mcap: s.mcap,
    pct: totalMcap > 0 ? (s.mcap / totalMcap) * 100 : 0,
  }));

  const findMcap = (sym: string) =>
    top.find((s) => s.name.toUpperCase() === sym)?.mcap ?? 0;

  const usdt = findMcap("USDT");
  const usdc = findMcap("USDC");
  const dai = findMcap("DAI");

  const slice = chart.slice(-180);
  const history: StablecoinPoint[] = slice.map((point) => {
    const total =
      point.totalCirculatingUSD?.peggedUSD ??
      point.totalCirculating?.peggedUSD ??
      0;
    const date = new Date(parseInt(point.date, 10) * 1000)
      .toISOString()
      .slice(0, 10);
    return {
      date,
      totalCirculating: total,
      usdt: 0,
      usdc: 0,
      dai: 0,
      others: total,
    };
  });

  if (history.length > 0) {
    const last = history[history.length - 1];
    last.usdt = usdt;
    last.usdc = usdc;
    last.dai = dai;
    last.others = Math.max(0, last.totalCirculating - usdt - usdc - dai);
  }

  const last = history[history.length - 1]?.totalCirculating ?? totalMcap;
  const prev7 = history[history.length - 8]?.totalCirculating ?? last;
  const prev30 = history[history.length - 31]?.totalCirculating ?? last;

  const change7d = last - prev7;
  const change30d = last - prev30;

  return {
    history,
    summary: {
      currentTotal: last,
      change7d,
      change30d,
      change7dPercent: prev7 > 0 ? (change7d / prev7) * 100 : 0,
      change30dPercent: prev30 > 0 ? (change30d / prev30) * 100 : 0,
      dominance,
    },
  };
}
