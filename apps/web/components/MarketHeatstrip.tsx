"use client";

import { useRouter } from "next/navigation";
import { colors, fonts } from "@pulse/ui";
import { useFlow } from "../lib/use-flow";

interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_24h_in_currency?: number;
}

/**
 * Color ramp: 24h % change → 7-stop signal gradient.
 * Tuned so that small daily moves (0-2%) are still clearly visible — most coins
 * spend most of their time in this range, so the heatmap would read flat-black
 * if those bands were too faint.
 */
function heatColor(pct: number): { bg: string; fg: string } {
  if (!Number.isFinite(pct)) return { bg: colors.bg3, fg: colors.txt3 };
  const v = Math.max(-12, Math.min(12, pct));
  if (v >= 6)  return { bg: "rgba(65,255,139,0.42)", fg: "#b6ffd0" };
  if (v >= 3)  return { bg: "rgba(65,255,139,0.30)", fg: "#9effc2" };
  if (v >= 1)  return { bg: "rgba(65,255,139,0.20)", fg: "#41ff8b" };
  if (v >= 0)  return { bg: "rgba(65,255,139,0.10)", fg: "#86e0a8" };
  if (v >= -1) return { bg: "rgba(255,51,85,0.10)",  fg: "#e88c98" };
  if (v >= -3) return { bg: "rgba(255,51,85,0.20)",  fg: "#ff5c75" };
  if (v >= -6) return { bg: "rgba(255,51,85,0.30)",  fg: "#ff8294" };
  return { bg: "rgba(255,51,85,0.42)", fg: "#ffb1be" };
}

interface Props {
  /** Number of cells. Default 20. */
  count?: number;
  /** Height of strip in px. Default 128. */
  height?: number;
}

export function MarketHeatstrip({ count = 20, height = 128 }: Props) {
  const { data, loading, error } = useFlow<CoinRow[]>("/api/markets");
  const router = useRouter();

  if (error) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: colors.red,
          fontFamily: fonts.mono,
          fontSize: 11,
        }}
      >
        ERR · {error}
      </div>
    );
  }

  if (loading || !data) {
    return (
      <div style={{ display: "grid", gridTemplateColumns: `repeat(${count}, 1fr)`, gap: 1, height }}>
        {Array.from({ length: count }, (_, i) => (
          <div
            key={i}
            style={{
              background: colors.bg2,
              borderRadius: 2,
              opacity: 0.5,
              animation: `heat-rise 380ms ease-out backwards`,
              animationDelay: `${i * 18}ms`,
            }}
          />
        ))}
      </div>
    );
  }

  const cells = data.slice(0, count);
  const maxVol = Math.max(...cells.map((c) => c.total_volume || 0), 1);

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${count}, 1fr)`,
        gap: 1,
        height,
        background: colors.bg1,
        border: `1px solid ${colors.line}`,
        borderRadius: 3,
        overflow: "hidden",
        boxShadow: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px -12px rgba(0,0,0,0.7)",
      }}
    >
      {cells.map((c, i) => {
        const pct = c.price_change_percentage_24h_in_currency ?? 0;
        const { bg, fg } = heatColor(pct);
        const fillRatio = (c.total_volume || 0) / maxVol;
        const sym = c.symbol.toUpperCase();

        return (
          <button
            key={c.id}
            type="button"
            className="heat-cell"
            onClick={() => router.push(`/markets?symbol=${sym}`)}
            title={
              `${sym} · ${c.name}\n` +
              `Price:  $${c.current_price.toLocaleString(undefined, { maximumFractionDigits: c.current_price < 1 ? 4 : 2 })}\n` +
              `24h Δ:  ${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%\n` +
              `Volume: $${(c.total_volume / 1e9).toFixed(2)}B (24h)\n` +
              `Mcap:   $${(c.market_cap / 1e9).toFixed(2)}B\n` +
              `\n→ click to inspect on /markets`
            }
            style={{
              position: "relative",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              padding: 0,
              overflow: "hidden",
              animationDelay: `${i * 22}ms`,
              transition: "transform .15s ease",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.transform = "scaleY(1.04)";
              e.currentTarget.style.zIndex = "2";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.transform = "scaleY(1)";
              e.currentTarget.style.zIndex = "auto";
            }}
          >
            {/* volume fill — bar from bottom */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                bottom: 0,
                height: `${Math.max(8, fillRatio * 100)}%`,
                background: bg,
                transition: "height .3s ease",
              }}
            />
            {/* faint grid behind */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                inset: 0,
                background: colors.bg2,
                zIndex: -1,
              }}
            />
            {/* ticker label */}
            <div
              style={{
                position: "absolute",
                top: 10,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily: fonts.mono,
                fontSize: 12,
                fontWeight: 800,
                color: colors.txt1,
                letterSpacing: "0.04em",
              }}
            >
              {sym}
            </div>
            {/* 24h Δ — explicit sign + % so it's unambiguous */}
            <div
              style={{
                position: "absolute",
                bottom: 10,
                left: 0,
                right: 0,
                textAlign: "center",
                fontFamily: fonts.mono,
                fontSize: 14,
                fontWeight: 800,
                color: fg,
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.01em",
                textShadow: Math.abs(pct) > 4 ? `0 0 10px ${fg}` : undefined,
              }}
            >
              {pct >= 0 ? "+" : ""}
              {pct.toFixed(2)}
              <span style={{ fontSize: 11, opacity: 0.7, marginLeft: 1 }}>%</span>
            </div>
            {/* mid-cell tiny label "24H" — disambiguates the number */}
            <div
              aria-hidden
              style={{
                position: "absolute",
                top: "50%",
                left: 0,
                right: 0,
                textAlign: "center",
                transform: "translateY(-50%)",
                fontFamily: fonts.mono,
                fontSize: 8.5,
                fontWeight: 700,
                color: colors.txt4,
                letterSpacing: "0.18em",
                pointerEvents: "none",
              }}
            >
              24H
            </div>
            {/* hairline divider top */}
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                height: 1,
                background: pct >= 2 ? "rgba(65,255,139,0.4)" : pct <= -2 ? "rgba(255,51,85,0.4)" : "rgba(255,255,255,0.04)",
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
