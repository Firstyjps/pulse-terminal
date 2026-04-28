"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface FundingPoint {
  /** ISO timestamp or epoch ms — used as x-axis label. */
  ts: string | number;
  /** APR in percent (e.g. 12.5 means 12.5% APR). */
  apr: number;
}

export interface FundingHistoryProps {
  data: FundingPoint[];
  height?: number;
  /** Threshold APR to highlight (e.g. 10 to mark "decent" entry). */
  threshold?: number;
  /** Stroke color. Defaults to phosphor green. */
  color?: string;
  /** Optional label for tooltip. Default: "APR". */
  label?: string;
}

const AXIS = "rgba(255,255,255,0.35)";
const GRID = "rgba(255,255,255,0.05)";

const fmtApr = (n: number) => `${n.toFixed(1)}%`;
const fmtTs = (v: string | number) => {
  if (typeof v === "number") {
    const d = new Date(v);
    return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${String(d.getUTCHours()).padStart(2, "0")}:00`;
  }
  return String(v).slice(5, 16).replace("T", " ");
};

/**
 * APR history as time-series area chart. Designed for Bybit dual-asset APR
 * data: hourly snapshots of APR for a given (coin_pair, target_price) pair.
 *
 * Renders an optional `threshold` line so users see at a glance which hours
 * crossed their entry bar.
 */
export function FundingHistory({
  data,
  height = 220,
  threshold,
  color = "#41ff8b",
  label = "APR",
}: FundingHistoryProps) {
  if (data.length === 0) {
    return (
      <div style={{ width: "100%", height, display: "grid", placeItems: "center", color: AXIS, fontSize: 12 }}>
        No APR history
      </div>
    );
  }
  const gradId = `funding-fill-${color.replace("#", "")}`;
  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="ts"
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={fmtTs}
            interval="preserveStartEnd"
            minTickGap={48}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={fmtApr}
            axisLine={false}
            tickLine={false}
            width={48}
          />
          <Tooltip
            contentStyle={{
              background: "#070a13",
              border: "1px solid rgba(255,255,255,0.13)",
              borderRadius: 3,
              fontSize: 11,
            }}
            labelFormatter={(v) => fmtTs(v as string | number)}
            formatter={(v: number) => [fmtApr(v), label]}
          />
          {threshold !== undefined && (
            <ReferenceLine
              y={threshold}
              stroke="#ffb340"
              strokeDasharray="3 3"
              label={{ value: fmtApr(threshold), fill: "#ffb340", fontSize: 10, position: "right" }}
            />
          )}
          <Area
            type="monotone"
            dataKey="apr"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
