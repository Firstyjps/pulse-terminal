"use client";

import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { colors, fonts } from "@pulse/ui";

export interface PortfolioSnapshot {
  /** Epoch ms or ISO timestamp string. */
  ts: number | string;
  /** Total portfolio value in USD at that snapshot. */
  totalUsd: number;
}

export interface PortfolioTrendProps {
  snapshots: PortfolioSnapshot[];
  height?: number;
}

const DAY_MS = 86_400_000;
const WINDOW_DAYS = 30;

const fmtUsd = (n: number): string => {
  const abs = Math.abs(n);
  const sign = n < 0 ? "−" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(1)}K`;
  return `${sign}$${abs.toFixed(0)}`;
};

const fmtDate = (v: number | string): string => {
  const d = typeof v === "number" ? new Date(v) : new Date(v);
  if (Number.isNaN(d.getTime())) return String(v);
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
};

/**
 * Total portfolio USD over the trailing 30-day window. Filters input on the
 * fly so callers can pass full history. Color is sign-driven (green if the
 * window ends higher than it started, red otherwise) to match
 * <PortfolioSparkline>.
 */
export function PortfolioTrend({ snapshots, height = 200 }: PortfolioTrendProps) {
  const data = React.useMemo(() => {
    if (!snapshots || snapshots.length === 0) return [];
    const norm = snapshots
      .map((s) => ({
        tsMs: typeof s.ts === "number" ? s.ts : new Date(s.ts).getTime(),
        totalUsd: s.totalUsd,
      }))
      .filter((s) => Number.isFinite(s.tsMs) && Number.isFinite(s.totalUsd))
      .sort((a, b) => a.tsMs - b.tsMs);
    if (norm.length === 0) return [];
    const cutoff = norm[norm.length - 1].tsMs - WINDOW_DAYS * DAY_MS;
    return norm.filter((s) => s.tsMs >= cutoff);
  }, [snapshots]);

  if (data.length < 2) {
    return (
      <div
        style={{
          width: "100%",
          height,
          display: "grid",
          placeItems: "center",
          color: colors.axis,
          fontFamily: fonts.mono,
          fontSize: 11,
        }}
      >
        No portfolio history
      </div>
    );
  }

  const positive = data[data.length - 1].totalUsd >= data[0].totalUsd;
  const stroke = positive ? colors.green : colors.red;
  const gradId = `portfolio-trend-${positive ? "up" : "down"}`;

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity={0.35} />
              <stop offset="100%" stopColor={stroke} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={colors.gridFaint} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="tsMs"
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            tickFormatter={fmtDate}
            interval="preserveStartEnd"
            minTickGap={48}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            tickFormatter={fmtUsd}
            axisLine={false}
            tickLine={false}
            width={56}
            domain={["dataMin", "dataMax"]}
          />
          <Tooltip
            contentStyle={{
              background: colors.bg1,
              border: `1px solid ${colors.line}`,
              borderRadius: 0,
              fontFamily: fonts.mono,
              fontSize: 11,
              color: colors.txt2,
            }}
            labelFormatter={(v) => fmtDate(v as number)}
            formatter={(v: number) => [fmtUsd(v), "Total"]}
          />
          <Area
            type="monotone"
            dataKey="totalUsd"
            stroke={stroke}
            strokeWidth={1.5}
            fill={`url(#${gradId})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
