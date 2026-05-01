"use client";

import { useEffect, useRef, useState } from "react";
import { Panel, WsRow, Workspace, colors, fonts } from "@pulse/ui";
import { PulseClient, type ServerMessage } from "../../lib/ws-client";
import { FundingHeatmap } from "../../components/FundingHeatmap";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";
import { fmtTimeICT } from "../../lib/time";

interface FundingRow {
  exchange: string;
  symbol: string;
  ratePercent: number;
  ts: number;
}

/**
 * Derivatives — Bloomberg shell.
 *
 *   Row 1 (auto, ≥520px): FUNDING HEATMAP c-12
 *   Row 2 (h-table, 340px): LIVE WS STREAM c-12
 */
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

  const statusColor =
    status === "open" ? colors.green :
    status === "error" ? colors.red :
    status === "closed" ? colors.txt3 : colors.amber;

  return (
    <Workspace>
      <WsRow height="auto" style={{ minHeight: 520 }}>
        <Panel
          span={12}
          title="FUNDING HEATMAP"
          badge="4 VENUES · 1300+ RATES"
          actions={<MCPQuickAsk endpoint="/api/funding" label="Ask Claude" />}
          flush
        >
          <FundingHeatmap />
        </Panel>
      </WsRow>

      <WsRow height="table">
        <Panel
          span={12}
          title="LIVE WS STREAM"
          badge={
            <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusColor, boxShadow: `0 0 6px ${statusColor}` }} />
              {status.toUpperCase()}
            </span>
          }
          flush
        >
          {rows.length === 0 ? (
            <div style={{ padding: 16, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
              Waiting for funding ticks from <code>{process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080"}</code>…
              <br />
              Start realtime with <code style={{ color: colors.cyan }}>pnpm --filter @pulse/realtime dev</code>.
            </div>
          ) : (
            <div style={{ height: "100%", overflow: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 11 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: colors.txt3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    <th style={cellHeader}>Exchange</th>
                    <th style={cellHeader}>Symbol</th>
                    <th style={{ ...cellHeader, textAlign: "right" }}>Funding %</th>
                    <th style={{ ...cellHeader, textAlign: "right" }}>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={`${r.exchange}:${r.symbol}`} style={{ borderBottom: `1px solid ${colors.line}` }}>
                      <td style={cellBody}>{r.exchange}</td>
                      <td style={{ ...cellBody, color: colors.amber, fontWeight: 600 }}>{r.symbol}</td>
                      <td style={{ ...cellBody, textAlign: "right", color: r.ratePercent >= 0 ? colors.green : colors.red }}>
                        {r.ratePercent.toFixed(4)}%
                      </td>
                      <td style={{ ...cellBody, textAlign: "right", color: colors.txt4 }}>
                        {fmtTimeICT(r.ts)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </WsRow>
    </Workspace>
  );
}

const cellHeader: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 9,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: `1px solid ${colors.line}`,
  background: colors.bg1,
  position: "sticky",
  top: 0,
};

const cellBody: React.CSSProperties = {
  padding: "6px 10px",
  whiteSpace: "nowrap",
  color: colors.txt2,
};
