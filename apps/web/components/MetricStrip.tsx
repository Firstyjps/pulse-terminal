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
  const m = now ? now.getUTCMinutes() : 0;
  const sessions = [
    { name: "TYO", full: "Tokyo",    startH: 0,  endH: 9  },
    { name: "LDN", full: "London",   startH: 8,  endH: 16 },
    { name: "NYC", full: "New York", startH: 13, endH: 22 },
  ];

  // Pick the *primary* active session (the latest-starting one currently open).
  // Falls back to the next upcoming session when nothing is open.
  let active: { name: string; full: string; startH: number; endH: number } | null = null;
  for (const s of sessions) {
    if (h >= s.startH && h < s.endH) active = s; // last match wins → later session takes priority during overlaps
  }
  let upcoming: { name: string; full: string; startH: number; endH: number; inH: number } | null = null;
  if (!active) {
    let bestDelta = 25;
    for (const s of sessions) {
      const delta = (s.startH - h + 24) % 24;
      if (delta < bestDelta) { bestDelta = delta; upcoming = { ...s, inH: delta }; }
    }
  }

  const openCount = sessions.filter((s) => h >= s.startH && h < s.endH).length;
  const utcStr = now
    ? `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} UTC`
    : "—";

  // Progress through the active session (0..1) — used as a thin bottom bar.
  const progress = active
    ? Math.min(1, Math.max(0, (h - active.startH + m / 60) / (active.endH - active.startH)))
    : 0;

  const accent = active ? colors.green : colors.amber;

  return (
    <div
      style={{
        background: colors.bg1,
        padding: "10px 14px",
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.10em",
            color: colors.txt3,
          }}
        >
          Session
        </span>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 9,
            color: openCount > 0 ? colors.green : colors.txt4,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}
        >
          {openCount}/3 {openCount > 0 ? "OPEN" : "CLOSED"}
        </span>
      </div>

      {/* Big primary readout — only the active (or next) session */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 2,
          flex: 1,
          justifyContent: "center",
          paddingTop: 4,
        }}
        title={active ? `${active.full} session open · UTC ${active.startH}:00–${active.endH}:00` : upcoming ? `${upcoming.full} opens in ${upcoming.inH}h (UTC ${upcoming.startH}:00)` : ""}
      >
        <div
          className="mono-num"
          style={{
            fontFamily: fonts.mono,
            fontSize: 26,
            fontWeight: 700,
            color: accent,
            letterSpacing: "0.08em",
            textShadow: active ? `0 0 10px ${accent}66` : "none",
            lineHeight: 1,
          }}
        >
          {active ? active.name : upcoming?.name ?? "—"}
        </div>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 9,
            color: active ? colors.green : colors.txt3,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
          }}
        >
          {active ? "OPEN" : upcoming ? `OPENS IN ${upcoming.inH}H` : "—"}
        </div>
      </div>

      {/* Footer — UTC clock */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontFamily: fonts.mono,
          fontSize: 10,
          color: colors.txt3,
          marginTop: 4,
        }}
      >
        <span style={{ letterSpacing: "0.08em" }}>UTC</span>
        <span className="mono-num" style={{ color: colors.txt2, fontWeight: 500 }}>{utcStr.replace(" UTC", "")}</span>
      </div>

      {/* Progress bar — thin line at bottom showing % through active window */}
      {active && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            left: 0,
            bottom: 0,
            height: 2,
            width: `${progress * 100}%`,
            background: accent,
            boxShadow: `0 0 6px ${accent}88`,
            transition: "width 0.4s ease",
          }}
        />
      )}
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
