"use client";

import * as React from "react";
import {
  createChart,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  LineStyle,
} from "lightweight-charts";
import { colors, withAlpha } from "@pulse/ui";

export interface PriceLinePoint {
  time: number; // unix seconds
  value: number; // close price
  volume?: number;
}

export interface PriceLineProps {
  data: PriceLinePoint[];
  height?: number;
  /** Symbol label rendered above the chart. */
  symbol?: string;
  /** Stroke color. Defaults to amber. */
  color?: string;
  /** Render a volume histogram pinned to the bottom. */
  showVolume?: boolean;
  /** Render a translucent area fill below the line for visual weight. */
  filled?: boolean;
  /** Render a horizontal price-line marker at the latest close. */
  showLastMarker?: boolean;
}

/**
 * Line/area price chart — Lightweight Charts v4.2 wrapper. Same v4-pinning
 * constraint as Candlestick (v5 removed addAreaSeries / addLineSeries APIs).
 *
 * The series is rendered as an Area series with a translucent fill so the
 * shape reads at a glance, and a thicker top stroke for the actual line. A
 * tiny histogram is overlaid for volume (auto-colored by close-vs-open
 * direction relative to the previous close).
 */
export function PriceLine({
  data,
  height = 360,
  symbol,
  color = colors.amber,
  showVolume = true,
  filled = true,
  showLastMarker = true,
}: PriceLineProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const chartRef = React.useRef<IChartApi | null>(null);
  const lineRef = React.useRef<ISeriesApi<"Area"> | ISeriesApi<"Line"> | null>(null);
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
        fontSize: 11,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.08)",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.08)",
        scaleMargins: { top: 0.08, bottom: showVolume ? 0.22 : 0.04 },
      },
      crosshair: {
        mode: 1,
        vertLine: {
          color: withAlpha(colors.amber, 0.4),
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: colors.amber,
        },
        horzLine: {
          color: withAlpha(colors.amber, 0.4),
          style: LineStyle.Dashed,
          width: 1,
          labelBackgroundColor: colors.amber,
        },
      },
    });

    const line = filled
      ? chart.addAreaSeries({
          lineColor: color,
          lineWidth: 2,
          topColor: withAlpha(color, 0.32),
          bottomColor: withAlpha(color, 0.02),
          priceLineVisible: showLastMarker,
          priceLineColor: color,
          priceLineWidth: 1,
          priceLineStyle: LineStyle.Dashed,
          lastValueVisible: true,
        })
      : chart.addLineSeries({
          color,
          lineWidth: 2,
          priceLineVisible: showLastMarker,
          priceLineColor: color,
          priceLineWidth: 1,
          priceLineStyle: LineStyle.Dashed,
          lastValueVisible: true,
        });

    let vol: ISeriesApi<"Histogram"> | null = null;
    if (showVolume) {
      vol = chart.addHistogramSeries({
        priceFormat: { type: "volume" },
        priceScaleId: "vol",
        color: withAlpha(color, 0.35),
      });
      chart.priceScale("vol").applyOptions({
        scaleMargins: { top: 0.82, bottom: 0 },
      });
    }

    chartRef.current = chart;
    lineRef.current = line;
    volRef.current = vol;

    const ro = new ResizeObserver(() => {
      if (el.clientWidth > 0) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      lineRef.current = null;
      volRef.current = null;
    };
  }, [height, color, filled, showVolume, showLastMarker]);

  React.useEffect(() => {
    if (!lineRef.current) return;
    const lineData = data.map((d) => ({
      time: d.time as UTCTimestamp,
      value: d.value,
    }));
    lineRef.current.setData(lineData);

    if (volRef.current) {
      volRef.current.setData(
        data.map((d, i) => {
          const prev = i > 0 ? data[i - 1].value : d.value;
          const up = d.value >= prev;
          return {
            time: d.time as UTCTimestamp,
            value: d.volume ?? 0,
            color: up ? withAlpha(colors.green, 0.45) : withAlpha(colors.red, 0.45),
          };
        }),
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

