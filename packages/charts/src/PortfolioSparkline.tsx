import * as React from "react";
import { colors, fonts } from "@pulse/ui";
import { Sparkline } from "./Sparkline";

export type PortfolioWindow = "24h" | "7d" | "30d";

export interface PortfolioSparklineProps {
  /** Total portfolio USD samples across the window, oldest → newest. */
  points: number[];
  window: PortfolioWindow;
  /** Net change over the window in USD. Sign drives the color. */
  deltaUsd: number;
  /** Net change over the window in percent (e.g. 2.5 = 2.5%). */
  deltaPct: number;
  /** Sparkline width in px. Default 80. */
  width?: number;
  /** Sparkline height in px. Default 22. */
  height?: number;
  /** Hide the inline delta + window labels — useful inside dense table cells. */
  compact?: boolean;
}

const fmtUsd = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n >= 0 ? "+" : "−";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const fmtPct = (n: number): string =>
  `${n >= 0 ? "+" : "−"}${Math.abs(n).toFixed(2)}%`;

/**
 * Inline sparkline + delta label for portfolio total USD over a 24h / 7d / 30d
 * window. Color (green/red) is driven by `deltaUsd` sign. Composes the existing
 * `<Sparkline>` so the line rendering stays consistent with the rest of the app.
 */
export function PortfolioSparkline({
  points,
  window,
  deltaUsd,
  deltaPct,
  width = 80,
  height = 22,
  compact = false,
}: PortfolioSparklineProps) {
  const positive = deltaUsd >= 0;
  const tone = positive ? colors.green : colors.red;
  const hasData = points.length >= 2;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontFamily: fonts.mono,
        fontSize: 11,
      }}
    >
      <Sparkline data={points} positive={positive} width={width} height={height} />
      {!compact && hasData && (
        <>
          <span
            style={{
              color: tone,
              fontWeight: 600,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {fmtUsd(deltaUsd)}
          </span>
          <span style={{ color: tone, fontVariantNumeric: "tabular-nums" }}>
            {fmtPct(deltaPct)}
          </span>
          <span
            style={{
              color: colors.txt4,
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            {window}
          </span>
        </>
      )}
    </span>
  );
}
