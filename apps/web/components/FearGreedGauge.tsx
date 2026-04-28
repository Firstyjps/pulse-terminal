"use client";

import { colors, fonts } from "@pulse/ui";
import { useFlow } from "../lib/use-flow";
import type { MarketOverview } from "@pulse/sources";

interface Props {
  /** 7-day history values for the bottom mini-bars (defaults to current value flat). */
  history?: number[];
}

/**
 * FearGreedGauge — half-arc gauge per handoff Row 2 right c-4 (360px).
 *
 *   5 segments (Extreme Fear → Extreme Greed) at radius 70, center (95, 80)
 *   Needle at angle = -90 + (value/100)*180 (rotated via SVG transform)
 *   Big number 38px below, classification label, 7-day mini-bars
 */
export function FearGreedGauge({ history }: Props) {
  const overview = useFlow<MarketOverview>("/api/flows/overview");
  const fg = overview.data?.fearGreedIndex;
  const value = fg?.value ?? 50;
  const label = fg?.classification ?? "—";

  const ang = -90 + (value / 100) * 180;
  const valueColor =
    value < 25 ? colors.red :
    value < 45 ? colors.orange :
    value < 55 ? colors.amber :
    value < 75 ? "#9ade2f" : colors.green;

  const r = 70, cx = 95, cy = 80;
  const segs = 5;
  const segColors = [colors.red, colors.orange, colors.amber, "#9ade2f", colors.green];
  const labels7 = ["7d", "6d", "5d", "4d", "3d", "2d", "NOW"];

  // history fallback: 7 flat values
  const hist = history && history.length === 7 ? history : Array.from({ length: 7 }, () => value);

  function polar(a: number) {
    const r2 = (a * Math.PI) / 180;
    return [cx + r * Math.cos(r2), cy + r * Math.sin(r2)] as const;
  }
  function arc(s: number, e: number) {
    const [x1, y1] = polar(s), [x2, y2] = polar(e);
    return `M ${x1.toFixed(2)} ${y1.toFixed(2)} A ${r} ${r} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`;
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "8px 0 12px",
        height: "100%",
      }}
    >
      <svg viewBox="0 0 190 110" width="100%" style={{ maxHeight: 130 }}>
        {Array.from({ length: segs }).map((_, i) => {
          const s = -180 + (i * 180) / segs;
          const e = -180 + ((i + 1) * 180) / segs - 1.5;
          return <path key={i} d={arc(s, e)} stroke={segColors[i]} strokeWidth="10" fill="none" opacity="0.5" />;
        })}
        {/* needle */}
        <g transform={`rotate(${ang} ${cx} ${cy})`}>
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 4} stroke={colors.txt1} strokeWidth="2" />
          <circle cx={cx} cy={cy - r + 4} r="3" fill={colors.txt1} />
        </g>
        <circle cx={cx} cy={cy} r="4" fill={colors.bg0} stroke={colors.amber} strokeWidth="1.5" />
      </svg>

      <div
        className="mono-num"
        style={{
          fontFamily: fonts.mono,
          fontSize: 38,
          fontWeight: 500,
          marginTop: -36,
          letterSpacing: "-0.02em",
          color: valueColor,
        }}
      >
        {fg ? value : "—"}
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginTop: 2,
          color: valueColor,
        }}
      >
        {label.toUpperCase()}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 2,
          width: "100%",
          marginTop: 10,
          padding: "0 8px",
        }}
      >
        {hist.map((v, i) => (
          <div
            key={i}
            style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}
          >
            <div
              style={{
                width: "100%",
                background: colors.bg3,
                height: 18,
                position: "relative",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: colors.amber,
                  height: `${v}%`,
                }}
              />
            </div>
            <div style={{ fontFamily: fonts.mono, fontSize: 8, color: colors.txt3 }}>
              {labels7[i]}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
