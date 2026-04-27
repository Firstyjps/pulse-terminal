import type { FundflowSnapshot } from "./types.js";
import { getOverview } from "./overview.js";
import { getStablecoins } from "./stablecoins.js";
import { getETFFlows } from "./etf.js";
import { getFutures } from "./futures.js";
import { getDexVolume } from "./dex.js";
import { getTVL } from "./tvl.js";

/**
 * Render a FundflowSnapshot as a compact markdown brief, suitable for sending
 * to an LLM as context. Used by both /api/analyze and the MCP server's
 * get_fundflow_snapshot tool so both paths see identical input.
 */
export function summarizeSnapshot(
  snapshot: FundflowSnapshot,
  mode: string = "overview",
): string {
  const parts: string[] = [];
  parts.push(`# Fund Flow Snapshot — ${snapshot.generatedAt}`);
  parts.push(`Analysis mode: ${mode}`);

  if (snapshot.overview) {
    const o = snapshot.overview;
    parts.push("\n## Market Overview");
    parts.push(`- Total Market Cap: $${(o.totalMarketCap / 1e12).toFixed(2)}T (24h: ${o.marketCapChange24h.toFixed(2)}%)`);
    parts.push(`- 24h Volume: $${(o.totalVolume24h / 1e9).toFixed(2)}B`);
    parts.push(`- BTC Dominance: ${o.btcDominance.toFixed(2)}% / ETH Dominance: ${o.ethDominance.toFixed(2)}%`);
    parts.push(`- DeFi TVL: $${(o.defiTvl / 1e9).toFixed(2)}B`);
    if (o.fearGreedIndex) {
      parts.push(`- Fear & Greed Index: ${o.fearGreedIndex.value} (${o.fearGreedIndex.classification})`);
    }
    parts.push(`- Active Cryptocurrencies: ${o.activeCryptocurrencies.toLocaleString()}`);
  }

  if (snapshot.stablecoins) {
    const s = snapshot.stablecoins.summary;
    parts.push("\n## Stablecoin Flows");
    parts.push(`- Total Supply: $${(s.currentTotal / 1e9).toFixed(2)}B`);
    parts.push(`- 7d change: ${s.change7d > 0 ? "+" : ""}$${(s.change7d / 1e9).toFixed(2)}B (${s.change7dPercent.toFixed(2)}%)`);
    parts.push(`- 30d change: ${s.change30d > 0 ? "+" : ""}$${(s.change30d / 1e9).toFixed(2)}B (${s.change30dPercent.toFixed(2)}%)`);
    parts.push(`- Dominance: ${s.dominance.slice(0, 4).map((d) => `${d.name} ${d.pct.toFixed(1)}%`).join(", ")}`);
  }

  if (snapshot.etf) {
    const e = snapshot.etf.summary;
    const proxy = snapshot.etf._isProxy;
    parts.push("\n## ETF Flows" + (proxy ? " (Proxy data — no Coinglass key)" : ""));
    parts.push(`- BTC ETF Latest: $${(e.btcLast / 1e6).toFixed(2)}M · 7d $${(e.btc7dSum / 1e6).toFixed(2)}M · 30d $${(e.btc30dSum / 1e6).toFixed(2)}M · cum $${(e.btcCumulative / 1e9).toFixed(2)}B`);
    parts.push(`- ETH ETF Latest: $${(e.ethLast / 1e6).toFixed(2)}M · 7d $${(e.eth7dSum / 1e6).toFixed(2)}M · 30d $${(e.eth30dSum / 1e6).toFixed(2)}M · cum $${(e.ethCumulative / 1e9).toFixed(2)}B`);
  }

  if (snapshot.futures) {
    const f = snapshot.futures;
    parts.push("\n## Futures (Binance)");
    parts.push(`- BTC: $${f.btc.price.toLocaleString()} (24h ${f.btc.priceChange24h.toFixed(2)}%) · OI $${(f.btc.openInterest / 1e9).toFixed(2)}B · Funding ${f.btc.fundingRate.toFixed(4)}% · L/S ${f.btc.longShortRatio.toFixed(2)}`);
    parts.push(`- ETH: $${f.eth.price.toLocaleString()} (24h ${f.eth.priceChange24h.toFixed(2)}%) · OI $${(f.eth.openInterest / 1e9).toFixed(2)}B · Funding ${f.eth.fundingRate.toFixed(4)}% · L/S ${f.eth.longShortRatio.toFixed(2)}`);
  }

  if (snapshot.dex) {
    const d = snapshot.dex.summary;
    parts.push("\n## DEX Activity");
    parts.push(`- 24h Volume: $${(d.total24h / 1e9).toFixed(2)}B (${d.change24h.toFixed(2)}% vs prior) · 7d $${(d.total7d / 1e9).toFixed(2)}B`);
    if (snapshot.dex.byChain.length) {
      parts.push(`- Top: ${snapshot.dex.byChain.slice(0, 5).map((c) => `${c.name} ${c.share.toFixed(1)}%`).join(", ")}`);
    }
  }

  if (snapshot.tvl) {
    const t = snapshot.tvl.summary;
    parts.push("\n## DeFi TVL");
    parts.push(`- Total: $${(t.total / 1e9).toFixed(2)}B · 1d ${t.change1d.toFixed(2)}% · 7d ${t.change7d.toFixed(2)}% · 30d ${t.change30d.toFixed(2)}%`);
    if (snapshot.tvl.byChain.length) {
      parts.push(`- Top chains: ${snapshot.tvl.byChain.slice(0, 6).map((c) => `${c.name} $${(c.tvl / 1e9).toFixed(1)}B`).join(", ")}`);
    }
  }

  return parts.join("\n");
}

/**
 * Single combined fetch — used by the overview tab and MCP `get_market_overview`.
 * Uses Promise.allSettled so a single source failure doesn't take down the whole snapshot.
 */
export async function getFullSnapshot(): Promise<FundflowSnapshot> {
  const [overview, stablecoins, etf, futures, dex, tvl] =
    await Promise.allSettled([
      getOverview(),
      getStablecoins(),
      getETFFlows(),
      getFutures(),
      getDexVolume(),
      getTVL(),
    ]);

  return {
    overview: overview.status === "fulfilled" ? overview.value : undefined,
    stablecoins: stablecoins.status === "fulfilled" ? stablecoins.value : undefined,
    etf: etf.status === "fulfilled" ? etf.value : undefined,
    futures: futures.status === "fulfilled" ? futures.value : undefined,
    dex: dex.status === "fulfilled" ? dex.value : undefined,
    tvl: tvl.status === "fulfilled" ? tvl.value : undefined,
    generatedAt: new Date().toISOString(),
  };
}
