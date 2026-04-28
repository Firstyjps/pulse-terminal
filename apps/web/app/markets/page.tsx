"use client";

import { useState } from "react";
import { MarketsTable } from "../../components/MarketsTable";
import { CandlestickPanel } from "../../components/CandlestickPanel";
import { Pane } from "../../components/pane/Pane";
import { HSplit } from "../../components/pane/SplitLayout";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";

export default function MarketsPage() {
  const [symbol, setSymbol] = useState("BTC");
  const tradingPair = `${symbol}USDT`;

  return (
    <HSplit
      storageKey="markets-h"
      panes={[
        {
          size: 42,
          minSize: 28,
          content: (
            <Pane
              title="Top 20 Coins"
              meta={`selected · ${symbol}`}
              flush
            >
              <MarketsTable selectedSymbol={symbol} onSelect={setSymbol} />
            </Pane>
          ),
        },
        {
          size: 58,
          minSize: 30,
          content: (
            <Pane
              title={`${symbol} / USDT`}
              meta="Binance Spot · click row to switch"
              actions={<MCPQuickAsk endpoint={`/api/klines?symbol=${tradingPair}&interval=1h`} label="Ask Claude" />}
              flush
            >
              <div style={{ padding: 12, height: "100%" }}>
                <CandlestickPanel symbol={tradingPair} label={`${symbol} · 1h`} />
              </div>
            </Pane>
          ),
        },
      ]}
    />
  );
}
