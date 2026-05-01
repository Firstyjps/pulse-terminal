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

export interface DepthLevel {
  /** Price level. */
  price: number;
  /** Size at that level (base currency, e.g. BTC). */
  size: number;
}

export interface DepthChartProps {
  /** Bid side, ascending price (best bid last is fine — we sort). */
  bids: DepthLevel[];
  /** Ask side, ascending price. */
  asks: DepthLevel[];
  height?: number;
  /** Limit each side to N levels closest to mid (default 50). */
  depth?: number;
  bidColor?: string;
  askColor?: string;
}

interface MergedPoint {
  price: number;
  bidsCum?: number;
  asksCum?: number;
}

export function DepthChart({
  bids,
  asks,
  height = 260,
  depth = 50,
  bidColor = colors.green,
  askColor = colors.red,
}: DepthChartProps) {
  const data = React.useMemo<MergedPoint[]>(() => {
    if (!bids.length && !asks.length) return [];

    // bids: descending from mid, accumulate from best (highest price) outward
    const bidsSorted = [...bids].sort((a, b) => b.price - a.price).slice(0, depth);
    let bidCum = 0;
    const bidPts = bidsSorted.map((b) => ({ price: b.price, bidsCum: (bidCum += b.size) }));
    bidPts.reverse(); // oldest (lowest price) → newest (highest near mid)

    // asks: ascending from mid, accumulate from best (lowest price) outward
    const asksSorted = [...asks].sort((a, b) => a.price - b.price).slice(0, depth);
    let askCum = 0;
    const askPts = asksSorted.map((a) => ({ price: a.price, asksCum: (askCum += a.size) }));

    return [...bidPts, ...askPts];
  }, [bids, asks, depth]);

  if (!data.length) {
    return (
      <div
        style={{
          height,
          display: "grid",
          placeItems: "center",
          color: colors.txt3,
          fontSize: 12,
          fontFamily: fonts.mono,
        }}
      >
        no order book data
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={colors.gridFaint} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="price"
            type="number"
            domain={["dataMin", "dataMax"]}
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            tickFormatter={(v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(2)
            }
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke={colors.axis}
            tick={{ fill: colors.axis, fontSize: 10 }}
            axisLine={false}
            tickLine={false}
          />
          <Tooltip
            contentStyle={{
              background: "#0d111d",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
              color: colors.txt1,
            }}
            labelStyle={{ color: colors.txt3 }}
            formatter={(v: number, name: string) => [v.toFixed(4), name === "bidsCum" ? "Bids" : "Asks"]}
            labelFormatter={(v: number) => `Price ${v.toFixed(2)}`}
          />
          <Area
            type="step"
            dataKey="bidsCum"
            stroke={bidColor}
            strokeWidth={1.5}
            fill={bidColor}
            fillOpacity={0.18}
            isAnimationActive={false}
            connectNulls={false}
          />
          <Area
            type="step"
            dataKey="asksCum"
            stroke={askColor}
            strokeWidth={1.5}
            fill={askColor}
            fillOpacity={0.18}
            isAnimationActive={false}
            connectNulls={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
