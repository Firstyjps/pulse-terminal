"use client";

import * as React from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colors } from "@pulse/ui";

export interface OIPoint {
  strike: number;
  callOi: number;
  putOi: number;
}

export interface OIByStrikeProps {
  data: OIPoint[];
  /** Current spot price — drawn as vertical reference line. */
  spot?: number;
  height?: number;
  /** Stack puts as negative values (mirror layout). Default: false (side-by-side). */
  mirror?: boolean;
  callColor?: string;
  putColor?: string;
}

const AXIS = "rgba(255,255,255,0.35)";
const GRID = "rgba(255,255,255,0.05)";

const fmtOI = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toFixed(0);
};
const fmtStrike = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0));

/**
 * Open Interest distribution across strikes — calls vs puts.
 *
 * `mirror=false` (default): side-by-side bars per strike.
 * `mirror=true`: puts rendered as negative values, creating an above/below pyramid.
 *
 * Designed for the Options page "OI BY STRIKE" panel.
 */
export function OIByStrike({
  data,
  spot,
  height = 280,
  mirror = false,
  callColor = colors.green,
  putColor = colors.red,
}: OIByStrikeProps) {
  const rendered = React.useMemo(() => {
    const sorted = [...data].sort((a, b) => a.strike - b.strike);
    if (!mirror) return sorted;
    return sorted.map((p) => ({ ...p, putOi: -Math.abs(p.putOi) }));
  }, [data, mirror]);

  if (rendered.length === 0) {
    return (
      <div style={{ width: "100%", height, display: "grid", placeItems: "center", color: AXIS, fontSize: 12 }}>
        No OI data
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <BarChart data={rendered} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="strike"
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={fmtStrike}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={fmtOI}
            axisLine={false}
            tickLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{
              background: "#070a13",
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: 3,
              fontSize: 11,
            }}
            labelFormatter={(v) => `Strike ${fmtStrike(Number(v))}`}
            formatter={(v: number, name: string) => [fmtOI(Math.abs(v)), name]}
          />
          {mirror && <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />}
          {spot !== undefined && (
            <ReferenceLine
              x={spot}
              stroke={colors.amber}
              strokeDasharray="3 3"
              label={{ value: "ATM", fill: colors.amber, fontSize: 10, position: "top" }}
            />
          )}
          <Bar dataKey="callOi" name="Call OI" fill={callColor} radius={[2, 2, 0, 0]} />
          <Bar dataKey="putOi" name="Put OI" fill={putColor} radius={mirror ? [0, 0, 2, 2] : [2, 2, 0, 0]} />
          <Legend wrapperStyle={{ fontSize: 10, color: AXIS }} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
