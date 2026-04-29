"use client";

import { useEffect, useState } from "react";
import { StatBlock, colors, fonts } from "@pulse/ui";
import { formatUSD, formatPercent } from "@pulse/sources";
import type { MarketOverview } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";
import { useViewport } from "../lib/use-media";

interface Props {
  refreshKey?: number;
}

/**
 * MarketPulseStats — 6 stat tiles.
 *
 *   Desktop  (≥1024)  : 6×1  one row per handoff Row 1 (h-stats, 96px)
 *   Tablet   (720..1024): 3×2 two stacked rows
 *   Mobile   (<720)   : 2×3 three stacked rows, ≥44px tap-tall
 *
 * 1px gaps between tiles via grid + line-color background showing through.
 */
export function MetricStrip({ refreshKey }: Props) {
  const overview = useFlow<MarketOverview>("/api/flows/overview", refreshKey);
  const o = overview.data;
  const vp = useViewport();

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

  const cols =
    vp === "mobile" ? "repeat(2, 1fr)" :
    vp === "tablet" ? "repeat(3, 1fr)" :
    "repeat(6, 1fr)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: cols,
        gap: 1,
        background: colors.line,
        height: "100%",
        minHeight: vp === "mobile" ? 264 : vp === "tablet" ? 192 : "100%",
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
      <SessionStrip />
    </div>
  );
}

/**
 * Replaces a generic StatBlock for the SESSION cell with a live 3-session view:
 * Tokyo / London / NewYork — each lights green when its window is open in UTC.
 *
 *   TYO  00:00–09:00 UTC
 *   LDN  08:00–16:00 UTC
 *   NYC  13:00–22:00 UTC
 *
 * Updates every minute so the dim→green transition fires on the boundary.
 */
function SessionStrip() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const h = now ? now.getUTCHours() : -1;
  const sessions = [
    { name: "TYO", full: "Tokyo",    open: h >= 0 && h < 9 },
    { name: "LDN", full: "London",   open: h >= 8 && h < 16 },
    { name: "NYC", full: "New York", open: h >= 13 && h < 22 },
  ];
  const openCount = sessions.filter((s) => s.open).length;
  const utcStr = now
    ? `${String(now.getUTCHours()).padStart(2, "0")}:${String(now.getUTCMinutes()).padStart(2, "0")} UTC`
    : "—";

  return (
    <div
      style={{
        background: colors.bg1,
        padding: "8px 10px",
        minHeight: 0,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.txt3,
        }}
      >
        Sessions
      </div>
      <div
        className="mono-num"
        style={{
          fontFamily: fonts.mono,
          fontSize: 14,
          fontWeight: 600,
          marginTop: 4,
          display: "flex",
          gap: 10,
          letterSpacing: "0.04em",
        }}
        title={sessions.map((s) => `${s.full} ${s.open ? "OPEN" : "CLOSED"}`).join("  ·  ")}
      >
        {sessions.map((s) => (
          <span
            key={s.name}
            style={{
              color: s.open ? colors.green : colors.txt4,
              textShadow: s.open ? `0 0 6px ${colors.green}80` : "none",
            }}
          >
            {s.name}
          </span>
        ))}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          marginTop: 2,
          color: openCount > 0 ? colors.green : colors.txt3,
        }}
      >
        {openCount > 0 ? `${openCount}/3 OPEN` : "ALL CLOSED"}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 10,
          marginTop: 2,
          color: colors.txt3,
        }}
      >
        {utcStr}
      </div>
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
