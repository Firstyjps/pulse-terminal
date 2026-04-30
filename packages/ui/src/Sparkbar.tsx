import * as React from "react";

export interface SparkbarProps {
  data: number[];
  bars?: number;
  width?: number;
  height?: number;
  /** Direction → color override. If undefined: derived from first→last delta. */
  positive?: boolean;
  /** Solid color override. */
  color?: string;
  /** Render as smooth line + area fill instead of bars (handoff "sparkline" mode). */
  asLine?: boolean;
  /** Add area fill under the line. */
  fill?: boolean;
  /** Inline style override for the root <svg> — useful for CSS sizing (e.g. `width: "100%"`). */
  style?: React.CSSProperties;
}

/**
 * Sparkbar — Bloomberg-style mini chart.
 *
 *   - Default: discrete vertical bars, last bar full opacity
 *   - asLine=true: smooth polyline (handoff Sparkline shape)
 *
 * Pure SVG, scales to container via preserveAspectRatio="none".
 */
export function Sparkbar({
  data,
  bars = 16,
  width = 80,
  height = 22,
  positive,
  color,
  asLine = false,
  fill = false,
  style,
}: SparkbarProps) {
  if (!data || data.length < 2) {
    return <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} style={style} aria-hidden />;
  }

  // Downsample for bar mode
  const sample: number[] = asLine ? data : (() => {
    const out: number[] = [];
    if (data.length <= bars) return data;
    const step = data.length / bars;
    for (let i = 0; i < bars; i++) out.push(data[Math.floor(i * step)]);
    return out;
  })();

  const min = Math.min(...sample);
  const max = Math.max(...sample);
  const range = max - min || 1;

  const isUp = positive ?? sample[sample.length - 1] >= sample[0];
  const stroke = color ?? (isUp ? "#19d27a" : "#ff4d5e");

  if (asLine) {
    // handoff Sparkline shape — polyline + optional area fill
    const W = 100;
    const H = height;
    const pts = sample.map((v, i) => {
      const x = (i / (sample.length - 1)) * W;
      const y = H - ((v - min) / range) * H;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    });
    const d = "M " + pts.join(" L ");
    const dFill = d + ` L ${W},${H} L 0,${H} Z`;
    return (
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        width={width}
        height={height}
        style={{ display: "block", width: "100%", ...style }}
        aria-hidden
      >
        {fill && <path d={dFill} fill={stroke} opacity={0.12} />}
        <path d={d} fill="none" stroke={stroke} strokeWidth={1} vectorEffect="non-scaling-stroke" />
      </svg>
    );
  }

  // Bar mode
  const gap = 1;
  const w = (width - gap * (sample.length - 1)) / sample.length;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      style={{ display: "block", overflow: "visible", ...style }}
      aria-hidden
    >
      {sample.map((v, i) => {
        const norm = (v - min) / range;
        const h = Math.max(1, norm * (height - 2));
        const x = i * (w + gap);
        const y = height - h;
        const isLast = i === sample.length - 1;
        return (
          <rect
            key={i}
            x={x}
            y={y}
            width={w}
            height={h}
            fill={stroke}
            opacity={isLast ? 1 : 0.45 + (i / sample.length) * 0.45}
          />
        );
      })}
    </svg>
  );
}
