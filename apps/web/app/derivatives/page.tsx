"use client";

import { useEffect, useRef, useState } from "react";
import { Card, Pill } from "@pulse/ui";
import { PulseClient, type ServerMessage } from "../../lib/ws-client";
import { FundingHeatmap } from "../../components/FundingHeatmap";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";

interface FundingRow {
  exchange: string;
  symbol: string;
  ratePercent: number;
  ts: number;
}

export default function DerivativesPage() {
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [funding, setFunding] = useState<Map<string, FundingRow>>(new Map());
  const clientRef = useRef<PulseClient | null>(null);

  useEffect(() => {
    const url = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";
    const client = new PulseClient({
      url,
      onStatus: setStatus,
      onMessage: (msg: ServerMessage) => {
        if (msg.type === "funding") {
          setFunding((prev) => {
            const next = new Map(prev);
            next.set(`${msg.exchange}:${msg.symbol}`, {
              exchange: msg.exchange,
              symbol: msg.symbol,
              ratePercent: msg.ratePercent,
              ts: msg.ts,
            });
            return next;
          });
        }
      },
    });
    clientRef.current = client;
    return () => client.close();
  }, []);

  const rows = Array.from(funding.values()).sort((a, b) =>
    a.exchange.localeCompare(b.exchange) || a.symbol.localeCompare(b.symbol),
  );

  return (
    <section style={{ paddingTop: 40 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24, gap: 12, flexWrap: "wrap" }}>
        <h2 style={{ fontSize: 28, margin: 0 }}>Derivatives · Live</h2>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <MCPQuickAsk endpoint="/api/funding" label="Ask Claude" />
          <Pill tone={status === "open" ? "up" : status === "error" ? "down" : "flat"}>
            {status.toUpperCase()}
          </Pill>
        </div>
      </div>

      <FundingHeatmap />

      <h3 style={{ fontSize: 14, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase", margin: "32px 0 12px" }}>
        Live WS Stream
      </h3>
      <Card>
        {rows.length === 0 ? (
          <p style={{ color: "#9ca3af" }}>
            Waiting for funding ticks from <code>ws://localhost:8080</code>… start
            the realtime server with <code>pnpm --filter @pulse/realtime dev</code>.
          </p>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: "JetBrains Mono, monospace", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#9ca3af", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                <th style={{ padding: "8px 12px" }}>Exchange</th>
                <th style={{ padding: "8px 12px" }}>Symbol</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Funding %</th>
                <th style={{ padding: "8px 12px", textAlign: "right" }}>Updated</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.exchange}:${r.symbol}`} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                  <td style={{ padding: "8px 12px" }}>{r.exchange}</td>
                  <td style={{ padding: "8px 12px" }}>{r.symbol}</td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: r.ratePercent >= 0 ? "#34d399" : "#f87171" }}>
                    {r.ratePercent.toFixed(4)}%
                  </td>
                  <td style={{ padding: "8px 12px", textAlign: "right", color: "#6b7280" }}>
                    {new Date(r.ts).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </section>
  );
}
