"use client";

import { colors, fonts } from "@pulse/ui";
import { formatUSD, formatPercent } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

interface CoinRow {
  id: string;
  symbol: string;
  current_price: number;
  price_change_percentage_24h_in_currency?: number;
}

/**
 * TerminalTicker — 26px scrolling tape, right-to-left, infinite loop.
 * Wires to /api/markets, slices top-18 by mcap, doubles for seamless loop.
 */
export function TerminalTicker() {
  const { data } = useFlow<CoinRow[]>("/api/markets");
  const coins = data?.slice(0, 18) ?? [];
  // Duplicate so the linear translate(-100%) loops seamlessly
  const items = [...coins, ...coins];

  return (
    <div
      style={{
        background: "#000",
        borderBottom: `1px solid ${colors.line}`,
        overflow: "hidden",
        position: "relative",
        height: 26,
        display: "flex",
        alignItems: "center",
      }}
    >
      <div className="ticker-track">
        {items.length === 0
          ? Array.from({ length: 12 }).map((_, i) => (
              <span key={i} style={{ display: "inline-flex", gap: 8, fontFamily: fonts.mono, fontSize: 11, color: colors.txt4 }}>
                <span style={{ color: colors.amber }}>—</span> <span>—</span>
              </span>
            ))
          : items.map((c, i) => {
              const ch = c.price_change_percentage_24h_in_currency ?? 0;
              const up = ch >= 0;
              return (
                <span
                  key={i}
                  style={{
                    display: "inline-flex",
                    gap: 8,
                    fontFamily: fonts.mono,
                    fontSize: 11,
                    alignItems: "baseline",
                  }}
                >
                  <span style={{ color: colors.amber, fontWeight: 600 }}>
                    {c.symbol.toUpperCase()}
                  </span>
                  <span className="mono-num" style={{ color: colors.txt2 }}>
                    {formatUSD(c.current_price, { compact: c.current_price >= 1000, decimals: c.current_price < 1 ? 4 : 2 })}
                  </span>
                  <span
                    className="mono-num"
                    style={{ color: up ? colors.green : colors.red, fontWeight: 600 }}
                  >
                    {up ? "▲" : "▼"} {formatPercent(ch)}
                  </span>
                </span>
              );
            })}
      </div>
    </div>
  );
}
