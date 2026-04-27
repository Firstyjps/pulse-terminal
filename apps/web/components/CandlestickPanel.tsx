"use client";

import { useEffect, useState } from "react";
import { Card, Pill } from "@pulse/ui";
import { Candlestick, type Candle } from "@pulse/charts";

const INTERVALS = ["15m", "1h", "4h", "1d"] as const;
type Interval = (typeof INTERVALS)[number];

export interface CandlestickPanelProps {
  symbol: string;
  /** Optional friendly name above the chart. */
  label?: string;
  initialInterval?: Interval;
  height?: number;
}

export function CandlestickPanel({
  symbol,
  label,
  initialInterval = "1h",
  height = 380,
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
    <Card>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <Pill tone="purple">{symbol}</Pill>
          {label && <span style={{ fontSize: 13, color: "#9ca3af" }}>{label}</span>}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {INTERVALS.map((iv) => (
            <button
              key={iv}
              type="button"
              onClick={() => setInterval(iv)}
              style={{
                background: interval === iv ? "rgba(124,92,255,0.2)" : "transparent",
                border: `1px solid ${interval === iv ? "rgba(124,92,255,0.4)" : "rgba(255,255,255,0.08)"}`,
                color: interval === iv ? "#a78bfa" : "#9ca3af",
                borderRadius: 8,
                padding: "4px 10px",
                fontSize: 11,
                fontFamily: "JetBrains Mono, monospace",
                cursor: "pointer",
              }}
            >
              {iv.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {loading && <p style={{ color: "#9ca3af", fontSize: 13 }}>Loading klines…</p>}
      {error && <p style={{ color: "#f87171", fontSize: 13 }}>Error: {error}</p>}
      {!loading && !error && <Candlestick data={data} symbol={symbol} height={height} />}
    </Card>
  );
}
