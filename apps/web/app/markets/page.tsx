"use client";

import { useState } from "react";
import { Panel, WsRow, Workspace } from "@pulse/ui";
import { MarketsTable } from "../../components/MarketsTable";
import { CandlestickPanel } from "../../components/CandlestickPanel";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";
import { useIsMobile } from "../../lib/use-media";

/**
 * Markets — Bloomberg shell.
 *
 *   Row 1 (h-chart, 360px): MARKETS · Top 20 c-5 · CANDLESTICK c-7
 *   Row 2 (h-table, 340px): MARKETS · Full Top 20 list c-12  (desktop only —
 *     on mobile the c-5 table from Row 1 already covers full width via the
 *     12-col → 1-col collapse, so rendering it twice is just duplicate scroll.)
 */
export default function MarketsPage() {
  const [symbol, setSymbol] = useState("BTC");
  const tradingPair = `${symbol}USDT`;
  const isMobile = useIsMobile();

  return (
    <Workspace>
      <WsRow height="chart">
        <Panel
          span={5}
          title="MARKETS"
          badge="TOP 20"
          flush
        >
          <MarketsTable selectedSymbol={symbol} onSelect={setSymbol} />
        </Panel>
        <Panel
          span={7}
          title={`${symbol} / USDT`}
          badge="BINANCE SPOT"
          actions={<MCPQuickAsk endpoint={`/api/klines?symbol=${tradingPair}&interval=1h`} label="Ask Claude" />}
          flush
        >
          <CandlestickPanel symbol={tradingPair} label={`${symbol} · 1h candles`} hideControls={isMobile} />
        </Panel>
      </WsRow>

      {!isMobile && (
        <WsRow height="table">
          <Panel
            span={12}
            title={`${symbol} · DETAILED VIEW`}
            badge="CLICK ROW TO SWITCH"
            flush
          >
            <MarketsTable selectedSymbol={symbol} onSelect={setSymbol} />
          </Panel>
        </WsRow>
      )}
    </Workspace>
  );
}
