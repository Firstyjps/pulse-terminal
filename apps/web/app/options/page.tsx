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
  OptionsTermStructure,
} from "@pulse/sources";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";
import { useFlow } from "../../lib/use-flow";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";

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
 *   Row 4 (h-chart, 320px): IV TERM STRUCTURE c-7 + OI BY EXPIRY c-5
 */
type Side = "call" | "put";

interface Selected {
  strike: number;
  side: Side;
}

export default function OptionsPage() {
  const [asset, setAsset] = useState<OptionAsset>("BTC");
  const [expiry, setExpiry] = useState<string | null>(null);
  const [selected, setSelected] = useState<Selected | null>(null);

  const aggregate = useFlow<AggregateWithArb>(`/api/options/aggregate?asset=${asset}&arbitrage=1`);
  const ivSmile = useFlow<IVSmileResp>(
    expiry ? `/api/options/iv-smile?asset=${asset}&expiry=${expiry}` : `/api/options/iv-smile?asset=${asset}`,
  );
  const term = useFlow<OptionsTermStructure>(`/api/options/term-structure?asset=${asset}`);

  // First expiry is the default; user can switch.
  useEffect(() => {
    if (aggregate.data && !expiry && aggregate.data.expiries.length > 0) {
      setExpiry(aggregate.data.expiries[0]);
    }
  }, [aggregate.data, expiry]);

  // Reset selection when asset/expiry changes
  useEffect(() => { setSelected(null); }, [asset, expiry]);

  const opts = aggregate.data?.options ?? [];
  const expiries = aggregate.data?.expiries ?? [];
  const spot = aggregate.data?.underlyingPrice ?? ivSmile.data?.underlyingPrice ?? 0;
  const arbitrage = aggregate.data?.arbitrage ?? [];

  const stats = useMemo(() => buildStats(opts, expiry, spot), [opts, expiry, spot]);
  const ladderRows = useMemo(() => buildLadder(opts, expiry, spot), [opts, expiry, spot]);
  const ivPoints: IVPoint[] = useMemo(
    () => buildIvPoints(ivSmile.data, spot),
    [ivSmile.data, spot],
  );
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
          <StrikeLadder
            rows={ladderRows}
            spot={spot}
            selected={selected}
            onPick={(strike, side) =>
              setSelected((cur) =>
                cur && cur.strike === strike && cur.side === side ? null : { strike, side },
              )
            }
          />
        </Panel>
        <Panel
          span={5}
          title="IV SMILE"
          badge={ivSmile.data ? `${ivPoints.length} POINTS` : "LOADING"}
        >
          {ivSmile.data && ivPoints.length > 0 ? (
            <IVSmile
              data={ivPoints}
              spot={spot}
              splitSides
              selectedStrike={selected?.strike}
              selectedSide={selected?.side}
              height={380}
            />
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
          title={selected ? "POSITION SIMULATOR" : "ARBITRAGE HITS"}
          badge={
            selected
              ? `${selected.side.toUpperCase()} ${compact(selected.strike)}`
              : `${arbitrage.length} OPP`
          }
          flush
        >
          {selected ? (
            <PositionSimulator
              selected={selected}
              row={ladderRows.find((r) => r.strike === selected.strike) ?? null}
              spot={spot}
              expiry={expiry}
              onClose={() => setSelected(null)}
            />
          ) : (
            <ArbitrageList items={arbitrage} />
          )}
        </Panel>
      </WsRow>

      <WsRow height="auto" style={{ minHeight: 320 }}>
        <Panel
          span={7}
          title="IV TERM STRUCTURE"
          badge={
            term.data
              ? `${term.data.termStructure.length} EXPIRIES · ATM IV`
              : "LOADING"
          }
        >
          <TermStructureChart data={term.data} />
        </Panel>
        <Panel
          span={5}
          title="OI BY EXPIRY"
          badge={
            term.data
              ? `${compact(term.data.totals.totalOI)} TOTAL · P/C ${term.data.totals.putCallOIRatio.toFixed(2)}`
              : "LOADING"
          }
        >
          <OIByExpiryChart data={term.data} />
        </Panel>
      </WsRow>
    </Workspace>
  );
}

function TermStructureChart({ data }: { data: OptionsTermStructure | null }) {
  if (!data || data.termStructure.length === 0) {
    return (
      <p style={{ padding: 16, color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>
        No term-structure data
      </p>
    );
  }
  return (
    <div style={{ height: 280, padding: "8px 12px 12px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data.termStructure} margin={{ top: 6, right: 12, left: -8, bottom: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={colors.line} vertical={false} />
          <XAxis
            dataKey="dte"
            tickFormatter={(v: number) => (v < 1 ? "<1d" : `${Math.round(v)}d`)}
            tick={{ fill: colors.txt3, fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: colors.line }}
            tickLine={false}
            label={{ value: "DTE", position: "insideBottomRight", offset: -2, fill: colors.txt4, fontSize: 9 }}
          />
          <YAxis
            tickFormatter={(v: number) => `${v.toFixed(0)}%`}
            tick={{ fill: colors.txt3, fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: colors.line }}
            tickLine={false}
            domain={["auto", "auto"]}
          />
          <RTooltip
            contentStyle={{
              background: colors.bg2,
              border: `1px solid ${colors.line}`,
              fontFamily: "JetBrains Mono",
              fontSize: 11,
              padding: "6px 10px",
            }}
            labelStyle={{ color: colors.txt2, marginBottom: 4 }}
            itemStyle={{ color: colors.txt1 }}
            formatter={(value: number, name: string) => [`${value.toFixed(2)}%`, name]}
            labelFormatter={(label: number, items) => {
              const point = items?.[0]?.payload as typeof data.termStructure[number] | undefined;
              if (!point) return `DTE ${label.toFixed(1)}d`;
              return `${point.expiry} · ${label.toFixed(1)}d · K ${point.atmStrike}`;
            }}
          />
          <Legend
            verticalAlign="top"
            height={20}
            iconType="line"
            wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 10, color: colors.txt3 }}
          />
          <Line
            type="monotone"
            dataKey="atmIV"
            name="ATM IV"
            stroke={colors.amber}
            strokeWidth={2}
            dot={{ r: 3, fill: colors.amber }}
            activeDot={{ r: 5 }}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="atmCallIV"
            name="Call IV"
            stroke={colors.green}
            strokeWidth={1.25}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="atmPutIV"
            name="Put IV"
            stroke={colors.red}
            strokeWidth={1.25}
            strokeDasharray="3 3"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function OIByExpiryChart({ data }: { data: OptionsTermStructure | null }) {
  if (!data || data.termStructure.length === 0) {
    return (
      <p style={{ padding: 16, color: colors.txt3, fontSize: 11, fontFamily: fonts.mono }}>
        No OI data
      </p>
    );
  }
  // Show only the next 12 expiries to avoid clutter on /SOL where there are 60+
  const series = data.termStructure.slice(0, 12).map((p) => ({
    expiry: p.expiry.length === 8 ? `${p.expiry.slice(4, 6)}/${p.expiry.slice(6, 8)}` : p.expiry,
    callOI: p.callOI,
    putOI: p.putOI,
  }));
  return (
    <div style={{ height: 280, padding: "8px 12px 12px" }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={series} margin={{ top: 6, right: 8, left: -12, bottom: 8 }}>
          <CartesianGrid strokeDasharray="2 4" stroke={colors.line} vertical={false} />
          <XAxis
            dataKey="expiry"
            tick={{ fill: colors.txt3, fontSize: 9, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: colors.line }}
            tickLine={false}
            interval={0}
            angle={-30}
            height={40}
            textAnchor="end"
          />
          <YAxis
            tickFormatter={(v: number) => compact(v)}
            tick={{ fill: colors.txt3, fontSize: 10, fontFamily: "JetBrains Mono" }}
            axisLine={{ stroke: colors.line }}
            tickLine={false}
          />
          <RTooltip
            contentStyle={{
              background: colors.bg2,
              border: `1px solid ${colors.line}`,
              fontFamily: "JetBrains Mono",
              fontSize: 11,
              padding: "6px 10px",
            }}
            labelStyle={{ color: colors.txt2 }}
            itemStyle={{ color: colors.txt1 }}
            formatter={(value: number, name: string) => [compact(value), name]}
          />
          <Legend
            verticalAlign="top"
            height={20}
            wrapperStyle={{ fontFamily: "JetBrains Mono", fontSize: 10, color: colors.txt3 }}
          />
          <Bar dataKey="callOI" name="Call OI" stackId="oi" fill={colors.green} isAnimationActive={false}>
            {series.map((_, i) => <Cell key={`c-${i}`} fill={colors.green} fillOpacity={0.85} />)}
          </Bar>
          <Bar dataKey="putOI" name="Put OI" stackId="oi" fill={colors.red} isAnimationActive={false}>
            {series.map((_, i) => <Cell key={`p-${i}`} fill={colors.red} fillOpacity={0.85} />)}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
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

function buildIvPoints(s: IVSmileResp | null, spot: number): IVPoint[] {
  if (!s) return [];
  // Per (strike, side), prefer Deribit's IV — it is the deepest options book
  // in crypto and its mark IV is the cleanest. Bybit / OKX / Binance often
  // serve stale or wide-spread IVs that hit 100%+ on illiquid strikes.
  // Falls back to Bybit → OKX → Binance if Deribit didn't quote that strike.
  // Also restrict to strikes within ±20% of spot — beyond that, the deep
  // ITM/OTM rows in this contract are illiquid and the IV reading is mostly
  // noise, which both makes the smile chart unreadable and isn't actionable.
  const PREF: Record<string, number> = { Deribit: 0, Bybit: 1, OKX: 2, Binance: 3 };
  const best = new Map<string, { strike: number; side: "call" | "put"; iv: number; rank: number }>();
  const minK = spot > 0 ? spot * 0.8 : 0;
  const maxK = spot > 0 ? spot * 1.2 : Number.POSITIVE_INFINITY;
  const accept = (
    strike: number,
    iv: number,
    side: "call" | "put",
    exchange: string,
  ) => {
    if (!Number.isFinite(iv) || iv < 5 || iv > 200) return;
    if (strike < minK || strike > maxK) return;
    const rank = PREF[exchange] ?? 99;
    const key = `${strike}-${side}`;
    const cur = best.get(key);
    if (!cur || rank < cur.rank) best.set(key, { strike, side, iv, rank });
  };
  for (const c of s.calls) accept(c.strike, c.iv, "call", c.exchange);
  for (const p of s.puts) accept(p.strike, p.iv, "put", p.exchange);
  return Array.from(best.values())
    .map((v) => ({ strike: v.strike, iv: +v.iv.toFixed(1), side: v.side }))
    .sort((a, b) => a.strike - b.strike || (a.side === "call" ? -1 : 1));
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

function StrikeLadder({
  rows,
  spot,
  selected,
  onPick,
}: {
  rows: LadderRow[];
  spot: number;
  selected: Selected | null;
  onPick: (strike: number, side: Side) => void;
}) {
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
            const intMoney = (side: Side) =>
              side === "call" ? r.strike < spot : r.strike > spot;
            const callSelected = selected?.strike === r.strike && selected.side === "call";
            const putSelected = selected?.strike === r.strike && selected.side === "put";
            const callBg = callSelected
              ? "rgba(52,211,153,0.18)"
              : r.call && intMoney("call")
              ? "rgba(25,210,122,0.05)"
              : undefined;
            const putBg = putSelected
              ? "rgba(248,113,113,0.18)"
              : r.put && intMoney("put")
              ? "rgba(255,77,94,0.05)"
              : undefined;
            const callPickable = !!r.call;
            const putPickable = !!r.put;
            const onCallClick = () => callPickable && onPick(r.strike, "call");
            const onPutClick = () => putPickable && onPick(r.strike, "put");
            return (
              <tr key={r.strike} style={{ borderBottom: `1px solid ${colors.line}`, background: tint }}>
                <td onClick={onCallClick} style={{ ...tdRight, color: r.call ? colors.txt2 : colors.txt4, background: callBg, cursor: callPickable ? "pointer" : "default" }}>
                  {r.call ? `${r.call.iv.toFixed(0)}%` : "—"}
                </td>
                <td onClick={onCallClick} style={{ ...tdRight, color: r.call ? colors.txt3 : colors.txt4, background: callBg, cursor: callPickable ? "pointer" : "default" }}>
                  {r.call ? compact(r.call.oi) : "—"}
                </td>
                <td onClick={onCallClick} style={{ ...tdRight, color: r.call ? colors.green : colors.txt4, background: callBg, cursor: callPickable ? "pointer" : "default" }}>
                  {r.call ? r.call.bid.toFixed(2) : "—"}
                </td>
                <td onClick={onCallClick} style={{ ...tdRight, color: r.call ? colors.txt1 : colors.txt4, fontWeight: 600, background: callBg, cursor: callPickable ? "pointer" : "default" }}>
                  {r.call ? r.call.mark.toFixed(2) : "—"}
                </td>
                <td onClick={onCallClick} style={{ ...tdRight, color: r.call ? colors.red : colors.txt4, background: callBg, cursor: callPickable ? "pointer" : "default" }}>
                  {r.call ? r.call.ask.toFixed(2) : "—"}
                </td>
                <td
                  style={{
                    ...tdCenter,
                    color: colors.amber,
                    fontWeight: r.isATM ? 700 : 600,
                    background: r.isATM ? colors.bg2 : colors.bg3,
                  }}
                >
                  {compact(r.strike)}
                  {r.isATM && <span style={{ marginLeft: 4, color: colors.amberBright, fontSize: 8 }}>◆</span>}
                </td>
                <td onClick={onPutClick} style={{ ...tdRight, color: r.put ? colors.green : colors.txt4, background: putBg, cursor: putPickable ? "pointer" : "default" }}>
                  {r.put ? r.put.bid.toFixed(2) : "—"}
                </td>
                <td onClick={onPutClick} style={{ ...tdRight, color: r.put ? colors.txt1 : colors.txt4, fontWeight: 600, background: putBg, cursor: putPickable ? "pointer" : "default" }}>
                  {r.put ? r.put.mark.toFixed(2) : "—"}
                </td>
                <td onClick={onPutClick} style={{ ...tdRight, color: r.put ? colors.red : colors.txt4, background: putBg, cursor: putPickable ? "pointer" : "default" }}>
                  {r.put ? r.put.ask.toFixed(2) : "—"}
                </td>
                <td onClick={onPutClick} style={{ ...tdRight, color: r.put ? colors.txt3 : colors.txt4, background: putBg, cursor: putPickable ? "pointer" : "default" }}>
                  {r.put ? compact(r.put.oi) : "—"}
                </td>
                <td onClick={onPutClick} style={{ ...tdRight, color: r.put ? colors.txt2 : colors.txt4, background: putBg, cursor: putPickable ? "pointer" : "default" }}>
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

/**
 * PositionSimulator — quick "what if I buy this option" panel.
 *
 * Plain expiry P&L (intrinsic value − premium paid) across a range of spot
 * outcomes. Skips a real Black-Scholes pricer because the user only needs
 * to eyeball whether the trade has reasonable risk/reward, not to mark a
 * position to model. Premium uses the ask (buy) by default.
 */
function PositionSimulator({
  selected,
  row,
  spot,
  expiry,
  onClose,
}: {
  selected: Selected;
  row: LadderRow | null;
  spot: number;
  expiry: string | null;
  onClose: () => void;
}) {
  const quote = selected.side === "call" ? row?.call : row?.put;
  if (!quote || !spot) {
    return (
      <p style={{ padding: 14, color: colors.txt3, fontFamily: fonts.mono, fontSize: 11 }}>
        No quote for this strike yet — pick another row in the ladder.
      </p>
    );
  }

  const premium = quote.ask > 0 ? quote.ask : quote.mark;
  const isCall = selected.side === "call";
  const breakeven = isCall ? selected.strike + premium : selected.strike - premium;
  const dte = expiry ? daysToExpiry(expiry) : null;

  const offsets = [-0.2, -0.1, -0.05, 0, 0.05, 0.1, 0.2];
  const scenarios = offsets.map((o) => {
    const target = spot * (1 + o);
    const intrinsic = isCall
      ? Math.max(0, target - selected.strike)
      : Math.max(0, selected.strike - target);
    const pnl = intrinsic - premium;
    const roi = premium > 0 ? (pnl / premium) * 100 : 0;
    return { o, target, pnl, roi };
  });

  const accent = isCall ? colors.green : colors.red;

  return (
    <div style={{ height: "100%", overflow: "auto", fontFamily: fonts.mono, fontSize: 11 }}>
      {/* Header with key stats */}
      <div style={{ padding: "10px 12px", borderBottom: `1px solid ${colors.line}` }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
          <span style={{ color: accent, fontWeight: 700, fontSize: 13 }}>
            BUY {selected.side.toUpperCase()}
          </span>
          <span style={{ color: colors.amber, fontWeight: 600 }}>
            K {compact(selected.strike)}
          </span>
          <span style={{ color: colors.txt4 }}>· {quote.exchange}</span>
          <button
            onClick={onClose}
            title="Clear selection"
            style={{
              marginLeft: "auto",
              background: "transparent",
              border: `1px solid ${colors.line2}`,
              color: colors.txt3,
              fontFamily: "inherit",
              fontSize: 9,
              padding: "1px 6px",
              cursor: "pointer",
              letterSpacing: "0.08em",
            }}
          >
            ✕ CLEAR
          </button>
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 6,
            color: colors.txt3,
            fontSize: 10,
            lineHeight: 1.5,
          }}
        >
          <span>
            <span style={{ color: colors.txt4 }}>premium </span>
            <span style={{ color: colors.txt1, fontWeight: 600 }}>
              ${premium.toFixed(2)}
            </span>
          </span>
          <span>
            <span style={{ color: colors.txt4 }}>breakeven </span>
            <span style={{ color: colors.amber, fontWeight: 600 }}>
              ${breakeven.toLocaleString(undefined, { maximumFractionDigits: 0 })}
            </span>
          </span>
          <span>
            <span style={{ color: colors.txt4 }}>iv </span>
            <span style={{ color: colors.txt2 }}>{quote.iv.toFixed(0)}%</span>
          </span>
          <span>
            <span style={{ color: colors.txt4 }}>dte </span>
            <span style={{ color: colors.txt2 }}>{dte ?? "—"}d</span>
          </span>
          <span>
            <span style={{ color: colors.txt4 }}>spot </span>
            <span style={{ color: colors.txt2 }}>${spot.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
          </span>
          <span>
            <span style={{ color: colors.txt4 }}>oi </span>
            <span style={{ color: colors.txt2 }}>{compact(quote.oi)}</span>
          </span>
        </div>
      </div>

      {/* Scenarios at expiry */}
      <div style={{ padding: "8px 12px 6px" }}>
        <div
          style={{
            color: colors.txt4,
            fontSize: 9,
            letterSpacing: "0.10em",
            marginBottom: 6,
            textTransform: "uppercase",
          }}
        >
          ▸ P/L at expiry
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ color: colors.txt4 }}>
              <th style={{ ...thSim }}>Spot Δ</th>
              <th style={{ ...thSim, textAlign: "right" }}>Spot $</th>
              <th style={{ ...thSim, textAlign: "right" }}>P/L</th>
              <th style={{ ...thSim, textAlign: "right" }}>ROI</th>
            </tr>
          </thead>
          <tbody>
            {scenarios.map((s) => {
              const isCenter = s.o === 0;
              const c = s.pnl >= 0 ? colors.green : colors.red;
              return (
                <tr
                  key={s.o}
                  style={{
                    borderBottom: `1px dashed ${colors.line}`,
                    background: isCenter ? "rgba(255,176,0,0.06)" : undefined,
                  }}
                >
                  <td style={{ ...tdSim, color: colors.txt3 }}>
                    {s.o > 0 ? "+" : ""}{(s.o * 100).toFixed(0)}%
                  </td>
                  <td style={{ ...tdSim, textAlign: "right", color: colors.txt2 }}>
                    {s.target.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                  </td>
                  <td style={{ ...tdSim, textAlign: "right", color: c, fontWeight: 600 }}>
                    {s.pnl >= 0 ? "+" : ""}${s.pnl.toFixed(0)}
                  </td>
                  <td style={{ ...tdSim, textAlign: "right", color: c, fontWeight: 600 }}>
                    {s.roi >= 0 ? "+" : ""}{s.roi.toFixed(0)}%
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div style={{ marginTop: 6, color: colors.txt4, fontSize: 9 }}>
          Max loss locked at premium (${premium.toFixed(2)}). {isCall ? "Upside unbounded." : "Max profit at $0 = $" + (selected.strike - premium).toFixed(0)}
        </div>
      </div>
    </div>
  );
}

function daysToExpiry(yyyymmdd: string): number | null {
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(yyyymmdd);
  if (!m) return null;
  const exp = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const now = Date.now();
  const days = Math.round((exp - now) / 86_400_000);
  return Math.max(0, days);
}

const thSim: React.CSSProperties = {
  padding: "4px 6px",
  textAlign: "left",
  fontSize: 9,
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  color: colors.txt4,
  borderBottom: `1px solid ${colors.line}`,
  whiteSpace: "nowrap",
};

const tdSim: React.CSSProperties = {
  padding: "4px 6px",
  fontVariantNumeric: "tabular-nums",
  whiteSpace: "nowrap",
};

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
