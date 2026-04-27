"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  Bar,
  CartesianGrid,
  Cell,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface FlowPoint {
  date: string;
  value: number;
}

export interface FlowAreaChartProps {
  data: FlowPoint[];
  height?: number;
  /** Stroke color. Defaults to cyan accent. */
  color?: string;
  /** Format the y-axis tick. Default: $X.XB-style compact. */
  formatY?: (n: number) => string;
  /** Format the tooltip value. Default: same as formatY. */
  formatTooltip?: (n: number) => string;
  /** Legend label inside the tooltip. */
  label?: string;
}

const AXIS = "rgba(255,255,255,0.35)";
const GRID = "rgba(255,255,255,0.05)";

const defaultFmt = (n: number) => {
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
};

export function FlowAreaChart({
  data,
  height = 280,
  color = "#22d3ee",
  formatY = defaultFmt,
  formatTooltip,
  label = "Value",
}: FlowAreaChartProps) {
  const fmt = formatTooltip ?? formatY;
  const gradId = `flow-area-${color.replace("#", "")}`;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={(v: string | number) => String(v).slice(5)}
            interval="preserveStartEnd"
            minTickGap={50}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={formatY}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            cursor={{ stroke: color, strokeOpacity: 0.3, strokeDasharray: "2 2" }}
            contentStyle={{
              background: "#0d111d",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
              color: "#f2f4f8",
            }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(v: number) => [fmt(v), label]}
          />
          <Area type="monotone" dataKey="value" stroke={color} strokeWidth={1.75} fill={`url(#${gradId})`} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface FlowBarPoint {
  date: string;
  value: number;
  cumulative?: number;
}

export interface FlowBarChartProps {
  data: FlowBarPoint[];
  height?: number;
  /** Bar color when value >= 0. */
  upColor?: string;
  /** Bar color when value < 0. */
  downColor?: string;
  formatY?: (n: number) => string;
}

/**
 * Per-day flow bars (positive/negative) with optional cumulative line — used for ETF flows.
 */
export function FlowBarChart({
  data,
  height = 280,
  upColor = "#34d399",
  downColor = "#f87171",
  formatY = defaultFmt,
}: FlowBarChartProps) {
  const hasCumulative = data.some((d) => d.cumulative !== undefined);
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="date"
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={(v: string | number) => String(v).slice(5)}
            interval="preserveStartEnd"
            minTickGap={40}
            axisLine={false}
            tickLine={false}
          />
          <YAxis stroke={AXIS} tick={{ fill: AXIS, fontSize: 10 }} tickFormatter={formatY} axisLine={false} tickLine={false} />
          {hasCumulative && (
            <YAxis
              yAxisId="cum"
              orientation="right"
              stroke={AXIS}
              tick={{ fill: AXIS, fontSize: 10 }}
              tickFormatter={formatY}
              axisLine={false}
              tickLine={false}
            />
          )}
          <Tooltip
            contentStyle={{
              background: "#0d111d",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
              color: "#f2f4f8",
            }}
            labelStyle={{ color: "#9ca3af" }}
            formatter={(v: number, name: string) => [formatY(v), name === "value" ? "Daily" : "Cumulative"]}
          />
          <Bar dataKey="value" radius={[2, 2, 0, 0]} isAnimationActive={false}>
            {data.map((d, i) => (
              <Cell key={`b-${i}`} fill={d.value >= 0 ? upColor : downColor} />
            ))}
          </Bar>
          {hasCumulative && (
            <Line
              yAxisId="cum"
              type="monotone"
              dataKey="cumulative"
              stroke="#7c5cff"
              strokeWidth={1.5}
              dot={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
