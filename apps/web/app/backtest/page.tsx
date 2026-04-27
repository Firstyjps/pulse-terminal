"use client";

import { useState } from "react";
import { Card, Pill } from "@pulse/ui";
import { useFlow } from "../../lib/use-flow";

interface PatternStats {
  pattern: string;
  count: number;
  hitRate: number;
  avgMove: number;
  samples: number;
}

interface ApiResp {
  configured: boolean;
  message?: string;
  summary: {
    totalScans: number;
    scoredScans: number;
    oldestTs: string | null;
    newestTs: string | null;
    lookaheadHours: number;
  };
  stats: PatternStats[];
}

const LOOKAHEADS = [4, 24, 72, 168] as const;

export default function BacktestPage() {
  const [hours, setHours] = useState<number>(24);
  const { data, loading } = useFlow<ApiResp>(`/api/backtest?hours=${hours}`, hours);

  return (
    <section style={{ paddingTop: 40 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.01em" }}>Backtest · Signal Hit-rate</h2>
        <div style={{ display: "flex", gap: 6 }}>
          {LOOKAHEADS.map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              style={{
                background: hours === h ? "rgba(124,92,255,0.15)" : "transparent",
                border: `1px solid ${hours === h ? "rgba(124,92,255,0.4)" : "rgba(255,255,255,0.1)"}`,
                color: hours === h ? "#a78bfa" : "#9ca3af",
                borderRadius: 8,
                padding: "6px 14px",
                fontFamily: "JetBrains Mono, monospace",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              {h < 24 ? `${h}h` : `${h / 24}d`}
            </button>
          ))}
        </div>
      </div>

      {data?.summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 12, color: "#9ca3af", fontFamily: "JetBrains Mono, monospace" }}>
          <span>scans: {data.summary.totalScans}</span>
          <span>scored: {data.summary.scoredScans}</span>
          {data.summary.oldestTs && <span>since: {data.summary.oldestTs.slice(0, 10)}</span>}
        </div>
      )}

      <Card>
        {loading && <p style={{ color: "#9ca3af" }}>Loading…</p>}
        {data && !data.configured && (
          <div>
            <Pill tone="flat">NO DATA</Pill>
            <p style={{ marginTop: 12, color: "#9ca3af", fontSize: 13, lineHeight: 1.6 }}>{data.message}</p>
          </div>
        )}
        {data?.configured && data.stats.length === 0 && (
          <p style={{ color: "#9ca3af" }}>
            Not enough scored scans yet — wait until alerts have aged at least {hours}h.
          </p>
        )}
        {data?.configured && data.stats.length > 0 && (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#9ca3af", borderBottom: "1px solid rgba(255,255,255,0.06)", fontFamily: "JetBrains Mono, monospace" }}>
                <th style={{ padding: "10px 12px" }}>Pattern</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Samples</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Hit-rate</th>
                <th style={{ padding: "10px 12px", textAlign: "right" }}>Avg BTC move ({hours}h)</th>
              </tr>
            </thead>
            <tbody>
              {data.stats.map((s) => (
                <tr key={s.pattern} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "10px 12px" }}>{s.pattern}</td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "#9ca3af" }}>
                    {s.samples}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: s.hitRate >= 50 ? "#34d399" : "#f87171" }}>
                    {s.hitRate.toFixed(1)}%
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: s.avgMove >= 0 ? "#34d399" : "#f87171" }}>
                    {s.avgMove >= 0 ? "+" : ""}{s.avgMove.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <p style={{ marginTop: 16, fontSize: 11, color: "#6b7280", lineHeight: 1.5 }}>
        Hit = BTC moved in expected direction within window (etf/funding/futures/tvl/dex → expect down ·
        stablecoin → expect up). Reads <code>{`apps/alerts/data/alerts.jsonl`}</code>. Run alerts worker to populate.
      </p>
    </section>
  );
}
