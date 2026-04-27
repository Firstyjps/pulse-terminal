"use client";

import { Card } from "@pulse/ui";
import { Sparkline } from "@pulse/charts";
import { formatUSD, formatPercent } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

export interface MarketsTableProps {
  /** Currently selected symbol (e.g. "BTC"). When set, that row is highlighted. */
  selectedSymbol?: string;
  /** Fired with the upper-cased symbol on row click. */
  onSelect?: (symbol: string) => void;
}

interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  current_price: number;
  market_cap: number;
  total_volume: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  sparkline_in_7d?: { price: number[] };
}

const ChangeCell = ({ value }: { value?: number }) => {
  if (value === undefined || !Number.isFinite(value)) return <span style={{ color: "#6b7280" }}>—</span>;
  return (
    <span style={{ color: value >= 0 ? "#34d399" : "#f87171", fontFamily: "JetBrains Mono, monospace" }}>
      {formatPercent(value)}
    </span>
  );
};

export function MarketsTable({ selectedSymbol, onSelect }: MarketsTableProps = {}) {
  const { data, loading, error } = useFlow<CoinRow[]>("/api/markets");

  return (
    <Card>
      {loading && <p style={{ color: "#9ca3af" }}>Loading top 20 coins…</p>}
      {error && <p style={{ color: "#f87171" }}>Error: {error}</p>}
      {data && (
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: "left", color: "#9ca3af", borderBottom: "1px solid rgba(255,255,255,0.08)", fontFamily: "JetBrains Mono, monospace" }}>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>#</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>Asset</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Price</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>1h</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>24h</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>7d</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Mcap</th>
                <th style={{ padding: "10px 12px", fontWeight: 600, textAlign: "right" }}>Volume</th>
                <th style={{ padding: "10px 12px", fontWeight: 600 }}>7d</th>
              </tr>
            </thead>
            <tbody>
              {data.map((c, i) => {
                const sym = c.symbol.toUpperCase();
                const active = selectedSymbol === sym;
                return (
                <tr
                  key={c.id}
                  onClick={() => onSelect?.(sym)}
                  style={{
                    borderBottom: "1px solid rgba(255,255,255,0.04)",
                    background: active ? "rgba(124,92,255,0.08)" : undefined,
                    cursor: onSelect ? "pointer" : undefined,
                    transition: "background .15s",
                  }}
                >
                  <td style={{ padding: "12px", color: "#6b7280" }}>{i + 1}</td>
                  <td style={{ padding: "12px" }}>
                    <span style={{ fontWeight: 600 }}>{sym}</span>
                    <span style={{ color: "#6b7280", marginLeft: 8, fontSize: 11 }}>{c.name}</span>
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace" }}>
                    {formatUSD(c.current_price, { compact: false, decimals: c.current_price < 1 ? 4 : 2 })}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    <ChangeCell value={c.price_change_percentage_1h_in_currency} />
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    <ChangeCell value={c.price_change_percentage_24h_in_currency} />
                  </td>
                  <td style={{ padding: "12px", textAlign: "right" }}>
                    <ChangeCell value={c.price_change_percentage_7d_in_currency} />
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "#9ca3af" }}>
                    {formatUSD(c.market_cap)}
                  </td>
                  <td style={{ padding: "12px", textAlign: "right", fontFamily: "JetBrains Mono, monospace", color: "#9ca3af" }}>
                    {formatUSD(c.total_volume)}
                  </td>
                  <td style={{ padding: "12px" }}>
                    {c.sparkline_in_7d?.price && (
                      <Sparkline
                        data={c.sparkline_in_7d.price}
                        positive={(c.price_change_percentage_7d_in_currency ?? 0) >= 0}
                      />
                    )}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
