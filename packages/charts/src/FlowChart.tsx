"use client";

import * as React from "react";
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
  stablecoin: { color: "#22d3ee", label: "Stablecoin Supply" },
  etf: { color: "#7c5cff", label: "ETF Net Flow" },
  tvl: { color: "#34d399", label: "Total Value Locked" },
  dex: { color: "#fb923c", label: "DEX Volume" },
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
