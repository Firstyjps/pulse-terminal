import * as React from "react";
import { colors } from "@pulse/ui";

export interface SparklineProps {
  data: number[];
  positive?: boolean;
  width?: number;
  height?: number;
  /** Stroke color override. Defaults to green (positive) or red. */
  color?: string;
}

/**
 * Pure SVG sparkline — no dependencies. Ported from CryptoTerminal/js/app.js.
 * Renders the last 20 data points as a polyline with gradient fill underneath.
 */
export function Sparkline({
  data,
  positive,
  width = 70,
  height = 28,
  color,
}: SparklineProps) {
  if (!data || data.length < 2) {
    return (
      <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height}>
        <text x="2" y={height / 2 + 4} fill={colors.txt4} fontSize="8">
          N/A
        </text>
      </svg>
    );
  }

  const pts = data.slice(-20);
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const range = max - min || 1;
  const pad = 2;

  const xs = pts.map((_, i) => pad + (i * (width - pad * 2)) / (pts.length - 1));
  const ys = pts.map((p) => height - pad - ((p - min) / range) * (height - pad * 2));
  const poly = xs.map((x, i) => `${x.toFixed(1)},${ys[i].toFixed(1)}`).join(" ");
  const fillPoly = `${xs[0].toFixed(1)},${height} ${poly} ${xs[xs.length - 1].toFixed(1)},${height}`;

  const stroke = color ?? (positive ? colors.green : colors.red);
  const fillId = `spark-fill-${positive ? "up" : "down"}-${stroke.replace("#", "")}`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={{ display: "block" }}>
      <defs>
        <linearGradient id={fillId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
          <stop offset="100%" stopColor={stroke} stopOpacity={0} />
        </linearGradient>
      </defs>
      <polygon points={fillPoly} fill={`url(#${fillId})`} />
      <polyline points={poly} fill="none" stroke={stroke} strokeWidth={1.5} />
    </svg>
  );
}
