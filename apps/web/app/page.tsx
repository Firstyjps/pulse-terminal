"use client";

import { useState } from "react";
import { Panel, WsRow, Workspace } from "@pulse/ui";
import { MetricStrip } from "../components/MetricStrip";
import { MoversTable } from "../components/MoversTable";
import { AssetInspector } from "../components/AssetInspector";
import { FearGreedGauge } from "../components/FearGreedGauge";
import { AlertsFeed } from "../components/AlertsFeed";
import { MacroOverlay } from "../components/MacroOverlay";
import { FundingHeatmapMini } from "../components/FundingHeatmapMini";
import { OverviewPriceChart } from "../components/OverviewPriceChart";
import { MCPQuickAsk } from "../components/MCPQuickAsk";

/**
 * Overview — 5 ws-rows stacked vertically.
 *
 *   Row 1 (h-stats, ≥96px):  MARKET PULSE — c-12 stats grid (6 tiles)
 *   Row 2 (h-chart, 360px):  PRICE CHART c-8 · FEAR & GREED c-4
 *   Row 3 (h-table, 340px):  TOP MOVERS c-8 · ASSET INSPECTOR c-4
 *   Row 4 (h-feed, 280px):   MACRO OVERLAY c-7 · FUNDING RATES c-5
 *   Row 5 (auto, 220px):     LIVE ANOMALY FEED c-12 (full-width strip at bottom)
 */
export default function OverviewPage() {
  const [activeId, setActiveId] = useState<string>("bitcoin");
  const [query, setQuery] = useState("");

  return (
    <Workspace>
      {/* Row 1 — Market Pulse stats */}
      <WsRow height="stats">
        <Panel
          span={12}
          title="MARKET PULSE"
          badge="GLOBAL"
          actions={<MCPQuickAsk endpoint="/api/snapshot" label="Ask Claude" />}
          flush
        >
          <MetricStrip />
        </Panel>
      </WsRow>

      {/* Row 2 — Chart + Fear & Greed */}
      <WsRow height="chart">
        <Panel span={8} title="PRICE CHART" badge="LIVE" flush scrollable={false}>
          <OverviewPriceChart />
        </Panel>
        <Panel span={4} title="FEAR & GREED INDEX" badge="SENTIMENT">
          <FearGreedGauge />
        </Panel>
      </WsRow>

      {/* Row 3 — Movers + Inspector */}
      <WsRow height="table">
        <Panel
          span={8}
          title="TOP MOVERS"
          badge="20 ASSETS"
          actions={<SearchInput value={query} onChange={setQuery} />}
          flush
        >
          <MoversTable activeId={activeId} onPick={setActiveId} query={query} setQuery={setQuery} />
        </Panel>
        <Panel span={4} title="ASSET INSPECTOR" badge={activeId ? activeId.toUpperCase() : "—"} flush>
          <AssetInspector activeId={activeId} />
        </Panel>
      </WsRow>

      {/* Row 4 — Macro + Funding (bigger Macro, narrower Funding) */}
      <WsRow height="feed">
        <Panel span={7} title="MACRO OVERLAY" badge="DXY·SPX·GLD" flush>
          <MacroOverlay />
        </Panel>
        <Panel span={5} title="FUNDING RATES" badge="PERP · 4 VENUES" flush>
          <FundingHeatmapMini />
        </Panel>
      </WsRow>

      {/* Row 5 — Live Anomaly Feed (full-width strip at the bottom) */}
      <WsRow height="auto" style={{ minHeight: 220 }}>
        <Panel
          span={12}
          title="LIVE ANOMALY FEED"
          badge={<span><span className="blink up">●</span> STREAMING</span>}
          flush
        >
          <AlertsFeed embed="strip" />
        </Panel>
      </WsRow>
    </Workspace>
  );
}

function SearchInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <input
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder="search asset…"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--line-2)",
        color: "var(--fg)",
        fontFamily: "inherit",
        fontSize: 10,
        padding: "1px 6px",
        width: 130,
        outline: "none",
      }}
    />
  );
}
