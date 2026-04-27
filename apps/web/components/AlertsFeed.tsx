"use client";

import { useState } from "react";
import { Card, Pill } from "@pulse/ui";
import type { AnomalyScan, AnomalyFinding } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

const SEV_TONE: Record<AnomalyFinding["severity"], "down" | "gold" | "flat"> = {
  high: "down",
  med: "gold",
  low: "flat",
};

const CATEGORY_TONE: Record<AnomalyFinding["category"], "purple" | "btc" | "eth" | "cyan" | "up" | "down"> = {
  etf: "purple",
  futures: "btc",
  funding: "eth",
  stablecoin: "cyan",
  tvl: "up",
  dex: "down",
};

export interface AlertsFeedProps {
  symbol?: string;
}

export function AlertsFeed({ symbol = "BTCUSDT" }: AlertsFeedProps) {
  const [refresh, setRefresh] = useState(0);
  const { data, loading, error } = useFlow<AnomalyScan>(`/api/alerts/scan?symbol=${symbol}`, refresh);

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
          <h3 style={{ margin: 0, fontSize: 14, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
            Live Anomaly Feed
          </h3>
          <span style={{ fontSize: 11, color: "#6b7280" }}>{symbol} · cross-source</span>
        </div>
        <button
          onClick={() => setRefresh((r) => r + 1)}
          disabled={loading}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "#f2f4f8",
            padding: "4px 10px",
            fontSize: 11,
            cursor: loading ? "wait" : "pointer",
            fontFamily: "JetBrains Mono, monospace",
            opacity: loading ? 0.5 : 1,
          }}
        >
          {loading ? "SCANNING…" : "RESCAN"}
        </button>
      </div>

      <Card>
        {loading && !data && <p style={{ color: "#9ca3af", fontSize: 12 }}>Scanning sources…</p>}
        {error && <p style={{ color: "#f87171", fontSize: 12 }}>Error: {error}</p>}
        {data && data.findings.length === 0 && (
          <p style={{ color: "#9ca3af", fontSize: 13 }}>
            No anomalies — markets quiet across the tracked dimensions.
          </p>
        )}
        {data && data.findings.length > 0 && (
          <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {data.findings.map((f, i) => (
              <li
                key={`${f.category}:${i}`}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                  padding: "10px 0",
                  borderBottom: i < data.findings.length - 1 ? "1px dashed rgba(255,255,255,0.06)" : "none",
                }}
              >
                <Pill tone={SEV_TONE[f.severity]} size="sm">{f.severity.toUpperCase()}</Pill>
                <Pill tone={CATEGORY_TONE[f.category]} size="sm">{f.category.toUpperCase()}</Pill>
                <div style={{ flex: 1, fontSize: 13, color: "#f2f4f8", lineHeight: 1.5 }}>
                  {f.signal}
                  <span style={{ display: "block", marginTop: 2, fontSize: 11, color: "#6b7280", fontFamily: "JetBrains Mono, monospace" }}>
                    {Object.entries(f.evidence)
                      .map(([k, v]) => `${k}=${typeof v === "number" ? v.toFixed(3) : String(v)}`)
                      .join(" · ")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {data && (
        <p style={{ marginTop: 8, fontSize: 11, color: "#6b7280" }}>
          generated {new Date(data.generatedAt).toLocaleTimeString()} · BTC ${data.marker.btcPrice?.toFixed(2) ?? "—"}
        </p>
      )}
    </section>
  );
}
