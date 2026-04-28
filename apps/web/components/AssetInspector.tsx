"use client";

import { Sparkbar, colors, fonts } from "@pulse/ui";
import { formatUSD, formatPercent } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

interface CoinRow {
  id: string;
  symbol: string;
  name: string;
  market_cap_rank?: number;
  current_price: number;
  market_cap: number;
  total_volume: number;
  high_24h?: number;
  low_24h?: number;
  circulating_supply?: number;
  price_change_percentage_1h_in_currency?: number;
  price_change_percentage_24h_in_currency?: number;
  price_change_percentage_7d_in_currency?: number;
  sparkline_in_7d?: { price: number[] };
}

interface Props {
  /** Coin id from /api/markets — when null, shows the empty-state caret. */
  activeId?: string;
}

/**
 * AssetInspector — handoff Row 3 right c-4 (340px).
 * Drill-down for the row selected in MoversTable.
 */
export function AssetInspector({ activeId }: Props) {
  const { data } = useFlow<CoinRow[]>("/api/markets");
  const coin = activeId ? data?.find((c) => c.id === activeId) : undefined;

  if (!coin) {
    return (
      <div
        style={{
          padding: 16,
          color: colors.txt3,
          fontSize: 11,
          textAlign: "center",
          fontFamily: fonts.mono,
        }}
      >
        <div className="blink" style={{ color: colors.amber, fontSize: 16 }}>▮</div>
        <div style={{ marginTop: 8 }}>SELECT ASSET FROM TABLE</div>
        <div style={{ marginTop: 4, fontSize: 9, color: colors.txt4 }}>
          CLICK ANY ROW TO LOAD INSPECTOR
        </div>
      </div>
    );
  }

  const ch1 = coin.price_change_percentage_1h_in_currency ?? 0;
  const ch24 = coin.price_change_percentage_24h_in_currency ?? 0;
  const ch7 = coin.price_change_percentage_7d_in_currency ?? 0;
  const high = coin.high_24h ?? coin.current_price * 1.02;
  const low = coin.low_24h ?? coin.current_price * 0.98;
  const supply = coin.circulating_supply ?? coin.market_cap / coin.current_price;
  const volMcap = (coin.total_volume / coin.market_cap) * 100;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Header band */}
      <div
        style={{
          padding: "8px 10px",
          borderBottom: `1px solid ${colors.line}`,
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <span style={{ color: colors.amber, fontSize: 14, fontWeight: 600 }}>
            {coin.symbol.toUpperCase()}
          </span>
          <span style={{ color: colors.txt3, fontSize: 10 }}>{coin.name}</span>
          <span
            style={{
              color: colors.txt4,
              fontSize: 9,
              marginLeft: "auto",
              letterSpacing: "0.08em",
            }}
          >
            RANK #{coin.market_cap_rank ?? "—"}
          </span>
        </div>
        <div style={{ marginTop: 4, display: "flex", alignItems: "baseline", gap: 8 }}>
          <span
            className="mono-num"
            style={{ fontSize: 22, color: colors.txt1, letterSpacing: "-0.01em" }}
          >
            {formatUSD(coin.current_price, { compact: false, decimals: coin.current_price < 1 ? 4 : 2 })}
          </span>
          <span
            className="mono-num"
            style={{
              fontSize: 12,
              color: ch24 >= 0 ? colors.green : colors.red,
              fontWeight: 500,
            }}
          >
            {ch24 >= 0 ? "▲" : "▼"} {formatPercent(ch24)}
          </span>
        </div>
      </div>

      {/* KV grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: 8,
          padding: 8,
          flex: 1,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        <Kv k="Mkt Cap" v={formatUSD(coin.market_cap, { compact: true, decimals: 2 })} />
        <Kv k="Vol 24h" v={formatUSD(coin.total_volume, { compact: true, decimals: 2 })} />
        <Kv k="High 24h" v={formatUSD(high, { compact: false, decimals: high < 1 ? 4 : 2 })} />
        <Kv k="Low 24h" v={formatUSD(low, { compact: false, decimals: low < 1 ? 4 : 2 })} />
        <Kv k="Vol/Mcap" v={`${volMcap.toFixed(2)}%`} />
        <Kv k="Circ Supply" v={fmtCompactNum(supply)} />
        <Kv k="7d" v={formatPercent(ch7)} vColor={ch7 >= 0 ? colors.green : colors.red} />
        <Kv k="1h" v={formatPercent(ch1)} vColor={ch1 >= 0 ? colors.green : colors.red} />
      </div>

      {/* Sparkline footer */}
      <div style={{ padding: "0 10px 10px", flexShrink: 0 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            color: colors.txt3,
            marginBottom: 4,
          }}
        >
          7D Sparkline
        </div>
        <Sparkbar
          data={coin.sparkline_in_7d?.price ?? []}
          asLine
          fill
          color={ch7 >= 0 ? colors.green : colors.red}
          height={48}
          width={300}
        />
      </div>
    </div>
  );
}

function Kv({ k, v, vColor }: { k: string; v: React.ReactNode; vColor?: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        padding: "3px 0",
        borderBottom: `1px dashed ${colors.line}`,
        fontSize: 11,
        fontFamily: fonts.mono,
      }}
    >
      <span
        style={{
          color: colors.txt3,
          textTransform: "uppercase",
          fontSize: 9,
          letterSpacing: "0.06em",
        }}
      >
        {k}
      </span>
      <span style={{ color: vColor ?? colors.txt2 }}>{v}</span>
    </div>
  );
}

function fmtCompactNum(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (a >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (a >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (a >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return n.toFixed(2);
}
