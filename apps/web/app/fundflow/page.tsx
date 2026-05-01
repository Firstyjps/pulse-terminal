"use client";

import { useState } from "react";
import { Panel, WsRow, Workspace, colors, fonts } from "@pulse/ui";
import { FlowAreaChart, FlowBarChart } from "@pulse/charts";
import { formatUSD, formatPercent } from "@pulse/sources";
import type {
  StablecoinFlow,
  ETFFlowResponse,
  TvlResponse,
  DexVolumeResponse,
  FuturesResponse,
} from "@pulse/sources";
import { useFlow } from "../../lib/use-flow";
import { MetricStrip } from "../../components/MetricStrip";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";

/**
 * Fundflow — Bloomberg shell.
 *
 *   Row 1 (h-stats, 96px):  MARKET PULSE c-12
 *   Row 2 (h-chart, 360px): STABLECOINS c-8 + DOMINANCE c-4
 *   Row 3 (h-chart, 360px): BTC ETF c-6 + ETH ETF c-6
 *   Row 4 (h-chart, 360px): FUTURES BTC c-6 + FUTURES ETH c-6
 *   Row 5 (h-chart, 360px): TVL c-8 + TOP CHAINS c-4
 *   Row 6 (h-chart, 360px): DEX VOLUME c-12
 */
export default function FundflowPage() {
  const [refresh, setRefresh] = useState(0);
  const stablecoins = useFlow<StablecoinFlow>("/api/flows/stablecoins", refresh);
  const etf = useFlow<ETFFlowResponse>("/api/flows/etf", refresh);
  const tvl = useFlow<TvlResponse>("/api/flows/tvl", refresh);
  const dex = useFlow<DexVolumeResponse>("/api/flows/dex", refresh);
  const futures = useFlow<FuturesResponse>("/api/flows/futures", refresh);

  const refreshBtn = (
    <button
      onClick={() => setRefresh((r) => r + 1)}
      style={{
        background: colors.bg1,
        border: `1px solid ${colors.line2}`,
        color: colors.amber,
        padding: "2px 10px",
        fontFamily: fonts.mono,
        fontSize: 9,
        letterSpacing: "0.08em",
        cursor: "pointer",
        textTransform: "uppercase",
      }}
    >
      ↻ REFRESH
    </button>
  );

  return (
    <Workspace>
      <WsRow height="stats">
        <Panel span={12} title="MARKET PULSE" badge="GLOBAL" actions={refreshBtn} flush>
          <MetricStrip refreshKey={refresh} />
        </Panel>
      </WsRow>

      <WsRow height="chart">
        <Panel
          span={8}
          title="STABLECOINS · DRY POWDER"
          badge={
            stablecoins.data
              ? `7d ${formatUSD(stablecoins.data.summary.change7d)} (${formatPercent(stablecoins.data.summary.change7dPercent)})`
              : "LOADING"
          }
          actions={<MCPQuickAsk endpoint="/api/flows/stablecoins" label="Ask Claude" />}
        >
          {stablecoins.data ? (
            <FlowAreaChart
              data={stablecoins.data.history.map((p) => ({ date: p.date, value: p.totalCirculating }))}
              color={colors.green}
              label="Stablecoin supply"
            />
          ) : (
            <p style={{ color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>
              {stablecoins.loading ? "Loading…" : stablecoins.error ?? "No data"}
            </p>
          )}
        </Panel>
        <Panel span={4} title="TOP 6 DOMINANCE" badge="STABLES">
          <div style={{ display: "flex", flexDirection: "column", gap: 8, fontFamily: fonts.mono }}>
            {stablecoins.data?.summary.dominance.map((d) => (
              <div key={d.name} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 56, fontSize: 11, color: colors.amber, fontWeight: 600 }}>{d.name}</span>
                <div style={{ flex: 1, height: 4, background: colors.bg2 }}>
                  <div style={{ height: "100%", width: `${Math.min(100, d.pct)}%`, background: colors.amber }} />
                </div>
                <span style={{ width: 50, textAlign: "right", fontSize: 10, color: colors.txt3 }}>
                  {d.pct.toFixed(1)}%
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </WsRow>

      <WsRow height="chart">
        <Panel
          span={6}
          title="BITCOIN ETF FLOWS"
          badge={
            etf.data
              ? `7d ${formatUSD(etf.data.summary.btc7dSum)} · cum ${formatUSD(etf.data.summary.btcCumulative)}`
              : "LOADING"
          }
        >
          {etf.data && (() => {
            const window28 = etf.data.flows.slice(-28);
            const startCum = window28[0]?.btcCumulative ?? 0;
            return (
              <FlowBarChart
                cumulativeLabel="28D Δ"
                data={window28.map((f) => ({
                  date: f.date,
                  value: f.btc,
                  cumulative: (f.btcCumulative ?? 0) - startCum,
                }))}
              />
            );
          })()}
          {etf.data?._isProxy && (
            <p style={{ marginTop: 8, fontSize: 10, color: colors.amber, fontFamily: fonts.mono }}>
              ⚠ Proxy data — Farside scrape unavailable
            </p>
          )}
        </Panel>
        <Panel
          span={6}
          title="ETHEREUM ETF FLOWS"
          badge={
            etf.data
              ? `7d ${formatUSD(etf.data.summary.eth7dSum)} · cum ${formatUSD(etf.data.summary.ethCumulative)}`
              : "LOADING"
          }
        >
          {etf.data && (() => {
            const window28 = etf.data.flows.slice(-28);
            const startCum = window28[0]?.ethCumulative ?? 0;
            return (
              <FlowBarChart
                cumulativeLabel="28D Δ"
                data={window28.map((f) => ({
                  date: f.date,
                  value: f.eth,
                  cumulative: (f.ethCumulative ?? 0) - startCum,
                }))}
              />
            );
          })()}
        </Panel>
      </WsRow>

      <WsRow height="chart">
        {(["btc", "eth"] as const).map((s) => {
          const f = futures.data?.[s];
          return (
            <Panel
              key={s}
              span={6}
              title={`${s.toUpperCase()} PERP`}
              badge={
                f ? (
                  <span>
                    {formatUSD(f.price, { compact: false, decimals: 0 })}{" "}
                    <span style={{ color: f.priceChange24h >= 0 ? colors.green : colors.red }}>
                      {formatPercent(f.priceChange24h)}
                    </span>
                  </span>
                ) : "LOADING"
              }
            >
              {f ? (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: colors.line, fontFamily: fonts.mono }}>
                  <FuturesCell label="OI" value={formatUSD(f.openInterest)} />
                  <FuturesCell
                    label="Funding"
                    value={`${f.fundingRate.toFixed(4)}%`}
                    valueColor={f.fundingRate >= 0 ? colors.green : colors.red}
                  />
                  <FuturesCell label="L/S" value={f.longShortRatio.toFixed(2)} />
                </div>
              ) : (
                <p style={{ color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>Loading…</p>
              )}
            </Panel>
          );
        })}
      </WsRow>

      <WsRow height="chart">
        <Panel
          span={8}
          title="DEFI TVL"
          badge={
            tvl.data
              ? `1d ${formatPercent(tvl.data.summary.change1d)} · 7d ${formatPercent(tvl.data.summary.change7d)} · 30d ${formatPercent(tvl.data.summary.change30d)}`
              : "LOADING"
          }
        >
          {tvl.data && (
            <FlowAreaChart
              data={tvl.data.history.map((p) => ({ date: p.date, value: p.tvl }))}
              color={colors.cyan}
              label="DeFi TVL"
            />
          )}
        </Panel>
        <Panel span={4} title="TOP CHAINS" badge="TVL">
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              fontFamily: fonts.mono,
              height: "100%",
              minHeight: 0,
            }}
          >
            {tvl.data?.byChain.slice(0, 8).map((c, idx, arr) => (
              <div
                key={c.name}
                style={{
                  flex: 1,
                  minHeight: 0,
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  alignItems: "center",
                  gap: 12,
                  padding: "0 4px",
                  fontSize: 11,
                  borderBottom:
                    idx === arr.length - 1 ? "none" : `1px dashed ${colors.line}`,
                }}
              >
                <span style={{ color: colors.amber, fontWeight: 600 }}>{c.name}</span>
                <span style={{ color: colors.txt3 }}>{formatUSD(c.tvl, { compact: true, decimals: 1 })}</span>
                <span
                  style={{
                    color: c.change7d >= 0 ? colors.green : colors.red,
                    width: 56,
                    textAlign: "right",
                  }}
                >
                  {formatPercent(c.change7d)}
                </span>
              </div>
            ))}
          </div>
        </Panel>
      </WsRow>

      <WsRow height="chart">
        <Panel
          span={12}
          title="DEX VOLUME"
          badge={
            dex.data
              ? `24h ${formatUSD(dex.data.summary.total24h)} (${formatPercent(dex.data.summary.change24h)})`
              : "LOADING"
          }
        >
          {dex.data && (
            <FlowAreaChart
              data={dex.data.history.map((p) => ({ date: p.date, value: p.volume }))}
              color={colors.orange}
              label="DEX volume"
              height={220}
            />
          )}
        </Panel>
      </WsRow>
    </Workspace>
  );
}

function FuturesCell({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <div style={{ background: colors.bg1, padding: "8px 10px" }}>
      <div
        style={{
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.txt3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 500,
          marginTop: 2,
          color: valueColor ?? colors.txt1,
          letterSpacing: "-0.01em",
        }}
      >
        {value}
      </div>
    </div>
  );
}
