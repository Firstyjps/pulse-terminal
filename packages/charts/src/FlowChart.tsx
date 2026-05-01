"use client";

import * as React from "react";
import { colors } from "@pulse/ui";
import { FlowAreaChart, FlowBarChart, type FlowBarPoint, type FlowPoint } from "./FlowAreaChart";

export type FlowChartType = "stablecoin" | "etf" | "tvl" | "dex";

export interface FlowChartProps {
  type: FlowChartType;
  /** Area-style data (stablecoin / tvl / dex). */
  data?: FlowPoint[];
  /** Bar-style data with optional cumulative line (etf). */
  bars?: FlowBarPoint[];
  height?: number;
}

const PRESETS: Record<FlowChartType, { color: string; label: string }> = {
  stablecoin: { color: colors.cyan, label: "Stablecoin Supply" },
  etf: { color: colors.magenta, label: "ETF Net Flow" },
  tvl: { color: colors.green, label: "Total Value Locked" },
  dex: { color: colors.orange, label: "DEX Volume" },
};

/**
 * Typed wrapper around the underlying flow charts. ETF uses bars (positive/negative
 * with optional cumulative line); the rest use the area chart.
 */
export function FlowChart({ type, data = [], bars = [], height = 280 }: FlowChartProps) {
  const preset = PRESETS[type];

  if (type === "etf") {
    return <FlowBarChart data={bars} height={height} />;
  }

  return <FlowAreaChart data={data} color={preset.color} label={preset.label} height={height} />;
}
