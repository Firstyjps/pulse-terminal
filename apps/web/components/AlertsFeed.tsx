"use client";

import { useState } from "react";
import { SignalPill, colors, fonts } from "@pulse/ui";
import type { SignalTone } from "@pulse/ui";
import type { AnomalyScan, AnomalyFinding } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";
import { useIsMobile } from "../lib/use-media";
import { fmtTimeICT } from "../lib/time";

/**
 * Map our internal AnomalyCategory → handoff display tag.
 * Handoff tags: WHALE / LIQ / FLOW / OI / PUMP / NEWS
 *
 * Since our data layer uses different categories (etf/futures/funding/stablecoin/tvl/dex/options/bybit),
 * we re-map for display:
 *   etf       → FLOW   (cyan, exchange/issuer netflow)
 *   futures   → OI     (magenta, futures open interest)
 *   funding   → OI     (magenta, perp leverage signal)
 *   stablecoin→ FLOW   (cyan, stablecoin supply movement)
 *   tvl       → PUMP   (green, defi capital movement)
 *   dex       → FLOW   (cyan, exchange flow)
 *   options   → OI     (magenta, options structure)
 *   bybit     → WHALE  (amber, exchange-specific large move)
 */
const CAT_DISPLAY: Record<AnomalyFinding["category"], "WHALE" | "LIQ" | "FLOW" | "OI" | "PUMP" | "NEWS"> = {
  etf: "FLOW",
  futures: "OI",
  funding: "OI",
  stablecoin: "FLOW",
  tvl: "PUMP",
  dex: "FLOW",
  options: "OI",
  bybit: "WHALE",
};

const SEV_TONE: Record<AnomalyFinding["severity"], SignalTone> = {
  high: "down",
  med: "amber",
  low: "muted",
};

export interface AlertsFeedProps {
  symbol?: string;
  /** Slim variant when embedded in a small panel — drops sub-header. */
  embed?: "panel" | "strip";
}

function fmtTime(ts: string | Date) {
  return fmtTimeICT(ts);
}

export function AlertsFeed({ symbol = "BTCUSDT", embed = "panel" }: AlertsFeedProps) {
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useFlow<AnomalyScan>(`/api/alerts/scan?symbol=${symbol}`, refresh);
  const slim = embed === "strip";
  const isMobile = useIsMobile();

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {!slim && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 8px",
            borderBottom: `1px solid ${colors.line}`,
            fontFamily: fonts.mono,
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: colors.txt3,
            flexShrink: 0,
          }}
        >
          <span style={{ color: colors.txt2 }}>{symbol}</span>
          <span>· cross-source</span>
          {data && <span style={{ color: colors.txt4 }}>· {data.findings.length} EVTS</span>}
          <button
            type="button"
            onClick={() => setRefresh((r) => r + 1)}
            disabled={loading}
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: `1px solid ${colors.line2}`,
              color: colors.txt2,
              fontFamily: "inherit",
              fontSize: 9,
              padding: "2px 6px",
              cursor: loading ? "wait" : "pointer",
              letterSpacing: "0.08em",
              textTransform: "uppercase",
              opacity: loading ? 0.5 : 1,
            }}
          >
            {loading ? "Scanning…" : "Rescan"}
          </button>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {loading && !data && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              fontFamily: fonts.mono,
              fontSize: 10,
              color: colors.txt3,
            }}
          >
            <span className="blink">▒ MONITORING ▒</span>
          </div>
        )}
        {error && (
          <div style={{ padding: 12, fontFamily: fonts.mono, fontSize: 10, color: colors.red }}>
            ERR · {error}
          </div>
        )}
        {data && data.findings.length === 0 && (
          <div
            style={{
              padding: 16,
              textAlign: "center",
              fontFamily: fonts.mono,
              fontSize: 10,
              color: colors.txt3,
            }}
          >
            <span className="blink">▒ MARKETS QUIET — NO ANOMALIES ▒</span>
            <div style={{ marginTop: 4, fontSize: 9, color: colors.txt4 }}>
              last scan {data.generatedAt ? fmtTime(data.generatedAt) : "—"} ICT
            </div>
          </div>
        )}
        {data &&
          data.findings.map((f, i) => {
            const tag = CAT_DISPLAY[f.category];
            const sev = f.severity;

            // Mobile card layout — drops the timestamp/tag/signal/severity row
            // grid (which collapses to ~50px tall and clips evidence text on a
            // 390px viewport) for a stacked card with full-width signal text.
            if (isMobile) {
              return (
                <div
                  key={`${f.category}:${i}`}
                  className="feed-row"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "12px 14px",
                    borderBottom: `1px solid ${colors.line}`,
                    fontFamily: fonts.mono,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <SignalPill tone={tag} size="xs">{tag}</SignalPill>
                    <SignalPill tone={SEV_TONE[sev]} size="xs">{sev}</SignalPill>
                    <span style={{ marginLeft: "auto", color: colors.txt4, fontSize: 10 }}>
                      {fmtTime(data.generatedAt)}
                    </span>
                  </div>
                  <div style={{ color: colors.txt2, fontSize: 12, lineHeight: 1.4 }}>
                    {f.signal}
                  </div>
                  <div style={{ color: colors.txt4, fontSize: 10, lineHeight: 1.4 }}>
                    [{evidenceShort(f.evidence)}]
                  </div>
                </div>
              );
            }

            return (
              <div
                key={`${f.category}:${i}`}
                className="feed-row"
                style={{
                  display: "grid",
                  gridTemplateColumns: "60px 60px 1fr auto",
                  gap: 8,
                  padding: "5px 8px",
                  borderBottom: `1px solid ${colors.line}`,
                  fontSize: 10,
                  fontFamily: fonts.mono,
                  alignItems: "baseline",
                }}
              >
                <span
                  style={{
                    color: colors.txt4,
                    fontSize: 9,
                  }}
                >
                  {fmtTime(data.generatedAt)}
                </span>
                <SignalPill tone={tag}>{tag}</SignalPill>
                <span style={{ color: colors.txt2 }}>
                  {f.signal}
                  <span style={{ marginLeft: 8, color: colors.txt4, fontSize: 9 }}>
                    [{evidenceShort(f.evidence)}]
                  </span>
                </span>
                <SignalPill tone={SEV_TONE[sev]} size="xs">
                  {sev}
                </SignalPill>
              </div>
            );
          })}
      </div>
    </div>
  );
}

function evidenceShort(ev: Record<string, unknown>): string {
  return Object.entries(ev)
    .slice(0, 3)
    .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(2) : String(v)}`)
    .join(" · ");
}
