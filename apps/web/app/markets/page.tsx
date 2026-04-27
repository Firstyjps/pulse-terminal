"use client";

import { useState } from "react";
import { MarketsTable } from "../../components/MarketsTable";
import { CandlestickPanel } from "../../components/CandlestickPanel";

export default function MarketsPage() {
  const [symbol, setSymbol] = useState("BTC");
  const tradingPair = `${symbol}USDT`;

  return (
    <section style={{ paddingTop: 40 }}>
      <h2 style={{ fontSize: 28, marginBottom: 24, letterSpacing: "-0.01em" }}>
        Markets · Top 20
      </h2>

      <div style={{ marginBottom: 24 }}>
        <CandlestickPanel symbol={tradingPair} label={`${symbol} / USDT · Binance Spot`} />
      </div>

      <MarketsTable selectedSymbol={symbol} onSelect={setSymbol} />
    </section>
  );
}
