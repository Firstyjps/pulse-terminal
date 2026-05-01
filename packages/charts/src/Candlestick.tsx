"use client";

import * as React from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { colors, withAlpha } from "@pulse/ui";

export interface Candle {
  time: number; // unix seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface CandlestickProps {
  data: Candle[];
  height?: number;
  /** Symbol label rendered above the chart. */
  symbol?: string;
  showVolume?: boolean;
}

/**
 * Lightweight Charts v4.2 wrapper. v5 removed addCandlestickSeries / addHistogramSeries —
 * keep this pinned. Resize is handled via ResizeObserver.
 */
export function Candlestick({
  data,
  height = 360,
  symbol,
  showVolume = true,
}: CandlestickProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const candleRef = React.useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volRef = React.useRef<ISeriesApi<"Histogram"> | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      width: el.clientWidth,
      height,
      layout: {
        background: { color: "transparent" },
        textColor: "#9ca3af",
        fontFamily: "JetBrains Mono, Courier New, monospace",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
      crosshair: { mode: 1 },
    });

    const candle = chart.addCandlestickSeries({
      upColor: colors.green,
      downColor: colors.red,
      wickUpColor: colors.green,
      wickDownColor: colors.red,
      borderVisible: false,
    });

    let vol: ISeriesApi<"Histogram"> | null = null;
    if (showVolume) {
      vol = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        color: withAlpha(colors.amber, 0.5),
      });
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.78, bottom: 0 },
      });
    }

    chartRef.current = chart;
    candleRef.current = candle;
    volRef.current = vol;

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      volRef.current = null;
    };
  }, [height, showVolume]);

  React.useEffect(() => {
    if (!candleRef.current) return;
    const candleData = data.map((d) => ({
      time: d.time as UTCTimestamp,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));
    candleRef.current.setData(candleData);

    if (volRef.current) {
      volRef.current.setData(
        data.map((d) => ({
          time: d.time as UTCTimestamp,
          value: d.volume ?? 0,
          color: d.close >= d.open ? withAlpha(colors.green, 0.5) : withAlpha(colors.red, 0.5),
        })),
      );
    }
    requestAnimationFrame(() => chartRef.current?.timeScale().fitContent());
  }, [data]);

  return (
    <div>
      {symbol && (
        <div style={{ fontSize: 12, color: "#9ca3af", marginBottom: 8, fontFamily: "JetBrains Mono, monospace" }}>
          {symbol}
        </div>
      )}
      <div ref={containerRef} style={{ width: "100%", height, display: "block" }} />
    </div>
  );
}
