"use client";

import { MetricCard } from "@pulse/ui";
import { formatUSD, formatPercent } from "@pulse/sources";
import type {
  MarketOverview,
  StablecoinFlow,
  TvlResponse,
} from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

interface Props {
  refreshKey?: number;
}

type Tone = "up" | "down";
const tone = (n?: number): Tone => ((n ?? 0) >= 0 ? "up" : "down");

export function MetricStrip({ refreshKey }: Props) {
  const overview = useFlow<MarketOverview>("/api/flows/overview", refreshKey);
  const stablecoins = useFlow<StablecoinFlow>("/api/flows/stablecoins", refreshKey);
  const tvl = useFlow<TvlResponse>("/api/flows/tvl", refreshKey);

  return (
    <section
      style={{
        display: "grid",
        gap: 12,
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
        marginTop: 32,
      }}
    >
      <MetricCard
        label="Total Market Cap"
        value={overview.data ? formatUSD(overview.data.totalMarketCap) : "—"}
        delta={
          overview.data
            ? { value: formatPercent(overview.data.marketCapChange24h), tone: tone(overview.data.marketCapChange24h) }
            : undefined
        }
        meta="24h change"
      />
      <MetricCard
        label="24h Volume"
        value={overview.data ? formatUSD(overview.data.totalVolume24h) : "—"}
      />
      <MetricCard
        label="BTC Dominance"
        value={overview.data ? `${overview.data.btcDominance.toFixed(2)}%` : "—"}
        meta={overview.data ? `ETH ${overview.data.ethDominance.toFixed(2)}%` : undefined}
      />
      <MetricCard
        label="Stablecoin Mcap"
        value={stablecoins.data ? formatUSD(stablecoins.data.summary.currentTotal) : "—"}
        delta={
          stablecoins.data
            ? {
                value: formatPercent(stablecoins.data.summary.change7dPercent),
                tone: tone(stablecoins.data.summary.change7dPercent),
              }
            : undefined
        }
        meta="7d"
        accent="purple"
      />
      <MetricCard
        label="DeFi TVL"
        value={tvl.data ? formatUSD(tvl.data.summary.total) : "—"}
        delta={
          tvl.data
            ? { value: formatPercent(tvl.data.summary.change7d), tone: tone(tvl.data.summary.change7d) }
            : undefined
        }
        meta="7d"
        accent="cyan"
      />
      <MetricCard
        label="Fear & Greed"
        value={overview.data?.fearGreedIndex ? String(overview.data.fearGreedIndex.value) : "—"}
        meta={overview.data?.fearGreedIndex?.classification}
        accent="gold"
      />
    </section>
  );
}
