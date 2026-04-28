"use client";

import { useMemo } from "react";
import { colors, fonts } from "@pulse/ui";
import { useFlow } from "../lib/use-flow";

interface FundingRate {
  exchange: string;
  symbol: string;
  ratePercent: number;
}
interface ApiResp {
  rates: FundingRate[];
  ts: number;
}

const EXCHANGES = ["BIN", "OKX", "BYB", "DRBT", "CB"] as const;
const EXCHANGE_KEY: Record<string, string> = {
  binance: "BIN",
  bybit: "BYB",
  okx: "OKX",
  deribit: "DRBT",
  coinbase: "CB",
};

const TARGETS = ["BTC", "ETH", "SOL", "BNB", "XRP", "DOGE", "AVAX", "LINK"];

function normalize(s: string): string {
  return s.replace(/-USDT-SWAP$/i, "USDT").toUpperCase().replace(/USDT$/, "");
}

/**
 * FundingHeatmapMini — handoff Row 4 right c-3 (320px).
 *
 *   60px Asset | BIN | OKX | BYB | DRBT | CB
 *   8 fixed assets, color = rgba(green/red, 0.08 + intensity*0.5)
 */
export function FundingHeatmapMini() {
  const { data, loading } = useFlow<ApiResp>("/api/funding");

  const rows = useMemo(() => {
    if (!data?.rates) return TARGETS.map((sym) => ({ sym, rates: Array(EXCHANGES.length).fill(null) as (number | null)[] }));
    return TARGETS.map((sym) => {
      const rates = EXCHANGES.map((eKey) => {
        const sourceKey = Object.keys(EXCHANGE_KEY).find((k) => EXCHANGE_KEY[k] === eKey);
        if (!sourceKey) return null;
        const found = data.rates.find(
          (r) => r.exchange === sourceKey && normalize(r.symbol) === sym,
        );
        return found ? found.ratePercent : null;
      });
      return { sym, rates };
    });
  }, [data]);

  const cellBase: React.CSSProperties = {
    padding: "4px 6px",
    textAlign: "right",
    fontFamily: fonts.mono,
    background: colors.bg1,
  };
  const headerCell: React.CSSProperties = {
    ...cellBase,
    background: colors.bg2,
    color: colors.txt3,
    textAlign: "center",
    fontSize: 9,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    fontWeight: 500,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px repeat(5, 1fr)",
          gap: 1,
          background: colors.line,
          fontSize: 9.5,
          flex: 1,
          minHeight: 0,
          overflow: "auto",
        }}
      >
        <div style={headerCell}>Asset</div>
        {EXCHANGES.map((e) => (
          <div key={e} style={headerCell}>{e}</div>
        ))}

        {rows.map((row) => (
          <FundingRowFragment key={row.sym} sym={row.sym} rates={row.rates} loading={loading && !data} />
        ))}
      </div>
      <div
        style={{
          padding: "4px 6px",
          fontFamily: fonts.mono,
          fontSize: 9,
          color: colors.txt4,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          borderTop: `1px solid ${colors.line}`,
          flexShrink: 0,
        }}
      >
        ▸ 8h Annualized · Negative = shorts pay
      </div>
    </div>
  );
}

function FundingRowFragment({
  sym,
  rates,
  loading,
}: {
  sym: string;
  rates: (number | null)[];
  loading: boolean;
}) {
  return (
    <>
      <div
        style={{
          padding: "4px 6px",
          textAlign: "left",
          fontFamily: "var(--mono)",
          background: colors.bg1,
          color: colors.amber,
          fontWeight: 600,
        }}
      >
        {sym}
      </div>
      {rates.map((v, i) => (
        <div
          key={i}
          style={{
            padding: "4px 6px",
            textAlign: "right",
            fontFamily: "var(--mono)",
            background: bgFor(v),
            color: colors.txt1,
          }}
        >
          {loading ? "—" : v == null ? "—" : (v >= 0 ? "+" : "") + v.toFixed(3) + "%"}
        </div>
      ))}
    </>
  );
}

function bgFor(v: number | null): string {
  if (v == null) return colors.bg1;
  // intensity scaled to 0.05% as full saturation
  const intensity = Math.min(Math.abs(v) / 0.05, 1);
  const alpha = 0.08 + intensity * 0.5;
  if (v >= 0) return `rgba(25, 210, 122, ${alpha})`;
  return `rgba(255, 77, 94, ${alpha})`;
}
