"use client";

import { StatBlock, colors } from "@pulse/ui";
import { formatUSD, formatPercent } from "@pulse/sources";
import type { MarketOverview } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

interface Props {
  refreshKey?: number;
}

/**
 * MarketPulseStats — 6 stat tiles per handoff Row 1 (h-stats, 96px).
 *
 *   Total Market Cap · Volume 24h · BTC Dominance · Active Assets · Fear & Greed · Session
 *
 * 1px gaps between tiles via grid + line-color background showing through.
 */
export function MetricStrip({ refreshKey }: Props) {
  const overview = useFlow<MarketOverview>("/api/flows/overview", refreshKey);
  const o = overview.data;

  const cap = o ? fmtCompact(o.totalMarketCap) : "—";
  const vol = o ? fmtCompact(o.totalVolume24h) : "—";
  const turn = o && o.totalMarketCap > 0 ? `${((o.totalVolume24h / o.totalMarketCap) * 100).toFixed(2)}% of cap` : "";
  const chg = o?.marketCapChange24h;
  const chgColor = chg == null ? colors.txt3 : chg >= 0 ? colors.green : colors.red;
  const chgText = chg != null ? formatPercent(chg) : "";

  const btcD = o?.btcDominance != null ? `${o.btcDominance.toFixed(2)}%` : "—";
  const ethD = o?.ethDominance != null ? `${o.ethDominance.toFixed(2)}%` : "—";

  const fg = o?.fearGreedIndex;
  const fgValue = fg ? fg.value.toString() : "—";
  const fgClassName = fg ? fg.classification.toUpperCase() : "—";
  const fgColor = fg ? gradeFG(fg.value) : colors.txt3;

  const active = o?.activeCryptocurrencies?.toLocaleString() ?? "—";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(6, 1fr)",
        gap: 1,
        background: colors.line,
        height: "100%",
      }}
    >
      <StatBlock
        label="Total Market Cap"
        value={cap}
        delta={chgText}
        deltaColor={chgColor}
        sub="24h Δ"
      />
      <StatBlock
        label="Volume · 24h"
        value={vol}
        sub={turn}
      />
      <StatBlock
        label="BTC Dominance"
        value={btcD}
        delta={`ETH ${ethD}`}
        deltaColor={colors.cyan}
        sub="vs total mcap"
      />
      <StatBlock
        label="Active Assets"
        value={active}
        sub="tracked across feeds"
      />
      <StatBlock
        label="Fear & Greed"
        value={fgValue}
        delta={fgClassName}
        deltaColor={fgColor}
        sub="alternative.me · 24h"
      />
      <StatBlock
        label="Session"
        value="US·EU"
        delta="OPEN"
        deltaColor={colors.green}
        sub="overlap window"
      />
    </div>
  );
}

function fmtCompact(n?: number): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return formatUSD(n, { compact: true, decimals: 2 });
}

function gradeFG(v: number): string {
  if (v >= 75) return colors.green;
  if (v >= 55) return colors.amberBright;
  if (v >= 45) return colors.amber;
  if (v >= 25) return colors.orange;
  return colors.red;
}
