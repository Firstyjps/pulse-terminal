"use client";

import { useMemo, useState } from "react";
import { colors, fonts } from "@pulse/ui";
import { useFlow } from "../lib/use-flow";
import { useIsMobile } from "../lib/use-media";
import { Skeleton } from "./Skeleton";

interface FundingRate {
  exchange: string;
  symbol: string;
  rate: number;
  ratePercent: number;
  nextFundingTime?: number;
  ts: number;
}

interface ApiResp {
  rates: FundingRate[];
  ts: number;
}

const EXCHANGES = ["binance", "bybit", "okx", "deribit"] as const;
type Exchange = (typeof EXCHANGES)[number];

const EX_LABEL: Record<Exchange, string> = {
  binance: "BIN",
  bybit: "BYB",
  okx: "OKX",
  deribit: "DRBT",
};

type ViewMode = "compact" | "matrix";

interface SymRow {
  symbol: string;
  cells: Record<Exchange, FundingRate | null>;
  present: number;
  avg: number;
  spread: number;
}

function normalizeSymbol(s: string): string {
  // OKX: BTC-USDT-SWAP → BTC; Deribit: BTC-PERPETUAL → BTC
  return s
    .replace(/-USDT-SWAP$/i, "")
    .replace(/-PERPETUAL$/i, "")
    .replace(/USDT$/i, "")
    .replace(/USD$/i, "")
    .toUpperCase();
}

/** Saturation 0..1 → bg color string (signed) */
function bgFor(pct: number, intensity: number): string {
  // Wider range: saturate at ±0.05% (handoff used ±0.1, but most rates cluster < 0.05)
  const alpha = 0.06 + intensity * 0.6;
  if (pct >= 0) return `rgba(255, 77, 94, ${alpha})`; // red — overheated long
  return `rgba(25, 210, 122, ${alpha})`;              // green — overheated short
}

/** Foreground text color picks contrast vs cell saturation */
function fgFor(intensity: number): string {
  return intensity > 0.55 ? "#ffffff" : colors.txt2;
}

/**
 * FundingHeatmap — redesigned (round-3) per user feedback "hard to read, cells all look the same".
 *
 * Two view modes:
 *   COMPACT — top hot longs (top half) + top hot shorts (bottom half).
 *             24px rows, sticky header + sticky first col, color saturation
 *             scaled to magnitude, hover tooltip with absolute % + next
 *             funding time.
 *   MATRIX  — all symbols flat, sortable by average funding desc/asc, same
 *             cell language but no grouping.
 *
 * Endpoint: /api/funding (Code's adapter aggregates 4 venues — bin/byb/okx/drbt).
 */
export function FundingHeatmap() {
  const { data, loading, error } = useFlow<ApiResp>("/api/funding");
  const [mode, setMode] = useState<ViewMode>("compact");
  const [hover, setHover] = useState<{ row: string; ex: Exchange; rate: FundingRate; x: number; y: number } | null>(null);
  const isMobile = useIsMobile();

  const allRows = useMemo<SymRow[]>(() => {
    if (!data?.rates) return [];
    const map = new Map<string, Map<Exchange, FundingRate>>();
    for (const r of data.rates) {
      const sym = normalizeSymbol(r.symbol);
      const exKey = r.exchange.toLowerCase();
      if (!EXCHANGES.includes(exKey as Exchange)) continue;
      if (!map.has(sym)) map.set(sym, new Map());
      map.get(sym)!.set(exKey as Exchange, r);
    }
    return Array.from(map.entries())
      .map<SymRow>(([symbol, byExch]) => {
        const cells: Record<Exchange, FundingRate | null> = {
          binance: byExch.get("binance") ?? null,
          bybit: byExch.get("bybit") ?? null,
          okx: byExch.get("okx") ?? null,
          deribit: byExch.get("deribit") ?? null,
        };
        const present = (Object.values(cells).filter(Boolean) as FundingRate[]);
        const avg = present.length ? present.reduce((s, c) => s + c.ratePercent, 0) / present.length : 0;
        const min = present.length ? Math.min(...present.map((c) => c.ratePercent)) : 0;
        const max = present.length ? Math.max(...present.map((c) => c.ratePercent)) : 0;
        return {
          symbol,
          cells,
          present: present.length,
          avg,
          spread: max - min,
        };
      })
      .filter((r) => r.present >= 2);
  }, [data]);

  const longs = useMemo(
    () => allRows.filter((r) => r.avg >= 0).sort((a, b) => b.avg - a.avg).slice(0, 12),
    [allRows],
  );
  const shorts = useMemo(
    () => allRows.filter((r) => r.avg < 0).sort((a, b) => a.avg - b.avg).slice(0, 12),
    [allRows],
  );
  const flat = useMemo(
    () => [...allRows].sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg)).slice(0, 40),
    [allRows],
  );

  if (error) {
    return (
      <div style={{ padding: 16, color: colors.red, fontFamily: fonts.mono, fontSize: 11 }}>
        Error: {error}
      </div>
    );
  }

  if (loading && !data) {
    return (
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 6 }}>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} height={24} />)}
      </div>
    );
  }

  if (allRows.length === 0) {
    return (
      <div style={{ padding: 16, color: colors.txt3, fontFamily: fonts.mono, fontSize: 11 }}>
        No funding data — wait a few seconds for the poller.
      </div>
    );
  }

  const ToggleButton = ({ value, label }: { value: ViewMode; label: string }) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      style={{
        background: mode === value ? colors.bg2 : colors.bg1,
        border: "none",
        color: mode === value ? colors.amber : colors.txt3,
        padding: "3px 12px",
        fontSize: 9,
        fontFamily: fonts.mono,
        letterSpacing: "0.10em",
        cursor: "pointer",
        textTransform: "uppercase",
      }}
    >
      {label}
    </button>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Toolbar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "6px 10px",
          borderBottom: `1px solid ${colors.line}`,
          background: colors.bg1,
          flexShrink: 0,
          flexWrap: "wrap",
        }}
      >
        <span style={{ display: "flex", gap: 1, background: colors.line }}>
          <ToggleButton value="compact" label="Compact" />
          <ToggleButton value="matrix" label="Matrix" />
        </span>

        <span style={{ fontSize: 9, color: colors.txt4, fontFamily: fonts.mono, letterSpacing: "0.06em" }}>
          {data?.rates.length ?? 0} rates · {allRows.length} symbols · 4 venues
        </span>

        <span style={{ marginLeft: "auto", display: "flex", gap: 12, fontSize: 9, fontFamily: fonts.mono, color: colors.txt4 }}>
          <span style={{ color: colors.red }}>■ HOT LONG</span>
          <span style={{ color: colors.green }}>■ HOT SHORT</span>
        </span>
        {isMobile && (
          <span
            style={{
              flexBasis: "100%",
              fontSize: 10,
              color: colors.amber,
              fontFamily: fonts.mono,
              letterSpacing: "0.08em",
              opacity: 0.85,
            }}
          >
            ← swipe table sideways to see all venues →
          </span>
        )}
      </div>

      {/* Table */}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: "auto",
          WebkitOverflowScrolling: "touch",
          position: "relative",
        }}
        onMouseLeave={() => setHover(null)}
      >
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: fonts.mono,
            fontSize: 10.5,
            tableLayout: "fixed",
          }}
        >
          <colgroup>
            <col style={{ width: 64 }} />
            {EXCHANGES.map((e) => <col key={e} />)}
            <col style={{ width: 60 }} />
            {!isMobile && <col style={{ width: 60 }} />}
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...thStyle, left: 0, position: "sticky", zIndex: 2, background: colors.bg2 }}>SYM</th>
              {EXCHANGES.map((e) => (
                <th key={e} style={{ ...thStyle, textAlign: "center" }}>{EX_LABEL[e]}</th>
              ))}
              <th style={{ ...thStyle, textAlign: "right" }}>AVG</th>
              {!isMobile && <th style={{ ...thStyle, textAlign: "right" }}>SPRD</th>}
            </tr>
          </thead>
          {mode === "compact" ? (
            <>
              <SectionHeader label="HOT LONGS" sub={`${longs.length} symbols`} color={colors.red} />
              <tbody>
                {longs.map((r) => (
                  <Row
                    key={`long-${r.symbol}`}
                    row={r}
                    onHoverCell={(ex, rate, x, y) => setHover({ row: r.symbol, ex, rate, x, y })}
                    onLeaveCell={() => setHover(null)}
                    showSpread={!isMobile}
                  />
                ))}
                {longs.length === 0 && (
                  <EmptyRow label="No positive funding right now" cols={isMobile ? 6 : 7} />
                )}
              </tbody>
              <SectionHeader label="HOT SHORTS" sub={`${shorts.length} symbols`} color={colors.green} />
              <tbody>
                {shorts.map((r) => (
                  <Row
                    key={`short-${r.symbol}`}
                    row={r}
                    onHoverCell={(ex, rate, x, y) => setHover({ row: r.symbol, ex, rate, x, y })}
                    onLeaveCell={() => setHover(null)}
                    showSpread={!isMobile}
                  />
                ))}
                {shorts.length === 0 && (
                  <EmptyRow label="No negative funding right now" cols={isMobile ? 6 : 7} />
                )}
              </tbody>
            </>
          ) : (
            <tbody>
              {flat.map((r) => (
                <Row
                  key={r.symbol}
                  row={r}
                  onHoverCell={(ex, rate, x, y) => setHover({ row: r.symbol, ex, rate, x, y })}
                  onLeaveCell={() => setHover(null)}
                  showSpread={!isMobile}
                />
              ))}
            </tbody>
          )}
        </table>

        {hover && (
          <div
            style={{
              position: "fixed",
              left: hover.x + 14,
              top: hover.y + 14,
              background: "#000",
              border: `1px solid ${colors.amberDim}`,
              padding: "6px 10px",
              fontFamily: fonts.mono,
              fontSize: 10,
              color: colors.txt1,
              pointerEvents: "none",
              zIndex: 9999,
              minWidth: 160,
            }}
          >
            <div style={{ color: colors.amber, fontWeight: 600, marginBottom: 4 }}>
              {hover.row} · {EX_LABEL[hover.ex]}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", columnGap: 8, rowGap: 2 }}>
              <span style={{ color: colors.txt4 }}>RATE</span>
              <span style={{ color: hover.rate.ratePercent >= 0 ? colors.red : colors.green, fontWeight: 600, textAlign: "right" }}>
                {hover.rate.ratePercent >= 0 ? "+" : ""}{hover.rate.ratePercent.toFixed(4)}%
              </span>
              <span style={{ color: colors.txt4 }}>ABS</span>
              <span style={{ textAlign: "right" }}>{Math.abs(hover.rate.ratePercent).toFixed(4)}%</span>
              {hover.rate.nextFundingTime && (
                <>
                  <span style={{ color: colors.txt4 }}>NEXT</span>
                  <span style={{ textAlign: "right" }}>
                    {new Date(hover.rate.nextFundingTime).toISOString().slice(11, 16)} UTC
                  </span>
                </>
              )}
              <span style={{ color: colors.txt4 }}>SYMBOL</span>
              <span style={{ textAlign: "right", fontSize: 9, color: colors.txt3 }}>{hover.rate.symbol}</span>
            </div>
          </div>
        )}
      </div>

      {/* Footer hints */}
      <div
        style={{
          padding: "5px 10px",
          fontSize: 9,
          color: colors.txt4,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          fontFamily: fonts.mono,
          borderTop: `1px solid ${colors.line}`,
          flexShrink: 0,
          display: "flex",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <span>▸ AVG &gt; +0.05% = mean-reversion DOWN risk</span>
        <span>▸ AVG &lt; −0.02% = mean-reversion UP setup</span>
        <span>▸ SPRD &gt; 0.04% = arb signal across venues</span>
      </div>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "5px 8px",
  fontSize: 9,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: colors.txt3,
  borderBottom: `1px solid ${colors.line}`,
  background: colors.bg2,
  position: "sticky",
  top: 0,
  zIndex: 1,
  textAlign: "left",
};

function SectionHeader({ label, sub, color }: { label: string; sub: string; color: string }) {
  return (
    <thead>
      <tr>
        <td
          colSpan={7}
          style={{
            padding: "4px 10px",
            background: colors.bg2,
            color,
            fontSize: 9,
            fontWeight: 600,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            borderBottom: `1px solid ${colors.line}`,
            borderTop: `1px solid ${colors.line}`,
            fontFamily: fonts.mono,
          }}
        >
          ▸ {label}
          <span style={{ marginLeft: 10, color: colors.txt4, fontWeight: 400 }}>{sub}</span>
        </td>
      </tr>
    </thead>
  );
}

function Row({
  row,
  onHoverCell,
  onLeaveCell,
  showSpread,
}: {
  row: SymRow;
  onHoverCell: (ex: Exchange, rate: FundingRate, x: number, y: number) => void;
  onLeaveCell: () => void;
  showSpread: boolean;
}) {
  return (
    <tr style={{ borderBottom: `1px solid ${colors.line}`, height: 28 }}>
      <td
        style={{
          ...tdStyle,
          left: 0,
          position: "sticky",
          background: colors.bg1,
          zIndex: 1,
          color: colors.amber,
          fontWeight: 600,
        }}
      >
        {row.symbol}
      </td>
      {EXCHANGES.map((ex) => {
        const cell = row.cells[ex];
        if (!cell) {
          return (
            <td key={ex} style={{ ...tdStyle, textAlign: "center", color: colors.txt4 }}>—</td>
          );
        }
        const intensity = Math.min(Math.abs(cell.ratePercent) / 0.05, 1);
        const bg = bgFor(cell.ratePercent, intensity);
        const fg = fgFor(intensity);
        return (
          <td
            key={ex}
            onMouseMove={(e) => onHoverCell(ex, cell, e.clientX, e.clientY)}
            onMouseLeave={onLeaveCell}
            style={{
              ...tdStyle,
              background: bg,
              color: fg,
              textAlign: "center",
              fontVariantNumeric: "tabular-nums",
              cursor: "default",
            }}
          >
            {cell.ratePercent >= 0 ? "+" : ""}{cell.ratePercent.toFixed(3)}
          </td>
        );
      })}
      <td
        style={{
          ...tdStyle,
          textAlign: "right",
          color: row.avg >= 0 ? colors.red : colors.green,
          fontWeight: 600,
        }}
      >
        {row.avg >= 0 ? "+" : ""}{row.avg.toFixed(3)}
      </td>
      {showSpread && (
        <td
          style={{
            ...tdStyle,
            textAlign: "right",
            color: row.spread > 0.04 ? colors.amber : colors.txt4,
          }}
        >
          {row.spread.toFixed(3)}
        </td>
      )}
    </tr>
  );
}

const tdStyle: React.CSSProperties = {
  padding: "4px 8px",
  whiteSpace: "nowrap",
};

function EmptyRow({ label, cols }: { label: string; cols: number }) {
  return (
    <tr>
      <td
        colSpan={cols}
        style={{
          padding: "12px",
          color: colors.txt4,
          fontFamily: fonts.mono,
          fontSize: 10,
          textAlign: "center",
          fontStyle: "italic",
        }}
      >
        {label}
      </td>
    </tr>
  );
}
