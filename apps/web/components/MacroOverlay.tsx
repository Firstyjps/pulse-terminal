"use client";

import { Sparkbar, colors, fonts } from "@pulse/ui";
import { formatPercent } from "@pulse/sources";
import type { MacroResponse, MacroSeries } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";
import { useIsMobile } from "../lib/use-media";

/**
 * MacroOverlay — handoff Row 4 mid c-4 (320px).
 *
 *   Section A: per-row sparkline (DXY, SPX, GLD …) — symbol | sparkline | value | %chg
 *   Section B: BTC correlation 30d — bipolar centered bars
 *
 * Data: /api/macro returns DXY, SPX, GOLD (current + 6mo daily history).
 * Correlation is currently a derived stub (needs separate backend endpoint).
 */
export function MacroOverlay() {
  const { data } = useFlow<MacroResponse>("/api/macro");
  const isMobile = useIsMobile();
  const rows: { s: MacroSeries; corr: number }[] = [];
  if (data?.dxy) rows.push({ s: data.dxy, corr: data.dxy.change24h < 0 ? 0.45 : -0.55 });
  if (data?.spx) rows.push({ s: data.spx, corr: 0.62 });
  if (data?.gold) rows.push({ s: data.gold, corr: 0.18 });

  // Mobile: drop the flex:1 wrapper. Phase 1 had Section A as flex:1 with each
  // Row also flex:1 — when 3 rows of ~100px content tried to share Section A's
  // 120-180px flex slot, the grid contents overflowed each row's box and the
  // sparklines from row N painted over row N+1's labels (the "labels missing"
  // bug the user reported). Pure document flow on mobile = each row keeps its
  // own height, no overlap. Correlation footer also dropped on mobile to keep
  // the panel focused on the symbol+value+chart.
  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", fontFamily: fonts.mono }}>
        {rows.map((r) => (
          <Row key={r.s.symbol} s={r.s} />
        ))}
        {rows.length === 0 && (
          <div
            style={{
              padding: 16,
              fontSize: 11,
              textAlign: "center",
              color: colors.txt3,
            }}
          >
            <span className="blink">▒ MACRO FEED LOADING ▒</span>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Section A — current values + sparkline per row (rows expand to fill) */}
      <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
        {rows.map((r) => (
          <Row key={r.s.symbol} s={r.s} />
        ))}
        {rows.length === 0 && (
          <div
            style={{
              padding: 16,
              fontFamily: fonts.mono,
              fontSize: 10,
              textAlign: "center",
              color: colors.txt3,
            }}
          >
            <span className="blink">▒ MACRO FEED LOADING ▒</span>
          </div>
        )}
      </div>

      {/* Section B — BTC correlation 30d (bipolar bars) */}
      {rows.length > 0 && (
        <div style={{ flexShrink: 0 }}>
          <div
            style={{
              padding: "8px 10px",
              borderTop: `1px solid ${colors.line}`,
              fontFamily: fonts.mono,
              fontSize: 9,
              color: colors.txt4,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Correlation BTC · 30d
          </div>
          <div style={{ padding: "0 12px 8px", display: "grid", gap: 4 }}>
            {rows.map((r) => (
              <CorrRow key={r.s.symbol} sym={r.s.symbol} corr={r.corr} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ s }: { s: MacroSeries }) {
  const positive = s.change24h >= 0;
  const color = positive ? colors.green : colors.red;
  const series = s.history.map((p) => p.value);
  const isMobile = useIsMobile();

  // Mobile: stack header (symbol+value, sublabel+chg) above a full-width
  // sparkline. Phase 2 fix: dropped `flex: 1; min-height: 0` from this Row
  // because in a flex-column parent that ALSO had flex:1, it forced each row
  // to share the parent's height — content overflowed and the sparkline of
  // row N painted over row N+1's labels. This row now sizes to its own
  // content (no flex), with an explicit minHeight floor for breathing room.
  if (isMobile) {
    return (
      <div
        title={s.label}
        style={{
          display: "grid",
          gridTemplateColumns: "1fr auto",
          gap: "4px 14px",
          padding: "12px 14px",
          minHeight: 96,
          borderBottom: `1px solid ${colors.line}`,
          fontFamily: fonts.mono,
        }}
      >
        <span style={{ color: colors.amber, fontWeight: 700, fontSize: 16, letterSpacing: "0.06em" }}>
          {s.symbol}
        </span>
        <span
          className="mono-num"
          style={{ textAlign: "right", color: colors.txt1, fontWeight: 600, fontSize: 16 }}
        >
          {s.current.toLocaleString(undefined, { maximumFractionDigits: s.current < 10 ? 3 : 2 })}
        </span>
        <span style={{ color: colors.txt4, fontSize: 11, letterSpacing: "0.05em", textTransform: "uppercase" }}>
          {s.label}
        </span>
        <span
          className="mono-num"
          style={{ textAlign: "right", color, fontWeight: 600, fontSize: 13 }}
        >
          {formatPercent(s.change24h)}
        </span>
        <div style={{ gridColumn: "1 / -1", minWidth: 0, marginTop: 8 }}>
          <Sparkbar
            data={series}
            asLine
            fill
            color={color}
            height={48}
            width={600}
            style={{ width: "100%" }}
          />
        </div>
      </div>
    );
  }

  return (
    <div
      title={s.label}
      style={{
        display: "grid",
        gridTemplateColumns: "72px 1fr 96px 72px",
        gap: 12,
        padding: "10px 14px",
        borderBottom: `1px solid ${colors.line}`,
        alignItems: "center",
        fontSize: 12,
        fontFamily: fonts.mono,
        whiteSpace: "nowrap",
        flex: 1,
        minHeight: 0,
      }}
    >
      <span style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
        <span style={{ color: colors.amber, fontWeight: 700, fontSize: 14, letterSpacing: "0.06em" }}>
          {s.symbol}
        </span>
        <span style={{ color: colors.txt4, fontSize: 9, letterSpacing: "0.04em", textTransform: "uppercase" }}>
          {s.label}
        </span>
      </span>
      <div style={{ minWidth: 0, display: "flex", alignItems: "center" }}>
        <Sparkbar
          data={series}
          asLine
          fill
          color={color}
          height={46}
          width={600}
          style={{ width: "100%" }}
        />
      </div>
      <span
        className="mono-num"
        style={{ textAlign: "right", color: colors.txt1, fontWeight: 500, fontSize: 14 }}
      >
        {s.current.toLocaleString(undefined, { maximumFractionDigits: s.current < 10 ? 3 : 2 })}
      </span>
      <span
        className="mono-num"
        style={{ textAlign: "right", color, fontWeight: 600, fontSize: 12 }}
      >
        {formatPercent(s.change24h)}
      </span>
    </div>
  );
}

function CorrRow({ sym, corr }: { sym: string; corr: number }) {
  const positive = corr >= 0;
  const color = positive ? colors.green : colors.red;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "40px 1fr 50px",
        gap: 10,
        alignItems: "center",
        fontSize: 10,
        fontFamily: fonts.mono,
      }}
    >
      <span style={{ color: colors.amber, fontWeight: 600, letterSpacing: "0.06em" }}>{sym}</span>
      <div style={{ height: 8, background: colors.bg3, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            left: positive ? "50%" : `${50 + corr * 50}%`,
            width: `${Math.abs(corr) * 50}%`,
            top: 0,
            bottom: 0,
            background: color,
            opacity: 0.7,
          }}
        />
        <div style={{ position: "absolute", left: "50%", top: -1, bottom: -1, width: 1, background: colors.txt3 }} />
      </div>
      <span className="mono-num" style={{ textAlign: "right", color }}>
        {(positive ? "+" : "") + corr.toFixed(2)}
      </span>
    </div>
  );
}
