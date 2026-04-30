"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PriceLine, Candlestick, type PriceLinePoint, type Candle } from "@pulse/charts";
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
  "BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT",
  "DOGEUSDT", "ADAUSDT", "AVAXUSDT", "LINKUSDT",
];

type ChartType = "line" | "candle";

interface ParentMessage {
  type: "pulse:chart-popup-update";
  symbol?: string;
  tf?: Tf;
}

/**
 * Standalone chart popup — opened by the OverviewPriceChart 🪟 button.
 *
 * Reads ?symbol=BTCUSDT&tf=24H&type=line from the URL on mount, then listens
 * for postMessage updates from window.opener so that changing the symbol on
 * the parent flips the popup too. Fetches its own data from /api/klines (the
 * popup is a real Next page so it has full session access).
 */
export default function ChartPopupPage() {
  return (
    <Suspense fallback={null}>
      <ChartPopupBody />
    </Suspense>
  );
}

function ChartPopupBody() {
  const params = useSearchParams();
  const initialSymbol = (params.get("symbol") ?? "BTCUSDT").toUpperCase();
  const initialTf = (params.get("tf") ?? "24H") as Tf;
  const initialType = (params.get("type") ?? "line") as ChartType;

  const [symbol, setSymbol] = useState(initialSymbol);
  const [tf, setTf] = useState<Tf>(initialTf);
  const [chartType, setChartType] = useState<ChartType>(initialType);
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyHeight, setBodyHeight] = useState(360);

  // Listen for parent updates
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      const msg = e.data as ParentMessage | null;
      if (!msg || msg.type !== "pulse:chart-popup-update") return;
      if (msg.symbol) setSymbol(msg.symbol);
      if (msg.tf) setTf(msg.tf);
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  // Auto-close when parent unloads
  useEffect(() => {
    if (typeof window === "undefined") return;
    const opener = window.opener as Window | null;
    if (!opener) return;
    const checkOpener = setInterval(() => {
      try {
        if (opener.closed) {
          window.close();
        }
      } catch {
        // Cross-origin throws — assume parent gone
        window.close();
      }
    }, 2_000);
    return () => clearInterval(checkOpener);
  }, []);

  // Resize observer for chart height
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

  // Self-poll every 30s + on params change
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
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
  }, [symbol, tf, tick]);

  const config = TIMEFRAMES.find((t) => t.id === tf)!;
  const linePoints = useMemo<PriceLinePoint[]>(
    () => data.map((d) => ({ time: d.time, value: d.close, volume: d.volume })),
    [data],
  );

  const last = data[data.length - 1];
  const first = data[0];
  const change =
    last && first && first.close > 0
      ? ((last.close - first.close) / first.close) * 100
      : null;
  const changeColor = change == null ? colors.txt3 : change >= 0 ? colors.green : colors.red;

  function popoutAnother() {
    if (typeof window === "undefined") return;
    window.open(
      `/chart-popup?symbol=${symbol}&tf=${tf}&type=${chartType}`,
      `pulse_chart_${symbol}_${Date.now()}`,
      "width=900,height=600,resizable=yes",
    );
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        background: colors.bg0,
        color: colors.txt1,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          background: colors.bg1,
          borderBottom: `1px solid ${colors.line}`,
          fontFamily: fonts.mono,
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.txt3,
          height: 36,
          flexShrink: 0,
        }}
      >
        <span style={{ background: colors.amber, color: "#000", padding: "2px 8px", fontWeight: 700, letterSpacing: "0.12em" }}>
          ◆ POPUP
        </span>
        <select
          value={symbol}
          onChange={(e) => setSymbol(e.target.value)}
          style={{
            background: colors.bg2,
            border: `1px solid ${colors.line2}`,
            color: colors.amber,
            fontFamily: "inherit",
            fontSize: 11,
            padding: "2px 8px",
            outline: "none",
            cursor: "pointer",
          }}
        >
          {COINS.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span style={{ color: colors.txt4 }}>·</span>
        <span>{config.limit}× {config.interval}</span>
        {last && (
          <>
            <span style={{ color: colors.txt4 }}>·</span>
            <span className="mono-num" style={{ color: colors.txt1, fontSize: 12, fontWeight: 600 }}>
              {fmtPrice(last.close)}
            </span>
            {change != null && (
              <span className="mono-num" style={{ color: changeColor, fontSize: 11, fontWeight: 600 }}>
                {change >= 0 ? "+" : ""}{change.toFixed(2)}%
              </span>
            )}
          </>
        )}
        <span style={{ marginLeft: "auto", display: "inline-flex", gap: 6 }}>
          <span style={{ display: "inline-flex", border: `1px solid ${colors.line2}` }}>
            {(["line", "candle"] as ChartType[]).map((t) => (
              <button
                key={t}
                onClick={() => setChartType(t)}
                style={{
                  background: chartType === t ? colors.amber : "transparent",
                  border: "none",
                  color: chartType === t ? "#000" : colors.txt3,
                  fontFamily: "inherit",
                  fontSize: 9,
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontWeight: chartType === t ? 700 : 400,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {t}
              </button>
            ))}
          </span>
          <span style={{ display: "inline-flex", border: `1px solid ${colors.line2}` }}>
            {TIMEFRAMES.map((t, i) => (
              <button
                key={t.id}
                onClick={() => setTf(t.id)}
                style={{
                  background: tf === t.id ? colors.amber : "transparent",
                  border: "none",
                  borderRight: i < TIMEFRAMES.length - 1 ? `1px solid ${colors.line2}` : "none",
                  color: tf === t.id ? "#000" : colors.txt3,
                  fontFamily: "inherit",
                  fontSize: 9,
                  padding: "2px 8px",
                  cursor: "pointer",
                  fontWeight: tf === t.id ? 700 : 400,
                  letterSpacing: "0.08em",
                }}
              >
                {t.id}
              </button>
            ))}
          </span>
          <button
            onClick={popoutAnother}
            title="Open another popup"
            style={{
              background: "transparent",
              border: `1px solid ${colors.line2}`,
              color: colors.txt2,
              fontFamily: "inherit",
              fontSize: 11,
              padding: "2px 8px",
              cursor: "pointer",
            }}
          >
            🪟
          </button>
        </span>
      </div>

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
              fontSize: 11,
              color: colors.txt3,
            }}
          >
            <span className="blink">▒ LOADING ▒</span>
          </div>
        ) : chartType === "line" ? (
          <PriceLine
            data={linePoints}
            height={bodyHeight}
            color={change == null ? colors.amber : change >= 0 ? colors.green : colors.red}
            filled
            showVolume
          />
        ) : (
          <Candlestick data={data} height={bodyHeight} />
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
