"use client";

import * as React from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface IVPoint {
  strike: number;
  /** IV in percent (e.g. 65 means 65%). */
  iv: number;
  side?: "call" | "put";
}

export interface IVSmileProps {
  data: IVPoint[];
  /** Current spot/index price — drawn as vertical reference line if provided. */
  spot?: number;
  /** Split call/put into two lines. Defaults to true when sides are present. */
  splitSides?: boolean;
  /** User-selected strike — drawn as a brighter vertical reference line. */
  selectedStrike?: number;
  /** Side of the user-selected option. */
  selectedSide?: "call" | "put";
  height?: number;
  callColor?: string;
  putColor?: string;
}

const AXIS = "rgba(255,255,255,0.35)";
const GRID = "rgba(255,255,255,0.05)";

const fmtIv = (n: number) => `${n.toFixed(0)}%`;
const fmtStrike = (n: number) => {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toFixed(0);
};

/**
 * IV smile / skew curve. Strike on x-axis, IV (%) on y-axis.
 * If `splitSides` is true (or sides present in data), renders calls + puts as separate lines.
 *
 * Designed for the Options page "IV SMILE" panel.
 */
export function IVSmile({
  data,
  spot,
  splitSides,
  selectedStrike,
  selectedSide,
  height = 280,
  callColor = "#41ff8b",
  putColor = "#ff3355",
}: IVSmileProps) {
  const hasSides = data.some((p) => p.side === "call" || p.side === "put");
  const split = splitSides ?? hasSides;

  // When splitting, pivot to wide format: { strike, callIv?, putIv? }
  const rendered = React.useMemo(() => {
    if (!split) {
      return [...data].sort((a, b) => a.strike - b.strike);
    }
    const byStrike = new Map<number, { strike: number; callIv?: number; putIv?: number }>();
    for (const p of data) {
      const existing = byStrike.get(p.strike) ?? { strike: p.strike };
      if (p.side === "put") existing.putIv = p.iv;
      else existing.callIv = p.iv;
      byStrike.set(p.strike, existing);
    }
    return [...byStrike.values()].sort((a, b) => a.strike - b.strike);
  }, [data, split]);

  if (rendered.length === 0) {
    return (
      <div style={{ width: "100%", height, display: "grid", placeItems: "center", color: AXIS, fontSize: 12 }}>
        No IV data
      </div>
    );
  }

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <LineChart data={rendered} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="2 4" vertical={false} />
          <XAxis
            dataKey="strike"
            type="number"
            domain={["dataMin", "dataMax"]}
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={fmtStrike}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            stroke={AXIS}
            tick={{ fill: AXIS, fontSize: 10 }}
            tickFormatter={fmtIv}
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
            labelFormatter={(v) => `Strike ${fmtStrike(Number(v))}`}
            formatter={(v: number) => fmtIv(v)}
          />
          {spot !== undefined && (
            <ReferenceLine
              x={spot}
              stroke="#ffb340"
              strokeDasharray="3 3"
              label={{ value: "ATM", fill: "#ffb340", fontSize: 10, position: "top" }}
            />
          )}
          {selectedStrike !== undefined && (
            <ReferenceLine
              x={selectedStrike}
              stroke={selectedSide === "put" ? putColor : callColor}
              strokeWidth={1.5}
              label={{
                value: `K ${selectedStrike}`,
                fill: selectedSide === "put" ? putColor : callColor,
                fontSize: 10,
                position: "insideTopLeft",
              }}
            />
          )}
          {split ? (
            <>
              <Line
                type="monotone"
                dataKey="callIv"
                name="Call"
                stroke={callColor}
                strokeWidth={1.75}
                dot={{ r: 2.5, fill: callColor, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="putIv"
                name="Put"
                stroke={putColor}
                strokeWidth={1.75}
                dot={{ r: 2.5, fill: putColor, strokeWidth: 0 }}
                connectNulls
                isAnimationActive={false}
              />
              <Legend wrapperStyle={{ fontSize: 10, color: AXIS }} />
            </>
          ) : (
            <Line
              type="monotone"
              dataKey="iv"
              name="IV"
              stroke={callColor}
              strokeWidth={1.75}
              dot={{ r: 2.5, fill: callColor, strokeWidth: 0 }}
              isAnimationActive={false}
            />
          )}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
