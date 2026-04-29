"use client";

import { useEffect, useState } from "react";
import { colors, fonts } from "@pulse/ui";
import { Candlestick, type Candle } from "@pulse/charts";

const INTERVALS = ["15m", "1h", "4h", "1d"] as const;
type Interval = (typeof INTERVALS)[number];

export interface CandlestickPanelProps {
  symbol: string;
  /** Optional friendly name above the chart. */
  label?: string;
  initialInterval?: Interval;
  height?: number;
  /** Hide the local controls — host already renders them in the panel header. */
  hideControls?: boolean;
}

export function CandlestickPanel({
  symbol,
  label,
  initialInterval = "1h",
  height = 380,
  hideControls = false,
}: CandlestickPanelProps) {
  const [interval, setInterval] = useState<Interval>(initialInterval);
  const [data, setData] = useState<Candle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=300`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as Candle[];
      })
      .then((rows) => {
        if (!cancelled) {
          setData(rows);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Error");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, interval]);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {!hideControls && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "6px 10px",
            borderBottom: `1px solid ${colors.line}`,
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10, fontFamily: fonts.mono, fontSize: 11 }}>
            <span style={{ color: colors.amber, fontWeight: 600 }}>{symbol}</span>
            {label && <span style={{ color: colors.txt3, fontSize: 10 }}>{label}</span>}
          </div>
          <div style={{ display: "flex", gap: 1, background: colors.line }}>
            {INTERVALS.map((iv) => (
              <button
                key={iv}
                type="button"
                onClick={() => setInterval(iv)}
                style={{
                  background: interval === iv ? colors.bg2 : colors.bg1,
                  border: "none",
                  color: interval === iv ? colors.amber : colors.txt3,
                  padding: "3px 10px",
                  fontSize: 10,
                  fontFamily: fonts.mono,
                  letterSpacing: "0.06em",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {iv}
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, padding: 8 }}>
        {loading && <p style={{ color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>Loading klines…</p>}
        {error && <p style={{ color: colors.red, fontSize: 11, fontFamily: fonts.mono }}>Error: {error}</p>}
        {!loading && !error && <Candlestick data={data} symbol={symbol} height={height} />}
      </div>
    </div>
  );
}
