"use client";

import { useState } from "react";
import { Card, Pill } from "@pulse/ui";
import { useFlow } from "../../lib/use-flow";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";

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
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 24, gap: 16, flexWrap: "wrap" }}>
        <h2 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.01em" }}>Backtest · Signal Hit-rate</h2>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <MCPQuickAsk endpoint={`/api/backtest?hours=${hours}`} label="Ask Claude to grade" />
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
      </div>

      {data?.summary && (
        <div style={{ display: "flex", gap: 12, marginBottom: 16, fontSize: 12, color: "#9ca3af", fontFamily: "JetBrains Mono, monospace" }}>
          <span>scans: {data.summary.totalScans}</span>
          <span>scored: {data.summary.scoredScans}</span>
          {data.summary.oldestTs && <span>since: {data.summary.oldestTs.slice(0, 10)}</span>}
        </div>
      )}

      <Card>
        {loading && !data && (
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {Array.from({ length: 4 }, (_, i) => (
              <div key={i} style={{ display: "flex", gap: 12 }}>
                <Skeleton width="50%" height={20} />
                <Skeleton width={60} height={20} />
                <Skeleton width={70} height={20} />
                <Skeleton width={120} height={20} />
              </div>
            ))}
          </div>
        )}
        {data && !data.configured && (
          <EmptyState
            icon="📊"
            title="No alert log yet"
            body={
              <>
                Backtest reads <code>apps/alerts/data/alerts.jsonl</code>. Run the alerts worker for a few hours to start collecting findings:
                <br /><br />
                <code style={{ color: "#22d3ee" }}>pnpm pulse:start</code> &nbsp;then come back later.
              </>
            }
          />
        )}
        {data?.configured && data.stats.length === 0 && (
          <EmptyState
            icon="⏳"
            title={`Not enough scored scans yet`}
            body={`Findings need to age at least ${hours}h before scoring. Older lookahead = more samples.`}
            action={<Pill tone="cyan">try a shorter lookahead above</Pill>}
            compact
          />
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
