"use client";

import * as React from "react";

export type Greek = "delta" | "gamma" | "theta" | "vega";

export interface GreeksRow {
  strike: number;
  side: "call" | "put";
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
}

export interface GreeksHeatmapProps {
  data: GreeksRow[];
  /** Greeks to render as columns. Default: all four. */
  greeks?: Greek[];
  /** Current spot price — highlights nearest strike row. */
  spot?: number;
  /** Filter to one side. Default: show both, side appears in row label. */
  side?: "call" | "put" | "both";
  /** Cell height in px. Default: 24. */
  rowHeight?: number;
  /** Format numeric cell. Default: 3 sig figs. */
  format?: (n: number, greek: Greek) => string;
}

const fmtDefault: Required<GreeksHeatmapProps>["format"] = (n) => {
  if (Math.abs(n) >= 100) return n.toFixed(0);
  if (Math.abs(n) >= 10) return n.toFixed(1);
  if (Math.abs(n) >= 1) return n.toFixed(2);
  return n.toFixed(3);
};

const fmtStrike = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toFixed(0));

/** Map a value in [-1, 1] (after normalization) to an rgba color from red→neutral→green. */
function colorFor(value: number, max: number): string {
  if (max === 0 || !Number.isFinite(value)) return "rgba(255,255,255,0.04)";
  const norm = Math.max(-1, Math.min(1, value / max));
  const intensity = Math.abs(norm) * 0.85;
  if (norm >= 0) {
    return `rgba(65,255,139,${intensity.toFixed(3)})`;
  }
  return `rgba(255,51,85,${intensity.toFixed(3)})`;
}

/**
 * Greeks heatmap — strike rows × greek columns. Color-coded by sign + magnitude
 * so positive (long-friendly) greeks glow green, negative glow red. Spot row highlighted.
 *
 * Pure CSS grid — no chart library overhead. Designed for option-dashboard "GREEKS" tab.
 */
export function GreeksHeatmap({
  data,
  greeks = ["delta", "gamma", "theta", "vega"],
  spot,
  side = "both",
  rowHeight = 24,
  format = fmtDefault,
}: GreeksHeatmapProps) {
  const rows = React.useMemo(() => {
    const filtered = side === "both" ? data : data.filter((r) => r.side === side);
    return [...filtered].sort((a, b) => a.strike - b.strike || a.side.localeCompare(b.side));
  }, [data, side]);

  const maxes = React.useMemo(() => {
    const m: Record<Greek, number> = { delta: 0, gamma: 0, theta: 0, vega: 0 };
    for (const r of rows) {
      for (const g of greeks) {
        const v = Math.abs(r[g]);
        if (v > m[g]) m[g] = v;
      }
    }
    return m;
  }, [rows, greeks]);

  const spotRowKey = React.useMemo(() => {
    if (spot === undefined || rows.length === 0) return null;
    let nearest = rows[0];
    let bestDiff = Math.abs(rows[0].strike - spot);
    for (const r of rows) {
      const d = Math.abs(r.strike - spot);
      if (d < bestDiff) {
        nearest = r;
        bestDiff = d;
      }
    }
    return `${nearest.strike}-${nearest.side}`;
  }, [rows, spot]);

  if (rows.length === 0) {
    return (
      <div style={{ padding: 24, color: "rgba(255,255,255,0.35)", fontSize: 12, textAlign: "center" }}>
        No Greeks data
      </div>
    );
  }

  const cols = side === "both" ? ["strike", "side", ...greeks] : ["strike", ...greeks];
  const gridTemplate =
    side === "both"
      ? `64px 44px ${greeks.map(() => "minmax(56px, 1fr)").join(" ")}`
      : `64px ${greeks.map(() => "minmax(56px, 1fr)").join(" ")}`;

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: gridTemplate,
        fontFamily: "'JetBrains Mono', 'Courier New', monospace",
        fontSize: 11,
      }}
    >
      {/* Header */}
      {cols.map((c) => (
        <div
          key={`h-${c}`}
          style={{
            padding: "6px 8px",
            color: "rgba(255,255,255,0.5)",
            borderBottom: "1px solid rgba(255,255,255,0.13)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            fontSize: 10,
          }}
        >
          {c}
        </div>
      ))}

      {/* Body */}
      {rows.map((r) => {
        const isSpot = spotRowKey === `${r.strike}-${r.side}`;
        const baseRowStyle: React.CSSProperties = {
          height: rowHeight,
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          background: isSpot ? "rgba(255,179,64,0.08)" : "transparent",
        };
        return (
          <React.Fragment key={`${r.strike}-${r.side}`}>
            <div style={{ ...baseRowStyle, color: "rgba(240,243,249,0.95)" }}>{fmtStrike(r.strike)}</div>
            {side === "both" && (
              <div
                style={{
                  ...baseRowStyle,
                  color: r.side === "call" ? "#41ff8b" : "#ff3355",
                  fontSize: 10,
                  textTransform: "uppercase",
                }}
              >
                {r.side}
              </div>
            )}
            {greeks.map((g) => (
              <div
                key={`${r.strike}-${r.side}-${g}`}
                title={`${g} = ${r[g]}`}
                style={{
                  ...baseRowStyle,
                  background: isSpot
                    ? "rgba(255,179,64,0.08)"
                    : colorFor(r[g], maxes[g]),
                  color: "rgba(240,243,249,0.95)",
                  justifyContent: "flex-end",
                }}
              >
                {format(r[g], g)}
              </div>
            ))}
          </React.Fragment>
        );
      })}
    </div>
  );
}
