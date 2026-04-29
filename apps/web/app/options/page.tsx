"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, WsRow, Workspace, StatBlock, colors, fonts } from "@pulse/ui";
import { IVSmile, GreeksHeatmap } from "@pulse/charts";
import type { IVPoint, GreeksRow } from "@pulse/charts";
import { formatUSD, formatPercent } from "@pulse/sources";
import type {
  OptionAsset,
  OptionData,
  OptionExchange,
  OptionsAggregateResponse,
  OptionsArbitrage,
} from "@pulse/sources";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";
import { useFlow } from "../../lib/use-flow";

type AggregateWithArb = OptionsAggregateResponse & { arbitrage?: OptionsArbitrage[] };

interface IVSmileResp {
  asset: OptionAsset;
  expiry: string;
  calls: { strike: number; iv: number; exchange: OptionExchange }[];
  puts: { strike: number; iv: number; exchange: OptionExchange }[];
  available_expiries: string[];
  underlyingPrice: number;
}

const ASSETS: OptionAsset[] = ["BTC", "ETH", "SOL"];

/**
 * Options Chain — Bloomberg shell.
 *
 *   Row 1 (h-stats, 96px): asset switcher + 4 KPIs (ATM IV / P/C / Total OI / Total Vol)
 *   Row 2 (h-chart, ≥420px): STRIKE LADDER c-7 + IV SMILE c-5
 *   Row 3 (h-table, 340px): GREEKS HEATMAP c-8 + ARBITRAGE c-4
 */
export default function OptionsPage() {
  const [asset, setAsset] = useState<OptionAsset>("BTC");
  const [expiry, setExpiry] = useState<string | null>(null);

  const aggregate = useFlow<AggregateWithArb>(`/api/options/aggregate?asset=${asset}&arbitrage=1`);
  const ivSmile = useFlow<IVSmileResp>(
    expiry ? `/api/options/iv-smile?asset=${asset}&expiry=${expiry}` : `/api/options/iv-smile?asset=${asset}`,
  );

  // First expiry is the default; user can switch.
  useEffect(() => {
    if (aggregate.data && !expiry && aggregate.data.expiries.length > 0) {
      setExpiry(aggregate.data.expiries[0]);
    }
  }, [aggregate.data, expiry]);

  const opts = aggregate.data?.options ?? [];
  const expiries = aggregate.data?.expiries ?? [];
  const spot = aggregate.data?.underlyingPrice ?? ivSmile.data?.underlyingPrice ?? 0;
  const arbitrage = aggregate.data?.arbitrage ?? [];

  const stats = useMemo(() => buildStats(opts, expiry, spot), [opts, expiry, spot]);
  const ladderRows = useMemo(() => buildLadder(opts, expiry, spot), [opts, expiry, spot]);
  const ivPoints: IVPoint[] = useMemo(() => buildIvPoints(ivSmile.data), [ivSmile.data]);
  const greeksRows: GreeksRow[] = useMemo(() => buildGreeksRows(opts, expiry), [opts, expiry]);

  const headerActions = (
    <span style={{ display: "flex", gap: 1, background: colors.line }}>
      {ASSETS.map((a) => (
        <button
          key={a}
          onClick={() => { setAsset(a); setExpiry(null); }}
          style={{
            background: asset === a ? colors.bg2 : colors.bg1,
            border: "none",
            color: asset === a ? colors.amber : colors.txt3,
            padding: "3px 12px",
            fontFamily: fonts.mono,
            fontSize: 9,
            letterSpacing: "0.10em",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          {a}
        </button>
      ))}
    </span>
  );

  const expiryActions = (
    <select
      value={expiry ?? ""}
      onChange={(e) => setExpiry(e.target.value)}
      style={{
        background: colors.bg2,
        border: `1px solid ${colors.line2}`,
        color: colors.amber,
        fontFamily: fonts.mono,
        fontSize: 10,
        padding: "2px 6px",
        outline: "none",
      }}
    >
      {expiries.length === 0 && <option value="">—</option>}
      {expiries.map((e) => (
        <option key={e} value={e}>{e}</option>
      ))}
    </select>
  );

  return (
    <Workspace>
      <WsRow height="stats">
        <Panel
          span={12}
          title="OPTIONS · CHAIN"
          badge={`${asset} · ${aggregate.data ? `${opts.length} CONTRACTS` : "LOADING"}`}
          actions={
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {headerActions}
              <MCPQuickAsk endpoint={`/api/options/aggregate?asset=${asset}&arbitrage=1`} label="Ask Claude" />
            </span>
          }
          flush
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: colors.line, height: "100%" }}>
            <StatBlock
              label={`${asset} Spot`}
              value={spot ? formatUSD(spot, { compact: false, decimals: 0 }) : "—"}
              sub={aggregate.data ? `${aggregate.data.errors.length === 0 ? "all venues live" : `${aggregate.data.errors.length} venue err`}` : undefined}
            />
            <StatBlock
              label="ATM IV (call)"
              value={stats.atmIvCall != null ? `${stats.atmIvCall.toFixed(1)}%` : "—"}
              delta={stats.atmIvPut != null ? `PUT ${stats.atmIvPut.toFixed(1)}%` : ""}
              deltaColor={colors.cyan}
              sub="closest strike to spot"
            />
            <StatBlock
              label="Put/Call Ratio"
              value={stats.putCallRatio != null ? stats.putCallRatio.toFixed(2) : "—"}
              delta={stats.putCallRatio != null ? (stats.putCallRatio > 1 ? "BEARISH" : "BULLISH") : ""}
              deltaColor={stats.putCallRatio != null && stats.putCallRatio > 1 ? colors.red : colors.green}
              sub="OI weighted"
            />
            <StatBlock
              label="Total OI · Volume"
              value={stats.totalOi ? formatUSD(stats.totalOi, { compact: true, decimals: 1 }) : "—"}
              delta={stats.totalVol ? formatUSD(stats.totalVol, { compact: true, decimals: 1 }) : ""}
              deltaColor={colors.amber}
              sub="across all expiries"
            />
          </div>
        </Panel>
      </WsRow>

      <WsRow height="auto" style={{ minHeight: 460 }}>
        <Panel
          span={7}
          title="STRIKE LADDER"
          badge={`EXPIRY ${expiry ?? "—"}`}
          actions={expiryActions}
          flush
        >
          <StrikeLadder rows={ladderRows} spot={spot} />
        </Panel>
        <Panel
          span={5}
          title="IV SMILE"
          badge={ivSmile.data ? `${ivPoints.length} POINTS` : "LOADING"}
        >
          {ivSmile.data && ivPoints.length > 0 ? (
            <IVSmile data={ivPoints} spot={spot} splitSides height={380} />
          ) : (
            <p style={{ color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>
              {ivSmile.loading ? "Loading IV smile…" : ivSmile.error ?? "No IV data for this expiry"}
            </p>
          )}
        </Panel>
      </WsRow>

      <WsRow height="auto" style={{ minHeight: 360 }}>
        <Panel
          span={8}
          title="GREEKS HEATMAP"
          badge={greeksRows.length > 0 ? `${greeksRows.length} ROWS` : "LOADING"}
          flush
        >
          <div style={{ height: "100%", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
            {greeksRows.length === 0 ? (
              <p style={{ padding: 16, color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>
                {aggregate.loading ? "Loading…" : "No Greeks data for this expiry"}
              </p>
            ) : (
              <GreeksHeatmap data={greeksRows} spot={spot} side="both" rowHeight={22} />
            )}
          </div>
        </Panel>
        <Panel
          span={4}
          title="ARBITRAGE HITS"
          badge={`${arbitrage.length} OPP`}
          flush
        >
          <ArbitrageList items={arbitrage} />
        </Panel>
      </WsRow>
    </Workspace>
  );
}

// ───────────── helpers ─────────────

interface LadderRow {
  strike: number;
  call: BestQuote | null;
  put: BestQuote | null;
  isATM: boolean;
}

interface BestQuote {
  bid: number;
  ask: number;
  mark: number;
  iv: number;
  oi: number;
  exchange: OptionExchange;
}

function buildLadder(opts: OptionData[], expiry: string | null, spot: number): LadderRow[] {
  if (!expiry) return [];
  const filtered = opts.filter((o) => o.expiry === expiry);
  if (filtered.length === 0) return [];

  const strikes = Array.from(new Set(filtered.map((o) => o.strike))).sort((a, b) => a - b);

  // Pick best per (strike, side) — prefer Deribit if present (deepest book), else first.
  function pickBest(side: "call" | "put", strike: number): BestQuote | null {
    const list = filtered.filter((o) => o.side === side && o.strike === strike && o.iv > 0);
    if (list.length === 0) return null;
    const byEx = (e: OptionExchange) => list.find((o) => o.exchange === e);
    const winner = byEx("Deribit") ?? byEx("Binance") ?? byEx("Bybit") ?? byEx("OKX") ?? list[0];
    return {
      bid: winner.bid,
      ask: winner.ask,
      mark: winner.mark,
      iv: winner.iv,
      oi: winner.oi,
      exchange: winner.exchange,
    };
  }

  // Find ATM strike (closest to spot)
  let atmStrike = strikes[0];
  let bestDiff = Math.abs(strikes[0] - spot);
  for (const k of strikes) {
    const d = Math.abs(k - spot);
    if (d < bestDiff) { atmStrike = k; bestDiff = d; }
  }

  return strikes.map((strike) => ({
    strike,
    call: pickBest("call", strike),
    put: pickBest("put", strike),
    isATM: strike === atmStrike,
  }));
}

function buildIvPoints(s: IVSmileResp | null): IVPoint[] {
  if (!s) return [];
  const xs: IVPoint[] = [];
  for (const c of s.calls) xs.push({ strike: c.strike, iv: c.iv, side: "call" });
  for (const p of s.puts) xs.push({ strike: p.strike, iv: p.iv, side: "put" });
  return xs;
}

function buildGreeksRows(opts: OptionData[], expiry: string | null): GreeksRow[] {
  if (!expiry) return [];
  const filtered = opts.filter((o) => o.expiry === expiry);
  if (filtered.length === 0) return [];
  // Dedupe: per (strike, side) take the first non-empty greek set.
  const map = new Map<string, OptionData>();
  for (const o of filtered) {
    const key = `${o.strike}-${o.side}`;
    if (!map.has(key) && (o.delta !== 0 || o.gamma !== 0)) {
      map.set(key, o);
    } else if (!map.has(key)) {
      map.set(key, o);
    }
  }
  return Array.from(map.values()).map((o) => ({
    strike: o.strike,
    side: o.side,
    delta: o.delta,
    gamma: o.gamma,
    theta: o.theta,
    vega: o.vega,
  }));
}

function buildStats(opts: OptionData[], expiry: string | null, spot: number) {
  if (!expiry || opts.length === 0) {
    return { atmIvCall: null, atmIvPut: null, putCallRatio: null, totalOi: 0, totalVol: 0 };
  }
  const filtered = opts.filter((o) => o.expiry === expiry);
  const strikes = Array.from(new Set(filtered.map((o) => o.strike))).sort((a, b) => a - b);
  if (strikes.length === 0) {
    return { atmIvCall: null, atmIvPut: null, putCallRatio: null, totalOi: 0, totalVol: 0 };
  }

  // ATM strike
  let atmStrike = strikes[0];
  let bestDiff = Math.abs(strikes[0] - spot);
  for (const k of strikes) {
    const d = Math.abs(k - spot);
    if (d < bestDiff) { atmStrike = k; bestDiff = d; }
  }

  const atmCall = filtered.find((o) => o.strike === atmStrike && o.side === "call" && o.iv > 0);
  const atmPut = filtered.find((o) => o.strike === atmStrike && o.side === "put" && o.iv > 0);

  let callOi = 0;
  let putOi = 0;
  let totalOi = 0;
  let totalVol = 0;
  for (const o of opts) {
    totalOi += o.oi || 0;
    totalVol += o.volume || 0;
    if (o.side === "call") callOi += o.oi || 0;
    else putOi += o.oi || 0;
  }
  const putCallRatio = callOi > 0 ? putOi / callOi : null;

  return {
    atmIvCall: atmCall?.iv ?? null,
    atmIvPut: atmPut?.iv ?? null,
    putCallRatio,
    totalOi,
    totalVol,
  };
}

// ───────────── presentational ─────────────

function StrikeLadder({ rows, spot }: { rows: LadderRow[]; spot: number }) {
  if (rows.length === 0) {
    return (
      <p style={{ padding: 16, color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>
        Pick an expiry to load the strike ladder.
      </p>
    );
  }

  return (
    <div style={{ height: "100%", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 10 }}>
        <thead>
          <tr>
            <th colSpan={5} style={{ ...thStyle, background: colors.bg2, color: colors.green, textAlign: "center" }}>
              ◀ CALLS
            </th>
            <th style={{ ...thStyle, background: colors.bg3, color: colors.amber, textAlign: "center" }}>STRIKE</th>
            <th colSpan={5} style={{ ...thStyle, background: colors.bg2, color: colors.red, textAlign: "center" }}>
              PUTS ▶
            </th>
          </tr>
          <tr>
            <th style={{ ...thStyle, textAlign: "right" }}>IV</th>
            <th style={{ ...thStyle, textAlign: "right" }}>OI</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Bid</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Mark</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Ask</th>
            <th style={{ ...thStyle, textAlign: "center", color: colors.amber }}>K</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Bid</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Mark</th>
            <th style={{ ...thStyle, textAlign: "right" }}>Ask</th>
            <th style={{ ...thStyle, textAlign: "right" }}>OI</th>
            <th style={{ ...thStyle, textAlign: "right" }}>IV</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const tint = r.isATM ? "rgba(255,176,0,0.10)" : "transparent";
            const intMoney = (side: "call" | "put") =>
              side === "call" ? r.strike < spot : r.strike > spot;
            return (
              <tr key={r.strike} style={{ borderBottom: `1px solid ${colors.line}`, background: tint }}>
                <td style={{ ...tdRight, color: r.call ? colors.txt2 : colors.txt4 }}>
                  {r.call ? `${r.call.iv.toFixed(0)}%` : "—"}
                </td>
                <td style={{ ...tdRight, color: r.call ? colors.txt3 : colors.txt4 }}>
                  {r.call ? compact(r.call.oi) : "—"}
                </td>
                <td style={{ ...tdRight, color: r.call ? colors.green : colors.txt4, background: r.call && intMoney("call") ? "rgba(25,210,122,0.05)" : undefined }}>
                  {r.call ? r.call.bid.toFixed(2) : "—"}
                </td>
                <td style={{ ...tdRight, color: r.call ? colors.txt1 : colors.txt4, fontWeight: 600 }}>
                  {r.call ? r.call.mark.toFixed(2) : "—"}
                </td>
                <td style={{ ...tdRight, color: r.call ? colors.red : colors.txt4 }}>
                  {r.call ? r.call.ask.toFixed(2) : "—"}
                </td>
                <td
                  style={{
                    ...tdCenter,
                    color: r.isATM ? colors.amber : colors.amber,
                    fontWeight: r.isATM ? 700 : 600,
                    background: r.isATM ? colors.bg2 : colors.bg3,
                  }}
                >
                  {compact(r.strike)}
                  {r.isATM && <span style={{ marginLeft: 4, color: colors.amberBright, fontSize: 8 }}>◆</span>}
                </td>
                <td style={{ ...tdRight, color: r.put ? colors.green : colors.txt4 }}>
                  {r.put ? r.put.bid.toFixed(2) : "—"}
                </td>
                <td style={{ ...tdRight, color: r.put ? colors.txt1 : colors.txt4, fontWeight: 600 }}>
                  {r.put ? r.put.mark.toFixed(2) : "—"}
                </td>
                <td style={{ ...tdRight, color: r.put ? colors.red : colors.txt4, background: r.put && intMoney("put") ? "rgba(255,77,94,0.05)" : undefined }}>
                  {r.put ? r.put.ask.toFixed(2) : "—"}
                </td>
                <td style={{ ...tdRight, color: r.put ? colors.txt3 : colors.txt4 }}>
                  {r.put ? compact(r.put.oi) : "—"}
                </td>
                <td style={{ ...tdRight, color: r.put ? colors.txt2 : colors.txt4 }}>
                  {r.put ? `${r.put.iv.toFixed(0)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ArbitrageList({ items }: { items: OptionsArbitrage[] }) {
  if (items.length === 0) {
    return (
      <p style={{ padding: 16, color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>
        No arbitrage opportunities right now.
      </p>
    );
  }
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
        {items.slice(0, 20).map((a, i) => (
          <li
            key={i}
            style={{
              padding: "8px 10px",
              borderBottom: `1px solid ${colors.line}`,
              fontFamily: fonts.mono,
              fontSize: 10,
              display: "grid",
              gridTemplateColumns: "1fr auto",
              rowGap: 3,
              columnGap: 8,
            }}
          >
            <span style={{ display: "flex", alignItems: "baseline", gap: 6, gridColumn: "1 / -1" }}>
              <span style={{ color: a.side === "call" ? colors.green : colors.red, fontWeight: 600 }}>
                {a.side.toUpperCase()}
              </span>
              <span style={{ color: colors.amber, fontWeight: 600 }}>{compact(a.strike)}</span>
              <span style={{ color: colors.txt4 }}>{a.expiry}</span>
              <span style={{ marginLeft: "auto", color: colors.amber, fontWeight: 700 }}>
                {formatPercent(a.spreadPercent)}
              </span>
            </span>
            <span style={{ color: colors.txt3 }}>BUY</span>
            <span style={{ color: colors.green, textAlign: "right" }}>
              {a.buyExchange} @ {a.buyAsk.toFixed(2)}
            </span>
            <span style={{ color: colors.txt3 }}>SELL</span>
            <span style={{ color: colors.red, textAlign: "right" }}>
              {a.sellExchange} @ {a.sellBid.toFixed(2)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const thStyle: React.CSSProperties = {
  padding: "5px 6px",
  fontSize: 9,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: colors.txt3,
  borderBottom: `1px solid ${colors.line}`,
  background: colors.bg1,
  position: "sticky",
  top: 0,
  whiteSpace: "nowrap",
};

const tdRight: React.CSSProperties = {
  padding: "3px 6px",
  textAlign: "right",
  fontVariantNumeric: "tabular-nums",
};

const tdCenter: React.CSSProperties = {
  padding: "3px 6px",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

function compact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  if (abs < 0.01 && abs > 0) return n.toExponential(1);
  return n.toFixed(0);
}
