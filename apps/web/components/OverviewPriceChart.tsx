"use client";

import { useEffect, useRef, useState } from "react";
import { Candlestick, type Candle } from "@pulse/charts";
import { colors, fonts } from "@pulse/ui";

const TIMEFRAMES = [
  { id: "1H",  interval: "1m",  limit: 60  },
  { id: "24H", interval: "15m", limit: 96  },
  { id: "7D",  interval: "1h",  limit: 168 },
  { id: "30D", interval: "4h",  limit: 180 },
  { id: "1Y",  interval: "1d",  limit: 365 },
] as const;
type Tf = (typeof TIMEFRAMES)[number]["id"];

const COINS = [
  { id: "BTCUSDT",  label: "BTC" },
  { id: "ETHUSDT",  label: "ETH" },
  { id: "SOLUSDT",  label: "SOL" },
  { id: "BNBUSDT",  label: "BNB" },
  { id: "XRPUSDT",  label: "XRP" },
  { id: "DOGEUSDT", label: "DOGE" },
  { id: "ADAUSDT",  label: "ADA" },
  { id: "AVAXUSDT", label: "AVAX" },
  { id: "LINKUSDT", label: "LINK" },
];

/**
 * OverviewPriceChart — handoff Row 2 left c-8 (360px panel row).
 *
 *   Sub-header: symbol picker + interval label + tf segmented control (1H..1Y)
 *   Body: Lightweight Charts Candlestick, height computed via ResizeObserver
 *   so it fills the panel body exactly (Candlestick has a fixed `height` prop
 *   that doesn't auto-flex on its own).
 */
export function OverviewPriceChart() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [tf, setTf] = useState<Tf>("24H");
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(300);

  // Measure body height for the chart so it fills the panel without overflow.
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const h = Math.floor(entries[0].contentRect.height);
      if (h > 80) setBodyHeight(h);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  const config = TIMEFRAMES.find((t) => t.id === tf)!;

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
          height: 28,
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
        <span>{config.limit}× {config.interval} CANDLES</span>

        <span style={{ marginLeft: "auto", display: "inline-flex", border: `1px solid ${colors.line2}` }}>
          {TIMEFRAMES.map((t, i) => {
            const active = tf === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTf(t.id)}
                style={{
                  background: active ? colors.amber : "transparent",
                  border: "none",
                  borderRight: i < TIMEFRAMES.length - 1 ? `1px solid ${colors.line2}` : "none",
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

      {/* chart body — measured by ResizeObserver so Candlestick fills exactly */}
      <div ref={bodyRef} style={{ flex: 1, minHeight: 0, position: "relative" }}>
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
          <Candlestick data={data} height={bodyHeight} />
        )}
      </div>
    </div>
  );
}
