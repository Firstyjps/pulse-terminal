"use client";

import { colors, fonts } from "@pulse/ui";
import { Sparkline } from "@pulse/charts";
import { formatUSD, formatPercent } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";
import { useWatchlist } from "../lib/use-watchlist";
import { useIsMobile } from "../lib/use-media";
import { SkeletonRows } from "./Skeleton";

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
  if (value === undefined || !Number.isFinite(value)) return <span style={{ color: colors.txt4 }}>—</span>;
  return (
    <span style={{ color: value >= 0 ? colors.green : colors.red, fontFamily: fonts.mono }}>
      {formatPercent(value)}
    </span>
  );
};

export function MarketsTable({ selectedSymbol, onSelect }: MarketsTableProps = {}) {
  const { data, loading, error } = useFlow<CoinRow[]>("/api/markets");
  const { has, toggle } = useWatchlist();
  const isMobile = useIsMobile();

  // Sort watched coins to the top, preserve original order otherwise
  const sorted = data
    ? [...data].sort((a, b) => Number(has(b.symbol)) - Number(has(a.symbol)))
    : null;

  return (
    <div style={{ height: "100%", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
      {loading && !data && <div style={{ padding: 12 }}><SkeletonRows rows={8} /></div>}
      {error && <p style={{ color: colors.red, padding: 12 }}>Error: {error}</p>}
      {sorted && isMobile && (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, fontFamily: fonts.mono }}>
          {sorted.map((c, i) => {
            const sym = c.symbol.toUpperCase();
            const active = selectedSymbol === sym;
            const watched = has(sym);
            const ch24 = c.price_change_percentage_24h_in_currency ?? 0;
            const ch7 = c.price_change_percentage_7d_in_currency ?? 0;
            return (
              <li
                key={c.id}
                onClick={() => onSelect?.(sym)}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  columnGap: 10,
                  rowGap: 4,
                  alignItems: "center",
                  padding: "10px 12px",
                  minHeight: 60,
                  borderBottom: `1px solid ${colors.line}`,
                  background: active ? "rgba(255,176,0,0.08)" : "transparent",
                  cursor: onSelect ? "pointer" : "default",
                }}
              >
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggle(sym); }}
                  aria-label={watched ? `Remove ${sym} from watchlist` : `Add ${sym} to watchlist`}
                  style={{
                    background: "transparent",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 16,
                    color: watched ? colors.amber : colors.txt4,
                    padding: 4,
                    lineHeight: 1,
                    minHeight: 36,
                    minWidth: 36,
                    gridRow: "1 / span 2",
                  }}
                >
                  {watched ? "★" : "☆"}
                </button>
                <span style={{ display: "flex", alignItems: "baseline", gap: 6, minWidth: 0 }}>
                  <span style={{ color: colors.amber, fontWeight: 600, fontSize: 12 }}>{sym}</span>
                  <span style={{ color: colors.txt4, fontSize: 10, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name}</span>
                  <span style={{ color: colors.txt4, fontSize: 10, marginLeft: "auto" }}>#{i + 1}</span>
                </span>
                <span style={{ display: "flex", justifyContent: "flex-end", color: colors.txt1, fontSize: 12, fontWeight: 500, gridRow: 1 }}>
                  {formatUSD(c.current_price, { compact: false, decimals: c.current_price < 1 ? 4 : 2 })}
                </span>
                <span style={{ display: "flex", gap: 12, fontSize: 10, color: colors.txt4, gridColumn: "2 / 4" }}>
                  <span>
                    <span style={{ color: colors.txt4, marginRight: 3 }}>24h</span>
                    <span style={{ color: ch24 >= 0 ? colors.green : colors.red, fontWeight: 600 }}>{formatPercent(ch24)}</span>
                  </span>
                  <span>
                    <span style={{ color: colors.txt4, marginRight: 3 }}>7d</span>
                    <span style={{ color: ch7 >= 0 ? colors.green : colors.red }}>{formatPercent(ch7)}</span>
                  </span>
                  <span>
                    <span style={{ color: colors.txt4, marginRight: 3 }}>cap</span>
                    <span>{formatUSD(c.market_cap, { compact: true, decimals: 1 })}</span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {sorted && !isMobile && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: fonts.mono }}>
          <thead>
            <tr style={{ textAlign: "left", color: colors.txt3, fontFamily: fonts.mono, textTransform: "uppercase", letterSpacing: "0.08em" }}>
              <th style={cellHeader} />
              <th style={cellHeader}>#</th>
              <th style={cellHeader}>Asset</th>
              <th style={{ ...cellHeader, textAlign: "right" }}>Price</th>
              <th style={{ ...cellHeader, textAlign: "right" }}>1h</th>
              <th style={{ ...cellHeader, textAlign: "right" }}>24h</th>
              <th style={{ ...cellHeader, textAlign: "right" }}>7d</th>
              <th style={{ ...cellHeader, textAlign: "right" }}>Mcap</th>
              <th style={{ ...cellHeader, textAlign: "right" }}>Volume</th>
              <th style={cellHeader}>7d</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c, i) => {
              const sym = c.symbol.toUpperCase();
              const active = selectedSymbol === sym;
              const watched = has(sym);
              return (
                <tr
                  key={c.id}
                  onClick={() => onSelect?.(sym)}
                  style={{
                    borderBottom: `1px solid ${colors.line}`,
                    background: active ? "rgba(255,176,0,0.10)" : watched ? "rgba(255,176,0,0.04)" : undefined,
                    cursor: onSelect ? "pointer" : undefined,
                    transition: "background .15s",
                  }}
                >
                  <td style={{ padding: "6px 6px 6px 10px", width: 28 }}>
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); toggle(sym); }}
                      title={watched ? "Remove from watchlist" : "Add to watchlist"}
                      style={{
                        background: "transparent",
                        border: "none",
                        cursor: "pointer",
                        fontSize: 13,
                        color: watched ? colors.amber : colors.txt4,
                        padding: 0,
                        lineHeight: 1,
                      }}
                    >
                      {watched ? "★" : "☆"}
                    </button>
                  </td>
                  <td style={{ ...cellBody, color: colors.txt4 }}>{i + 1}</td>
                  <td style={cellBody}>
                    <span style={{ fontWeight: 600, color: colors.amber }}>{sym}</span>
                    <span style={{ color: colors.txt4, marginLeft: 8, fontSize: 10 }}>{c.name}</span>
                  </td>
                  <td style={{ ...cellBody, textAlign: "right" }}>
                    {formatUSD(c.current_price, { compact: false, decimals: c.current_price < 1 ? 4 : 2 })}
                  </td>
                  <td style={{ ...cellBody, textAlign: "right" }}>
                    <ChangeCell value={c.price_change_percentage_1h_in_currency} />
                  </td>
                  <td style={{ ...cellBody, textAlign: "right" }}>
                    <ChangeCell value={c.price_change_percentage_24h_in_currency} />
                  </td>
                  <td style={{ ...cellBody, textAlign: "right" }}>
                    <ChangeCell value={c.price_change_percentage_7d_in_currency} />
                  </td>
                  <td style={{ ...cellBody, textAlign: "right", color: colors.txt3 }}>
                    {formatUSD(c.market_cap, { compact: true, decimals: 1 })}
                  </td>
                  <td style={{ ...cellBody, textAlign: "right", color: colors.txt3 }}>
                    {formatUSD(c.total_volume, { compact: true, decimals: 1 })}
                  </td>
                  <td style={cellBody}>
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
      )}
    </div>
  );
}

const cellHeader: React.CSSProperties = {
  padding: "6px 10px",
  fontSize: 9,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  borderBottom: `1px solid ${colors.line}`,
  background: colors.bg1,
  position: "sticky",
  top: 0,
  whiteSpace: "nowrap",
};

const cellBody: React.CSSProperties = {
  padding: "6px 10px",
  whiteSpace: "nowrap",
  color: colors.txt2,
};
