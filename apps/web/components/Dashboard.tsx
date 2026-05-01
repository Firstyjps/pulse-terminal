"use client";

import { useState } from "react";
import { Card, Pill } from "@pulse/ui";
import { FlowAreaChart, FlowBarChart } from "@pulse/charts";
import { formatUSD, formatPercent } from "@pulse/sources";
import type {
  StablecoinFlow,
  ETFFlowResponse,
  TvlResponse,
  DexVolumeResponse,
  FuturesResponse,
} from "@pulse/sources";
import { useFlow } from "../lib/use-flow";
import { MetricStrip } from "./MetricStrip";

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginTop: 48 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 20, color: "#f2f4f8", letterSpacing: "-0.01em" }}>{title}</h3>
        {subtitle && (
          <span style={{ fontSize: 12, color: "#9ca3af", fontFamily: "JetBrains Mono, monospace" }}>{subtitle}</span>
        )}
        <div style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.06)", marginLeft: 8 }} />
      </div>
      {children}
    </div>
  );
}

export function Dashboard() {
  const [refresh, setRefresh] = useState(0);
  const stablecoins = useFlow<StablecoinFlow>("/api/flows/stablecoins", refresh);
  const etf = useFlow<ETFFlowResponse>("/api/flows/etf", refresh);
  const tvl = useFlow<TvlResponse>("/api/flows/tvl", refresh);
  const dex = useFlow<DexVolumeResponse>("/api/flows/dex", refresh);
  const futures = useFlow<FuturesResponse>("/api/flows/futures", refresh);

  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: 28, letterSpacing: "-0.01em" }}>Fundflow</h2>
        <button
          onClick={() => setRefresh((r) => r + 1)}
          style={{
            background: "transparent",
            border: "1px solid rgba(255,255,255,0.1)",
            borderRadius: 8,
            color: "#f2f4f8",
            padding: "6px 14px",
            fontSize: 12,
            cursor: "pointer",
            fontFamily: "JetBrains Mono, monospace",
          }}
        >
          REFRESH
        </button>
      </div>

      <MetricStrip refreshKey={refresh} />

      <Section
        title="Stablecoins · Dry Powder"
        subtitle={
          stablecoins.data
            ? `${formatUSD(stablecoins.data.summary.change7d)} over 7d (${formatPercent(stablecoins.data.summary.change7dPercent)})`
            : undefined
        }
      >
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <Card>
            {stablecoins.data ? (
              <FlowAreaChart
                data={stablecoins.data.history.map((p) => ({ date: p.date, value: p.totalCirculating }))}
                color="#34d399"
                label="Stablecoin supply"
              />
            ) : (
              <p style={{ color: "#6b7280" }}>{stablecoins.loading ? "Loading…" : stablecoins.error ?? "No data"}</p>
            )}
          </Card>
          <Card>
            <h4 style={{ margin: "0 0 12px", fontSize: 12, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
              Top 6 Dominance
            </h4>
            {stablecoins.data?.summary.dominance.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                <span style={{ width: 56, fontFamily: "JetBrains Mono, monospace", fontSize: 12 }}>{d.name}</span>
                <div style={{ flex: 1, height: 4, background: "rgba(255,255,255,0.05)", borderRadius: 2 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, d.pct)}%`, background: "#7c5cff", borderRadius: 2 }} />
                </div>
                <span style={{ fontFamily: "JetBrains Mono, monospace", fontSize: 11, color: "#9ca3af", width: 56, textAlign: "right" }}>
                  {d.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </Card>
        </div>
      </Section>

      <Section
        title="Spot ETF · Institutional Flows"
        subtitle={etf.data?._isProxy ? "Proxy data — Farside scrape unavailable" : undefined}
      >
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <Card>
            <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <Pill tone="btc">BITCOIN ETF</Pill>
              {etf.data && (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  7d {formatUSD(etf.data.summary.btc7dSum)} · cum {formatUSD(etf.data.summary.btcCumulative)}
                </span>
              )}
            </div>
            {etf.data && (
              <FlowBarChart
                data={etf.data.flows.map((f) => ({ date: f.date, value: f.btc, cumulative: f.btcCumulative }))}
              />
            )}
          </Card>
          <Card>
            <div style={{ marginBottom: 8, display: "flex", alignItems: "center", gap: 8 }}>
              <Pill tone="eth">ETHEREUM ETF</Pill>
              {etf.data && (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  7d {formatUSD(etf.data.summary.eth7dSum)} · cum {formatUSD(etf.data.summary.ethCumulative)}
                </span>
              )}
            </div>
            {etf.data && (
              <FlowBarChart
                data={etf.data.flows.map((f) => ({ date: f.date, value: f.eth, cumulative: f.ethCumulative }))}
              />
            )}
          </Card>
        </div>
      </Section>

      <Section title="Derivatives · Leverage & Sentiment">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {(["btc", "eth"] as const).map((s) => {
            const f = futures.data?.[s];
            return (
              <Card key={s}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                  <Pill tone={s}>{s.toUpperCase()} PERP</Pill>
                  {f && <span style={{ fontSize: 16, fontFamily: "JetBrains Mono, monospace" }}>${f.price.toLocaleString()}</span>}
                  {f && (
                    <Pill tone={f.priceChange24h >= 0 ? "up" : "down"}>{formatPercent(f.priceChange24h)}</Pill>
                  )}
                </div>
                {f && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, fontSize: 12 }}>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>OI</div>
                      <div style={{ fontFamily: "JetBrains Mono, monospace" }}>{formatUSD(f.openInterest)}</div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>Funding</div>
                      <div style={{ fontFamily: "JetBrains Mono, monospace", color: f.fundingRate >= 0 ? "#34d399" : "#f87171" }}>
                        {f.fundingRate.toFixed(4)}%
                      </div>
                    </div>
                    <div>
                      <div style={{ color: "#6b7280", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase" }}>L/S</div>
                      <div style={{ fontFamily: "JetBrains Mono, monospace" }}>{f.longShortRatio.toFixed(2)}</div>
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      </Section>

      <Section
        title="DeFi · TVL & DEX Activity"
        subtitle={tvl.data ? `1d ${formatPercent(tvl.data.summary.change1d)} · 7d ${formatPercent(tvl.data.summary.change7d)} · 30d ${formatPercent(tvl.data.summary.change30d)}` : undefined}
      >
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 16 }}>
          <Card>
            {tvl.data && (
              <FlowAreaChart
                data={tvl.data.history.map((p) => ({ date: p.date, value: p.tvl }))}
                color="#22d3ee"
                label="DeFi TVL"
              />
            )}
          </Card>
          <Card>
            <h4 style={{ margin: "0 0 12px", fontSize: 12, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
              Top Chains
            </h4>
            {tvl.data?.byChain.slice(0, 8).map((c) => (
              <div key={c.name} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontSize: 12, fontFamily: "JetBrains Mono, monospace", borderBottom: "1px solid rgba(255,255,255,0.04)" }}>
                <span>{c.name}</span>
                <span style={{ color: "#9ca3af" }}>{formatUSD(c.tvl)}</span>
                <span style={{ width: 70, textAlign: "right", color: c.change7d >= 0 ? "#34d399" : "#f87171" }}>
                  {formatPercent(c.change7d)}
                </span>
              </div>
            ))}
          </Card>
        </div>

        <div style={{ marginTop: 16 }}>
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
              <h4 style={{ margin: 0, fontSize: 12, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
                DEX Volume
              </h4>
              {dex.data && (
                <span style={{ fontSize: 11, color: "#9ca3af" }}>
                  24h {formatUSD(dex.data.summary.total24h)} ({formatPercent(dex.data.summary.change24h)})
                </span>
              )}
            </div>
            {dex.data && (
              <FlowAreaChart
                data={dex.data.history.map((p) => ({ date: p.date, value: p.volume }))}
                color="#fb923c"
                label="DEX volume"
                height={220}
              />
            )}
          </Card>
        </div>
      </Section>
    </div>
  );
}
