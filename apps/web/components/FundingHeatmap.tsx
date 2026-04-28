"use client";

import { useMemo } from "react";
import { Card, Pill } from "@pulse/ui";
import { useFlow } from "../lib/use-flow";
import { Skeleton } from "./Skeleton";

interface FundingRate {
  exchange: string;
  symbol: string;
  rate: number;
  ratePercent: number;
  ts: number;
}

interface ApiResp {
  rates: FundingRate[];
  ts: number;
}

const EXCHANGES = ["binance", "bybit", "okx"] as const;

/**
 * Color scale for funding %:
 *   < -0.05%  deep red   (extreme short-pay-long)
 *   ~ 0%      neutral
 *   > +0.05%  deep green (extreme long-pay-short)
 *
 * Hot funding (>0.05%) = potential mean-reversion DOWN (longs overpaying)
 * Cold funding (<-0.02%) = potential mean-reversion UP (shorts overpaying)
 */
function rateToColor(pct: number): { bg: string; fg: string } {
  const clamp = Math.max(-0.1, Math.min(0.1, pct)); // saturate at ±0.1%
  const intensity = Math.abs(clamp) / 0.1; // 0..1
  if (clamp > 0) {
    // long-side: orange→red (overheated long)
    const alpha = 0.08 + intensity * 0.55;
    return { bg: `rgba(248,113,113,${alpha})`, fg: intensity > 0.5 ? "#fff" : "#fca5a5" };
  } else if (clamp < 0) {
    // short-side: subtle green (cold funding, less common)
    const alpha = 0.05 + intensity * 0.4;
    return { bg: `rgba(52,211,153,${alpha})`, fg: intensity > 0.5 ? "#fff" : "#86efac" };
  }
  return { bg: "rgba(156,163,175,0.06)", fg: "#9ca3af" };
}

function normalizeSymbol(s: string): string {
  // OKX uses BTC-USDT-SWAP; normalize to BTCUSDT
  return s.replace(/-USDT-SWAP$/i, "USDT").toUpperCase();
}

export function FundingHeatmap() {
  const { data, loading, error } = useFlow<ApiResp>("/api/funding");

  // Build symbol → exchange → rate map, sorted by |avg rate| desc
  const rows = useMemo(() => {
    if (!data?.rates) return [];
    const map = new Map<string, Map<string, FundingRate>>();
    for (const r of data.rates) {
      const sym = normalizeSymbol(r.symbol);
      if (!map.has(sym)) map.set(sym, new Map());
      map.get(sym)!.set(r.exchange.toLowerCase(), r);
    }
    return Array.from(map.entries())
      .map(([sym, byExch]) => {
        const cells = EXCHANGES.map((e) => byExch.get(e) ?? null);
        const present = cells.filter((c): c is FundingRate => c !== null);
        const avg = present.length ? present.reduce((s, c) => s + c.ratePercent, 0) / present.length : 0;
        return { symbol: sym, cells, avg, present: present.length };
      })
      .filter((r) => r.present >= 2) // at least 2 venues — skip illiquid
      .sort((a, b) => Math.abs(b.avg) - Math.abs(a.avg))
      .slice(0, 25);
  }, [data]);

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12, flexWrap: "wrap" }}>
        <h3 style={{ margin: 0, fontSize: 14, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
          Funding Heatmap
        </h3>
        <span style={{ fontSize: 11, color: "#6b7280" }}>
          ranked by |avg %| · top 25 · red = overheated long · green = overheated short
        </span>
      </div>

      <Card padded={false}>
        <div style={{ overflowX: "auto" }}>
          <table style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            fontVariantNumeric: "tabular-nums",
          }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#9ca3af", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Symbol</th>
                {EXCHANGES.map((e) => (
                  <th key={e} style={{ padding: "10px 8px", textAlign: "center", fontWeight: 600, textTransform: "uppercase" }}>
                    {e}
                  </th>
                ))}
                <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>Avg</th>
                <th style={{ padding: "10px 12px", textAlign: "right", fontWeight: 600 }}>Spread</th>
              </tr>
            </thead>
            <tbody>
              {loading && !data && Array.from({ length: 8 }).map((_, i) => (
                <tr key={i}>
                  <td colSpan={6} style={{ padding: "8px 12px" }}>
                    <Skeleton height={20} />
                  </td>
                </tr>
              ))}
              {error && (
                <tr><td colSpan={6} style={{ padding: 16, color: "#f87171" }}>Error: {error}</td></tr>
              )}
              {rows.map((row) => {
                const present = row.cells.filter((c): c is FundingRate => c !== null);
                const min = Math.min(...present.map((c) => c.ratePercent));
                const max = Math.max(...present.map((c) => c.ratePercent));
                const spread = max - min;
                return (
                  <tr key={row.symbol} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                    <td style={{ padding: "8px 12px", fontWeight: 600, color: "#f2f4f8" }}>{row.symbol}</td>
                    {row.cells.map((cell, i) => {
                      if (!cell) return (
                        <td key={i} style={{ padding: "4px 6px", textAlign: "center", color: "#404656" }}>—</td>
                      );
                      const c = rateToColor(cell.ratePercent);
                      return (
                        <td key={i} style={{ padding: "4px 6px" }}>
                          <div style={{
                            background: c.bg,
                            color: c.fg,
                            padding: "8px 10px",
                            borderRadius: 6,
                            textAlign: "center",
                            fontWeight: 600,
                          }}>
                            {cell.ratePercent.toFixed(4)}%
                          </div>
                        </td>
                      );
                    })}
                    <td style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      color: row.avg >= 0 ? "#f87171" : "#34d399",
                      fontWeight: 600,
                    }}>
                      {row.avg >= 0 ? "+" : ""}{row.avg.toFixed(4)}%
                    </td>
                    <td style={{
                      padding: "8px 12px",
                      textAlign: "right",
                      color: spread > 0.04 ? "#fbbf24" : "#6b7280",
                    }}>
                      {spread.toFixed(4)}%
                    </td>
                  </tr>
                );
              })}
              {data && rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, textAlign: "center", color: "#6b7280" }}>
                    No funding data — wait a few seconds for poller
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div style={{ marginTop: 8, fontSize: 11, color: "#6b7280", display: "flex", gap: 16, flexWrap: "wrap" }}>
        <span>📊 spread &gt; 0.04% across venues = arbitrage signal</span>
        <span>🔴 avg &gt; +0.05% = mean-reversion DOWN risk</span>
        <span>🟢 avg &lt; −0.02% = mean-reversion UP setup</span>
      </div>
    </section>
  );
}
