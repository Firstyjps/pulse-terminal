"use client";

import { Card, Pill } from "@pulse/ui";
import { formatUSD } from "@pulse/sources";
import type { PortfolioBalance } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

interface ApiResp {
  configured: boolean;
  message?: string;
  totalUsd?: number;
  balances?: PortfolioBalance[];
  ts?: number;
}

export function PortfolioPanel() {
  const { data, loading } = useFlow<ApiResp>("/api/portfolio");

  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
          Portfolio · Binance Spot
        </h3>
        {data?.configured && data.totalUsd !== undefined && (
          <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 14 }}>
            {formatUSD(data.totalUsd)}
          </span>
        )}
      </div>
      <Card>
        {loading && <p style={{ color: "#6b7280", fontSize: 12 }}>Loading…</p>}
        {data && !data.configured && (
          <div>
            <Pill tone="flat">NOT CONFIGURED</Pill>
            <p style={{ color: "#9ca3af", fontSize: 12, marginTop: 12, lineHeight: 1.5 }}>
              {data.message}<br />
              <strong>Use a read-only key</strong> — disable trading/withdrawal permissions in Binance API
              settings before pasting credentials.
            </p>
          </div>
        )}
        {data?.configured && data.balances && (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "JetBrains Mono, monospace" }}>
              <thead>
                <tr style={{ textAlign: "left", color: "#9ca3af", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
                  <th style={{ padding: "8px 12px" }}>Asset</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Free</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Locked</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Total</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>USD</th>
                  <th style={{ padding: "8px 12px", textAlign: "right" }}>Share</th>
                </tr>
              </thead>
              <tbody>
                {data.balances.slice(0, 25).map((b) => {
                  const share = data.totalUsd && b.usdValue ? (b.usdValue / data.totalUsd) * 100 : 0;
                  return (
                    <tr key={b.asset} style={{ borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                      <td style={{ padding: "8px 12px", fontWeight: 600 }}>{b.asset}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#9ca3af" }}>{b.free.toFixed(6)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#6b7280" }}>{b.locked.toFixed(6)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right" }}>{b.total.toFixed(6)}</td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#9ca3af" }}>
                        {b.usdValue ? formatUSD(b.usdValue) : "—"}
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "right", color: "#9ca3af" }}>
                        {share.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </section>
  );
}
