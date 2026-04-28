"use client";

import { useMemo, useState } from "react";
import { Sparkbar, colors, fonts } from "@pulse/ui";
import { formatUSD, formatPercent } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";
import { SkeletonRows } from "./Skeleton";

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

export type SortKey =
  | "market_cap_rank"
  | "name"
  | "current_price"
  | "price_change_percentage_1h_in_currency"
  | "price_change_percentage_24h_in_currency"
  | "price_change_percentage_7d_in_currency"
  | "total_volume"
  | "market_cap";

interface Props {
  /** Lifted state — host owns the selection so AssetInspector can react. */
  activeId?: string;
  onPick?: (id: string) => void;
  query?: string;
  setQuery?: (q: string) => void;
}

/**
 * MoversTable — handoff Row 3 left c-8 (340px).
 *
 *   # · Asset · Last · 1h% · 24h% · 7d% · Vol·24h · Mkt Cap · 7d Trend
 *
 * Sticky header, sortable columns, search filter, asset icon pill, sparkline.
 */
export function MoversTable({ activeId, onPick, query: extQuery, setQuery: extSetQuery }: Props) {
  const { data, loading } = useFlow<CoinRow[]>("/api/markets");
  const [localQuery, setLocalQuery] = useState("");
  const query = extQuery ?? localQuery;
  const setQuery = extSetQuery ?? setLocalQuery;

  const [sort, setSort] = useState<{ key: SortKey | "spark"; dir: "asc" | "desc" }>({
    key: "market_cap",
    dir: "desc",
  });

  const filtered = useMemo(() => {
    if (!data) return null;
    let xs = data;
    if (query) {
      const q = query.toLowerCase();
      xs = xs.filter((c) => c.name.toLowerCase().includes(q) || c.symbol.toLowerCase().includes(q));
    }
    if (sort.key === "spark") return xs;
    if (sort.key === "name") {
      return [...xs].sort((a, b) =>
        sort.dir === "desc" ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name),
      );
    }
    return [...xs].sort((a, b) => {
      const av = (a as unknown as Record<string, unknown>)[sort.key];
      const bv = (b as unknown as Record<string, unknown>)[sort.key];
      const an = typeof av === "number" ? av : Number(av);
      const bn = typeof bv === "number" ? bv : Number(bv);
      if (!Number.isFinite(an)) return 1;
      if (!Number.isFinite(bn)) return -1;
      return sort.dir === "desc" ? bn - an : an - bn;
    });
  }, [data, query, sort]);

  const cols: { k: SortKey | "spark"; l: string; left?: boolean; noSort?: boolean }[] = [
    { k: "market_cap_rank", l: "#", left: true },
    { k: "name", l: "Asset", left: true },
    { k: "current_price", l: "Last" },
    { k: "price_change_percentage_1h_in_currency", l: "1h%" },
    { k: "price_change_percentage_24h_in_currency", l: "24h%" },
    { k: "price_change_percentage_7d_in_currency", l: "7d%" },
    { k: "total_volume", l: "Vol·24h" },
    { k: "market_cap", l: "Mkt Cap" },
    { k: "spark", l: "7d Trend", noSort: true },
  ];

  function clickHeader(k: SortKey | "spark", noSort?: boolean) {
    if (noSort) return;
    setSort((s) => ({ key: k, dir: s.key === k && s.dir === "desc" ? "asc" : "desc" }));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* search row sits in panel header via actions slot — but if no host, fall back here */}
      {extQuery === undefined && (
        <div
          style={{
            padding: "4px 8px",
            borderBottom: `1px solid ${colors.line}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="search asset…"
            style={{
              background: colors.bg2,
              border: `1px solid ${colors.line2}`,
              color: colors.txt2,
              fontFamily: fonts.mono,
              fontSize: 10,
              padding: "2px 6px",
              width: 130,
              outline: "none",
            }}
          />
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {loading && !filtered && (
          <div style={{ padding: 8 }}>
            <SkeletonRows rows={8} />
          </div>
        )}
        {filtered && (
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 10.5,
              fontFamily: fonts.mono,
            }}
          >
            <thead>
              <tr>
                {cols.map((c) => (
                  <th
                    key={c.k}
                    onClick={() => clickHeader(c.k, c.noSort)}
                    style={{
                      textAlign: c.left ? "left" : "right",
                      padding: "4px 8px",
                      fontSize: 9,
                      fontWeight: 500,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: colors.txt3,
                      borderBottom: `1px solid ${colors.line}`,
                      background: colors.bg1,
                      position: "sticky",
                      top: 0,
                      cursor: c.noSort ? "default" : "pointer",
                      userSelect: "none",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {c.l}
                    {sort.key === c.k && (
                      <span style={{ color: colors.amber, marginLeft: 4 }}>
                        {sort.dir === "desc" ? "▼" : "▲"}
                      </span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((c, i) => {
                const ch1 = c.price_change_percentage_1h_in_currency ?? 0;
                const ch24 = c.price_change_percentage_24h_in_currency ?? 0;
                const ch7 = c.price_change_percentage_7d_in_currency ?? 0;
                const isActive = activeId === c.id;
                return (
                  <tr
                    key={c.id}
                    onClick={() => onPick?.(c.id)}
                    style={{
                      cursor: "pointer",
                      background: isActive ? "rgba(255,176,0,0.08)" : "transparent",
                      transition: "background 0.12s ease",
                    }}
                    onMouseEnter={(e) => {
                      if (!isActive) e.currentTarget.style.background = colors.bg2;
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = isActive ? "rgba(255,176,0,0.08)" : "transparent";
                    }}
                  >
                    <td style={cellLeft}>
                      <span style={{ color: colors.txt4 }}>{c.market_cap_rank ?? i + 1}</span>
                    </td>
                    <td style={cellLeft}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span
                          style={{
                            width: 14,
                            height: 14,
                            background: colors.bg3,
                            border: `1px solid ${colors.line2}`,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 8,
                            color: colors.amber,
                            flexShrink: 0,
                          }}
                        >
                          {c.symbol[0].toUpperCase()}
                        </span>
                        <span style={{ color: colors.amber, fontWeight: 600 }}>
                          {c.symbol.toUpperCase()}
                        </span>
                        <span style={{ color: colors.txt4, fontSize: 10 }}>{c.name}</span>
                      </span>
                    </td>
                    <td style={cellRight}>{formatUSD(c.current_price, { compact: false, decimals: c.current_price < 1 ? 4 : 2 })}</td>
                    <td style={{ ...cellRight, color: ch1 >= 0 ? colors.green : colors.red }}>
                      {formatPercent(ch1)}
                    </td>
                    <td style={{ ...cellRight, color: ch24 >= 0 ? colors.green : colors.red }}>
                      {formatPercent(ch24)}
                    </td>
                    <td style={{ ...cellRight, color: ch7 >= 0 ? colors.green : colors.red }}>
                      {formatPercent(ch7)}
                    </td>
                    <td style={{ ...cellRight, color: colors.txt3 }}>
                      {formatUSD(c.total_volume, { compact: true, decimals: 1 })}
                    </td>
                    <td style={cellRight}>
                      {formatUSD(c.market_cap, { compact: true, decimals: 1 })}
                    </td>
                    <td style={{ width: 110, padding: "0 8px", borderBottom: `1px solid ${colors.line}` }}>
                      {c.sparkline_in_7d?.price && (
                        <Sparkbar
                          data={c.sparkline_in_7d.price}
                          color={ch7 >= 0 ? colors.green : colors.red}
                          asLine
                          fill
                          height={18}
                          width={100}
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const cellRight: React.CSSProperties = {
  padding: "4px 8px",
  textAlign: "right",
  borderBottom: `1px solid ${colors.line}`,
  whiteSpace: "nowrap",
  color: "#c8d1dc",
};

const cellLeft: React.CSSProperties = {
  ...cellRight,
  textAlign: "left",
};
