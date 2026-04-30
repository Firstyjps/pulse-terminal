"use client";

import { Panel, WsRow, Workspace } from "@pulse/ui";
import { OnChainMetricsPanel } from "../../components/OnChainMetrics";
import { NewsFeed } from "../../components/NewsFeed";
import { WhaleAlerts } from "../../components/WhaleAlerts";
import { SocialBuzz } from "../../components/SocialBuzz";

/**
 * Intel — Phase 5 Intelligence & Analytics consolidation page.
 *
 *   Row 1 (h-stats, ≥96px):  ON-CHAIN METRICS — c-12 (5 mini-cards)
 *   Row 2 (h-feed, 320px):   NEWS FEED c-7 + WHALE ALERTS c-5
 *   Row 3 (h-table, 360px):  SOCIAL BUZZ c-12
 */
export default function IntelPage() {
  return (
    <Workspace>
      <WsRow height="stats">
        <Panel span={12} title="ON-CHAIN METRICS" badge="BTC NETWORK · 10M REVALIDATE" flush>
          <OnChainMetricsPanel />
        </Panel>
      </WsRow>

      <WsRow height="feed">
        <Panel
          span={7}
          title="MARKET NEWS"
          badge="CRYPTOPANIC · 5M REVALIDATE"
          flush
        >
          <NewsFeed />
        </Panel>
        <Panel
          span={5}
          title="WHALE ALERTS"
          badge={<span><span className="blink up">●</span> MEMPOOL</span>}
          flush
        >
          <WhaleAlerts />
        </Panel>
      </WsRow>

      <WsRow height="table">
        <Panel
          span={12}
          title="SOCIAL BUZZ"
          badge="REDDIT · 24H · 15M REVALIDATE"
          flush
        >
          <SocialBuzz />
        </Panel>
      </WsRow>
    </Workspace>
  );
}
