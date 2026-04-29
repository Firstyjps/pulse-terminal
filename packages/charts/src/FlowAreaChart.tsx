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
            content={({ active, payload, label: tipLabel }) => {
              if (!active || !payload || !payload.length) return null;
              const v = (payload[0]?.value as number) ?? 0;
              const dateStr =
                typeof tipLabel === "string" && /^\d{4}-\d{2}-\d{2}$/.test(tipLabel)
                  ? new Date(tipLabel).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : String(tipLabel ?? "");
              return (
                <div
                  style={{
                    background: "#0a0d14",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 4,
                    padding: "8px 12px",
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11,
                    minWidth: 140,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                  }}
                >
                  <div
                    style={{
                      color: "#a0a0a0",
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      paddingBottom: 6,
                      marginBottom: 6,
                      borderBottom: "1px dashed rgba(255,255,255,0.08)",
                    }}
                  >
                    {dateStr}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                    <span style={{ color: "#7d8a99", textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</span>
                    <span style={{ color: color, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{fmt(v)}</span>
                  </div>
                </div>
              );
            }}
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
  /** Tooltip label for the cumulative line. Default "CUM". */
  cumulativeLabel?: string;
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
  cumulativeLabel = "CUM",
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
              // Tight auto-domain — let recharts pick min/max from the visible
              // window rather than padding from $0. Makes the cumulative line
              // expressive when the series is a delta or oscillates near zero.
              domain={["auto", "auto"]}
            />
          )}
          <Tooltip
            content={({ active, payload, label }) => {
              if (!active || !payload || !payload.length) return null;
              const dailyEntry = payload.find((p) => p.dataKey === "value");
              const cumEntry = payload.find((p) => p.dataKey === "cumulative");
              const daily = (dailyEntry?.value as number) ?? 0;
              const cumulative = cumEntry?.value as number | undefined;

              const formatSigned = (n: number) =>
                (n >= 0 ? "+" : "−") + formatY(Math.abs(n));
              const dailyColor = daily >= 0 ? upColor : downColor;

              const dateStr =
                typeof label === "string" && /^\d{4}-\d{2}-\d{2}$/.test(label)
                  ? new Date(label).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })
                  : String(label ?? "");

              return (
                <div
                  style={{
                    background: "#0a0d14",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 4,
                    padding: "8px 12px",
                    fontFamily: "'JetBrains Mono', ui-monospace, monospace",
                    fontSize: 11,
                    minWidth: 160,
                    boxShadow: "0 4px 16px rgba(0,0,0,0.6)",
                  }}
                >
                  <div
                    style={{
                      color: "#a0a0a0",
                      fontSize: 10,
                      letterSpacing: "0.06em",
                      textTransform: "uppercase",
                      paddingBottom: 6,
                      marginBottom: 6,
                      borderBottom: "1px dashed rgba(255,255,255,0.08)",
                    }}
                  >
                    {dateStr}
                  </div>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
                    <span style={{ color: "#7d8a99" }}>DAILY</span>
                    <span style={{ color: dailyColor, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                      {formatSigned(daily)}
                    </span>
                  </div>
                  {cumulative !== undefined && (
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                      <span style={{ color: "#7d8a99" }}>{cumulativeLabel}</span>
                      <span style={{ color: "#c8d1dc", fontWeight: 500, fontVariantNumeric: "tabular-nums" }}>
                        {formatY(cumulative)}
                      </span>
                    </div>
                  )}
                </div>
              );
            }}
            cursor={{ fill: "rgba(255,176,0,0.06)" }}
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
