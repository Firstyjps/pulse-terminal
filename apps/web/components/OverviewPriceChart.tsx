"use client";

import { useEffect, useState } from "react";
import { Candlestick, type Candle } from "@pulse/charts";
import { colors, fonts } from "@pulse/ui";

const TIMEFRAMES = [
  { id: "1H", interval: "5m",  limit: 12 },
  { id: "24H", interval: "1h",  limit: 24 },
  { id: "7D",  interval: "4h",  limit: 42 },
  { id: "30D", interval: "1d",  limit: 30 },
  { id: "1Y",  interval: "1d", limit: 365 },
] as const;
type Tf = (typeof TIMEFRAMES)[number]["id"];

const COINS = [
  { id: "BTCUSDT", label: "BTC" },
  { id: "ETHUSDT", label: "ETH" },
  { id: "SOLUSDT", label: "SOL" },
  { id: "BNBUSDT", label: "BNB" },
  { id: "XRPUSDT", label: "XRP" },
  { id: "DOGEUSDT", label: "DOGE" },
  { id: "ADAUSDT", label: "ADA" },
  { id: "AVAXUSDT", label: "AVAX" },
  { id: "LINKUSDT", label: "LINK" },
];

/**
 * OverviewPriceChart — handoff Row 2 left c-8 (360px).
 * Symbol picker + segmented timeframe control + Candlestick (Lightweight Charts).
 */
export function OverviewPriceChart() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [tf, setTf] = useState<Tf>("24H");
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const config = TIMEFRAMES.find((t) => t.id === tf)!;
    fetch(`/api/klines?symbol=${symbol}&interval=${config.interval}&limit=${config.limit}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (Array.isArray(j)) setData(j);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setData([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [symbol, tf]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* sub-header (controls) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "4px 8px",
          borderBottom: `1px solid ${colors.line}`,
          fontFamily: fonts.mono,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.txt3,
          flexShrink: 0,
        }}
      >
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{
            background: colors.bg2,
            border: `1px solid ${colors.line2}`,
            color: colors.amber,
            fontFamily: "inherit",
            fontSize: 10,
            padding: "1px 6px",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {COINS.map((c) => (
            <option key={c.id} value={c.id} style={{ background: colors.bg1, color: colors.amber }}>
              {c.label}/USD
            </option>
          ))}
        </select>

        <span style={{ color: colors.txt4 }}>·</span>
        <span>{TIMEFRAMES.find((t) => t.id === tf)?.interval} candles</span>

        <span style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${colors.line2}` }}>
          {TIMEFRAMES.map((t) => {
            const active = tf === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTf(t.id)}
                style={{
                  background: active ? colors.amber : "transparent",
                  border: "none",
                  borderRight: t.id !== TIMEFRAMES[TIMEFRAMES.length - 1].id
                    ? `1px solid ${colors.line2}` : "none",
                  color: active ? "#000" : colors.txt3,
                  fontFamily: "inherit",
                  fontSize: 9,
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontWeight: active ? 600 : 400,
                }}
              >
                {t.id}
              </button>
            );
          })}
        </span>
      </div>

      {/* chart body */}
      <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
        {loading && data.length === 0 ? (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontFamily: fonts.mono,
              fontSize: 10,
              color: colors.txt3,
            }}
          >
            <span className="blink">▒ AWAITING FEED ▒</span>
          </div>
        ) : (
          <Candlestick data={data} />
        )}
      </div>
    </div>
  );
}
