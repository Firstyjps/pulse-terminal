"use client";

import { colors, fonts } from "@pulse/ui";
import { useFlow } from "../lib/use-flow";
import type { MarketOverview } from "@pulse/sources";

/**
 * FearGreedGauge — half-arc gauge + 7-day history bars.
 *
 *   Top: 5-segment half-arc (Extreme Fear → Extreme Greed) with needle.
 *   Center: live value (38px) + classification.
 *   Bottom: 7-day history bars — height ∝ value, color by F&G zone, value
 *           printed on each bar. Today's bar is the rightmost ("NOW").
 */
export function FearGreedGauge() {
  const overview = useFlow<MarketOverview>("/api/flows/overview");
  const fg = overview.data?.fearGreedIndex;
  const value = fg?.value ?? 50;
  const label = fg?.classification ?? "—";

  const ang = -90 + (value / 100) * 180;

  // Build the 7-day series — pad with nulls if we have fewer than 7 days.
  const seriesRaw = fg?.history ?? [];
  // Ensure exactly 7 slots, oldest → newest
  const padded: ({ value: number; classification: string } | null)[] = Array.from(
    { length: 7 },
    (_, i) => {
      const offsetFromEnd = 6 - i; // 6 = oldest slot, 0 = newest
      const idx = seriesRaw.length - 1 - offsetFromEnd;
      return idx >= 0 ? seriesRaw[idx] : null;
    },
  );

  const r = 70, cx = 95, cy = 80;
  const segs = 5;
  const segColors = [colors.red, colors.orange, colors.amber, "#9ade2f", colors.green];
  const labels7 = ["7d", "6d", "5d", "4d", "3d", "2d", "NOW"];

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
      {/* Gauge group — value is absolutely positioned over the SVG so the
          layout no longer depends on a fragile `marginTop: -36` hack that
          collided with the panel chrome on narrow mobile widths. */}
      <div
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 240,
          display: "flex",
          justifyContent: "center",
        }}
      >
        <svg viewBox="0 0 190 110" width="100%" style={{ maxHeight: 130, display: "block" }}>
          {Array.from({ length: segs }).map((_, i) => {
            const s = -180 + (i * 180) / segs;
            const e = -180 + ((i + 1) * 180) / segs - 1.5;
            return <path key={i} d={arc(s, e)} stroke={segColors[i]} strokeWidth="10" fill="none" opacity="0.5" />;
          })}
          <g transform={`rotate(${ang} ${cx} ${cy})`}>
            <line x1={cx} y1={cy} x2={cx} y2={cy - r + 4} stroke={colors.txt1} strokeWidth="2" />
            <circle cx={cx} cy={cy - r + 4} r="3" fill={colors.txt1} />
          </g>
          <circle cx={cx} cy={cy} r="4" fill={colors.bg0} stroke={colors.amber} strokeWidth="1.5" />
        </svg>
        <div
          className="mono-num"
          style={{
            position: "absolute",
            left: 0,
            right: 0,
            bottom: 2,
            textAlign: "center",
            fontFamily: fonts.mono,
            fontSize: 32,
            fontWeight: 500,
            lineHeight: 1,
            letterSpacing: "-0.02em",
            color: zoneColor(value),
            pointerEvents: "none",
          }}
        >
          {fg ? value : "—"}
        </div>
      </div>
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 11,
          textTransform: "uppercase",
          letterSpacing: "0.12em",
          marginTop: 6,
          color: zoneColor(value),
        }}
      >
        {label.toUpperCase()}
      </div>

      {/* 7-day history bars — height ∝ value, color by zone, value label on each bar */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(7, 1fr)",
          gap: 4,
          width: "100%",
          marginTop: 14,
          padding: "0 12px",
        }}
        title="Historical Fear & Greed values from alternative.me · color = zone, height = value"
      >
        {padded.map((p, i) => {
          const v = p?.value ?? null;
          const c = v != null ? zoneColor(v) : colors.txt4;
          const isToday = i === 6;
          return (
            <div
              key={i}
              style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}
              title={p ? `${labels7[i]} · ${p.value} ${p.classification.toUpperCase()}` : `${labels7[i]} · no data`}
            >
              <div
                className="mono-num"
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 10,
                  color: v != null ? c : colors.txt4,
                  fontWeight: isToday ? 700 : 500,
                  letterSpacing: "-0.02em",
                  height: 12,
                  lineHeight: "12px",
                }}
              >
                {v ?? "—"}
              </div>
              <div
                style={{
                  width: "100%",
                  height: 36,
                  background: colors.bg3,
                  border: isToday ? `1px solid ${c}88` : `1px solid ${colors.line}`,
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                {v != null && (
                  <div
                    style={{
                      position: "absolute",
                      left: 0,
                      right: 0,
                      bottom: 0,
                      background: c,
                      height: `${Math.max(8, v)}%`,
                      boxShadow: isToday ? `0 0 6px ${c}77 inset` : "none",
                      opacity: isToday ? 1 : 0.85,
                      transition: "height .35s ease, background .35s ease",
                    }}
                  />
                )}
              </div>
              <div
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 9,
                  color: isToday ? colors.amber : colors.txt3,
                  letterSpacing: "0.06em",
                  fontWeight: isToday ? 700 : 400,
                }}
              >
                {labels7[i]}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function zoneColor(v: number): string {
  // Same thresholds the gauge uses for the 5 segments
  if (v < 25) return colors.red;
  if (v < 45) return colors.orange;
  if (v < 55) return colors.amber;
  if (v < 75) return "#9ade2f";
  return colors.green;
}
