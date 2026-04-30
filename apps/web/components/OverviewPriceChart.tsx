"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { PriceLine, type PriceLinePoint } from "@pulse/charts";
import { colors, fonts } from "@pulse/ui";

interface RawCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

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
  const [data, setData] = useState<RawCandle[]>([]);
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

  // Reduce candles → close-only points; line chart uses close + volume only.
  const linePoints = useMemo<PriceLinePoint[]>(
    () => data.map((d) => ({ time: d.time, value: d.close, volume: d.volume })),
    [data],
  );

  // Track popup windows so we can broadcast symbol/tf changes + close on parent unload
  const popupsRef = useRef<Window[]>([]);
  function popoutChart() {
    if (typeof window === "undefined") return;
    const w = window.open(
      `/chart-popup?symbol=${symbol}&tf=${tf}&type=line`,
      `pulse_chart_${symbol}_${Date.now()}`,
      "width=900,height=600,resizable=yes",
    );
    if (w) popupsRef.current.push(w);
  }
  // Broadcast updates whenever the parent flips symbol/tf so synced popups follow.
  useEffect(() => {
    for (const popup of popupsRef.current) {
      try {
        if (!popup.closed) {
          popup.postMessage({ type: "pulse:chart-popup-update", symbol, tf }, "*");
        }
      } catch { /* ignore */ }
    }
  }, [symbol, tf]);
  // Close popups when parent unloads
  useEffect(() => {
    const onUnload = () => {
      for (const p of popupsRef.current) {
        try { if (!p.closed) p.close(); } catch { /* ignore */ }
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);

  // Headline price + 24h change
  const last = data[data.length - 1];
  const first = data[0];
  const lastPrice = last?.close;
  const firstPrice = first?.close;
  const change = lastPrice != null && firstPrice != null && firstPrice > 0
    ? ((lastPrice - firstPrice) / firstPrice) * 100
    : null;
  const changeColor = change == null ? colors.txt3 : change >= 0 ? colors.green : colors.red;

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
        <span>{config.limit}× {config.interval}</span>

        {lastPrice != null && (
          <>
            <span style={{ color: colors.txt4 }}>·</span>
            <span className="mono-num" style={{ color: colors.txt1, fontSize: 11, fontWeight: 600 }}>
              {fmtPrice(lastPrice)}
            </span>
            {change != null && (
              <span
                className="mono-num"
                style={{
                  color: changeColor,
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: 0,
                }}
              >
                {change >= 0 ? "+" : ""}{change.toFixed(2)}%
              </span>
            )}
          </>
        )}

        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6, alignItems: "center" }}>
          <span style={{ display: "inline-flex", border: `1px solid ${colors.line2}` }}>
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
          <button
            type="button"
            onClick={popoutChart}
            title="Pop out into a separate window"
            style={{
              background: "transparent",
              border: `1px solid ${colors.line2}`,
              color: colors.txt2,
              fontFamily: "inherit",
              fontSize: 11,
              padding: "1px 7px",
              cursor: "pointer",
              lineHeight: 1.2,
            }}
          >
            🪟
          </button>
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
          <PriceLine
            data={linePoints}
            height={bodyHeight}
            color={change == null ? colors.amber : change >= 0 ? colors.green : colors.red}
            filled
            showVolume
          />
        )}
      </div>
    </div>
  );
}

function fmtPrice(v: number): string {
  if (v >= 1000) return v.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (v >= 1)    return v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return v.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
