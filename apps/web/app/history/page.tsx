"use client";

import { useEffect, useMemo, useState } from "react";
import { Panel, WsRow, Workspace, StatBlock, colors, fonts } from "@pulse/ui";
import { PriceLine, type PriceLinePoint } from "@pulse/charts";
import { formatUSD } from "@pulse/sources";
import type { MarketSnapshot } from "@pulse/sources";
import { useFlow } from "../../lib/use-flow";
import { useToast } from "../../components/ToastProvider";

type Tab = "market" | "coins";
type WindowDays = 30 | 60 | 90;
type MarketMetric = "totalMcap" | "totalVolume" | "btcDominance" | "fgValue";

interface HistoryResp {
  days: number;
  history: MarketSnapshot[];
  stats: { count: number; earliest: string | null; latest: string | null };
  ts: number;
  error?: string;
}

const WINDOWS: WindowDays[] = [30, 60, 90];

const METRIC_LABEL: Record<MarketMetric, string> = {
  totalMcap: "TOTAL MARKET CAP",
  totalVolume: "TOTAL VOLUME 24H",
  btcDominance: "BTC DOMINANCE",
  fgValue: "FEAR & GREED",
};

const METRIC_COLOR: Record<MarketMetric, string> = {
  totalMcap: colors.amber,
  totalVolume: colors.cyan,
  btcDominance: colors.gold,
  fgValue: "#9ade2f",
};

/**
 * Market History — Phase 6 snapshot timeline.
 *
 *   Row 1 (h-stats): SUMMARY (count, earliest, latest, 30d Δ)
 *   Row 2 (auto, ≥360px): MARKET TAB or COINS TAB
 *   Row 3 (h-table, 280px): RECENT SNAPSHOTS table (last 14)
 */
export default function HistoryPage() {
  const [tab, setTab] = useState<Tab>("market");
  const [windowDays, setWindowDays] = useState<WindowDays>(30);
  const [metric, setMetric] = useState<MarketMetric>("totalMcap");
  const [refreshKey, setRefreshKey] = useState(0);

  const { data, loading, error } = useFlow<HistoryResp>(
    `/api/snapshot/history?days=${windowDays}`,
    refreshKey,
  );

  const toast = useToast();

  // Keyboard shortcut: H to focus the history page (matches spec).
  // Already routes here, but if H pressed while ON /history, refresh.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "h" || e.key === "H") {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        setRefreshKey((k) => k + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const seriesPoints = useMemo<PriceLinePoint[]>(() => {
    if (!data?.history) return [];
    return data.history
      .map((s) => {
        const value = readMetric(s, metric);
        return value != null
          ? { time: Math.floor(s.ts / 1000), value }
          : null;
      })
      .filter((p): p is PriceLinePoint => p !== null);
  }, [data, metric]);

  // For the COIN tab — list of coin ids that appear at least 5 times.
  const coinOptions = useMemo(() => {
    if (!data?.history) return [];
    const counts = new Map<string, { id: string; symbol: string; count: number }>();
    for (const s of data.history) {
      for (const c of s.top10) {
        const cur = counts.get(c.id) ?? { id: c.id, symbol: c.symbol, count: 0 };
        cur.count += 1;
        counts.set(c.id, cur);
      }
    }
    return [...counts.values()]
      .filter((c) => c.count >= 1)
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const [selectedCoin, setSelectedCoin] = useState<string>("bitcoin");
  useEffect(() => {
    if (coinOptions.length && !coinOptions.some((c) => c.id === selectedCoin)) {
      setSelectedCoin(coinOptions[0].id);
    }
  }, [coinOptions, selectedCoin]);

  const coinSeries = useMemo<PriceLinePoint[]>(() => {
    if (!data?.history) return [];
    return data.history
      .map((s) => {
        const c = s.top10.find((x) => x.id === selectedCoin);
        return c
          ? { time: Math.floor(s.ts / 1000), value: c.price }
          : null;
      })
      .filter((p): p is PriceLinePoint => p !== null);
  }, [data, selectedCoin]);

  // Window delta for SUMMARY card
  const winFirst = data?.history[0];
  const winLast = data?.history[data.history.length - 1];
  const winDelta =
    winFirst && winLast && winFirst.totalMcap > 0
      ? ((winLast.totalMcap - winFirst.totalMcap) / winFirst.totalMcap) * 100
      : null;
  const winDeltaColor = winDelta == null ? colors.txt3 : winDelta >= 0 ? colors.green : colors.red;

  async function exportJson() {
    try {
      // Trigger native download by navigating to the export endpoint.
      window.open("/api/snapshot/history/export", "_blank");
      toast.push({ tone: "success", title: "Export started", body: "Check your downloads folder." });
    } catch (err) {
      toast.push({ tone: "error", title: "Export failed", body: (err as Error).message });
    }
  }

  async function clearAll() {
    if (!window.confirm("Clear ALL snapshot history? This cannot be undone.")) return;
    try {
      const res = await fetch("/api/snapshot/history/clear", { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setRefreshKey((k) => k + 1);
      toast.push({ tone: "info", title: "History cleared", body: "All snapshots removed. Cron will start fresh tonight." });
    } catch (err) {
      toast.push({ tone: "error", title: "Clear failed", body: (err as Error).message });
    }
  }

  async function backfillNow() {
    try {
      const res = await fetch("/api/snapshot/history", { method: "POST" });
      const json = (await res.json()) as { skipped?: boolean; reason?: string; date?: string };
      if (json.skipped) {
        toast.push({ tone: "info", title: "Skipped", body: json.reason ?? "—" });
      } else {
        toast.push({ tone: "success", title: "Snapshot saved", body: `Date ${json.date}` });
        setRefreshKey((k) => k + 1);
      }
    } catch (err) {
      toast.push({ tone: "error", title: "Backfill failed", body: (err as Error).message });
    }
  }

  return (
    <Workspace>
      <WsRow height="stats">
        <Panel
          span={12}
          title="MARKET HISTORY"
          badge={`SQLITE · 90D ROLLING · ${data?.stats.count ?? 0} ROWS`}
          actions={
            <span style={{ display: "flex", gap: 6 }}>
              <button onClick={backfillNow} style={btnStyle()} title="Force collect today's snapshot now (instead of waiting for 00:05 UTC cron)">
                ▶ COLLECT NOW
              </button>
              <button onClick={exportJson} style={btnStyle()}>⬇ EXPORT JSON</button>
              <button onClick={clearAll} style={btnStyle({ danger: true })}>🗑 CLEAR</button>
            </span>
          }
          flush
        >
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: colors.line, height: "100%" }}>
            <StatBlock
              label="Snapshots Stored"
              value={data?.stats.count?.toString() ?? "—"}
              sub="rows in market_snapshots"
            />
            <StatBlock
              label="Earliest"
              value={data?.stats.earliest ?? "—"}
              sub="oldest sample"
            />
            <StatBlock
              label="Latest"
              value={data?.stats.latest ?? "—"}
              sub="most recent sample"
            />
            <StatBlock
              label={`${windowDays}d Window Δ`}
              value={winDelta != null ? `${winDelta >= 0 ? "+" : ""}${winDelta.toFixed(2)}%` : "—"}
              deltaColor={winDeltaColor}
              sub="total mcap drift"
            />
          </div>
        </Panel>
      </WsRow>

      <WsRow height="auto" style={{ minHeight: 380 }}>
        <Panel
          span={12}
          title={tab === "market" ? METRIC_LABEL[metric] : `${selectedCoin.toUpperCase()} PRICE`}
          badge={`${windowDays}D · ${seriesPoints.length} POINTS`}
          actions={
            <span style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {/* Tab switcher */}
              <span style={{ display: "inline-flex", gap: 1, background: colors.line }}>
                {(["market", "coins"] as Tab[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    style={tabBtn(tab === t)}
                  >
                    {t === "market" ? "MARKET" : "COINS"}
                  </button>
                ))}
              </span>
              {/* Window selector */}
              <span style={{ display: "inline-flex", gap: 1, background: colors.line }}>
                {WINDOWS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setWindowDays(w)}
                    style={tabBtn(windowDays === w)}
                  >
                    {w}D
                  </button>
                ))}
              </span>
              {tab === "market" && (
                <select
                  value={metric}
                  onChange={(e) => setMetric(e.target.value as MarketMetric)}
                  style={selectStyle}
                >
                  {(Object.keys(METRIC_LABEL) as MarketMetric[]).map((m) => (
                    <option key={m} value={m}>{METRIC_LABEL[m]}</option>
                  ))}
                </select>
              )}
              {tab === "coins" && (
                <select
                  value={selectedCoin}
                  onChange={(e) => setSelectedCoin(e.target.value)}
                  style={selectStyle}
                >
                  {coinOptions.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.symbol} ({c.count} pts)
                    </option>
                  ))}
                </select>
              )}
            </span>
          }
          flush
          scrollable={false}
        >
          <ChartBody
            data={tab === "market" ? seriesPoints : coinSeries}
            color={tab === "market" ? METRIC_COLOR[metric] : colors.amber}
            loading={loading && !data}
            error={error}
            count={data?.stats.count ?? 0}
            priceFormatter={tab === "market" ? formatterFor(metric) : formatterPrice}
          />
        </Panel>
      </WsRow>

      <WsRow height="table">
        <Panel span={12} title="RECENT SNAPSHOTS" badge={`LAST ${Math.min(14, data?.history.length ?? 0)}`} flush>
          <div style={{ height: "100%", overflow: "auto" }}>
            <table style={tableStyle}>
              <thead>
                <tr style={trHeadStyle}>
                  <th style={th}>Date</th>
                  <th style={{ ...th, textAlign: "right" }}>Total Mcap</th>
                  <th style={{ ...th, textAlign: "right" }}>Volume 24h</th>
                  <th style={{ ...th, textAlign: "right" }}>BTC.D</th>
                  <th style={{ ...th, textAlign: "right" }}>ETH.D</th>
                  <th style={{ ...th, textAlign: "right" }}>F&G</th>
                  <th style={{ ...th, textAlign: "right" }}>BTC Px</th>
                </tr>
              </thead>
              <tbody>
                {data?.history
                  .slice()
                  .reverse()
                  .slice(0, 14)
                  .map((s) => {
                    const btc = s.top10.find((c) => c.symbol === "BTC");
                    return (
                      <tr key={s.date} style={{ borderBottom: `1px dashed ${colors.line}` }}>
                        <td style={{ ...td, color: colors.amber, fontWeight: 600 }}>{s.date}</td>
                        <td style={{ ...td, textAlign: "right", color: colors.txt1 }}>
                          {formatUSD(s.totalMcap, { compact: true, decimals: 2 })}
                        </td>
                        <td style={{ ...td, textAlign: "right", color: colors.txt2 }}>
                          {formatUSD(s.totalVolume, { compact: true, decimals: 1 })}
                        </td>
                        <td style={{ ...td, textAlign: "right", color: colors.gold }}>{s.btcDominance.toFixed(2)}%</td>
                        <td style={{ ...td, textAlign: "right", color: colors.cyan }}>{s.ethDominance.toFixed(2)}%</td>
                        <td style={{ ...td, textAlign: "right", color: fgColor(s.fgValue) }}>{s.fgValue ?? "—"}</td>
                        <td style={{ ...td, textAlign: "right", color: colors.txt2 }}>
                          {btc ? formatUSD(btc.price, { compact: false, decimals: 0 }) : "—"}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
            {data && data.history.length === 0 && (
              <p style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
                No snapshots yet. Click <strong>▶ COLLECT NOW</strong> to capture today's row, or wait for the
                00:05 UTC cron tonight.
              </p>
            )}
          </div>
        </Panel>
      </WsRow>
    </Workspace>
  );
}

function ChartBody({
  data,
  color,
  loading,
  error,
  count,
  priceFormatter,
}: {
  data: PriceLinePoint[];
  color: string;
  loading: boolean;
  error: string | null;
  count: number;
  priceFormatter?: (v: number) => string;
}) {
  if (loading) {
    return (
      <p style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>Loading history…</p>
    );
  }
  if (error) {
    return (
      <p style={{ padding: 14, fontSize: 11, color: colors.red, fontFamily: fonts.mono }}>
        DATA UNAVAILABLE — {error}
      </p>
    );
  }
  if (data.length === 0) {
    return (
      <div style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
        {count === 0
          ? "No snapshots stored yet. Click ▶ COLLECT NOW above to capture today's row."
          : "No data points for the selected window/metric."}
      </div>
    );
  }
  return (
    <div style={{ height: "100%", padding: "8px 0" }}>
      <PriceLine
        data={data}
        height={340}
        color={color}
        filled
        showVolume={false}
        priceFormatter={priceFormatter}
      />
    </div>
  );
}

function formatterFor(metric: MarketMetric): (v: number) => string {
  switch (metric) {
    case "totalMcap":
    case "totalVolume":
      return (v) => formatUSD(v, { compact: true, decimals: 2 });
    case "btcDominance":
      return (v) => `${v.toFixed(2)}%`;
    case "fgValue":
      return (v) => v.toFixed(0);
  }
}

const formatterPrice = (v: number) => formatUSD(v, { compact: v >= 1000, decimals: v >= 1000 ? 2 : 4 });

function readMetric(s: MarketSnapshot, m: MarketMetric): number | null {
  switch (m) {
    case "totalMcap": return s.totalMcap > 0 ? s.totalMcap : null;
    case "totalVolume": return s.totalVolume > 0 ? s.totalVolume : null;
    case "btcDominance": return s.btcDominance > 0 ? s.btcDominance : null;
    case "fgValue": return s.fgValue;
  }
}

function fgColor(v: number | null): string {
  if (v == null) return colors.txt3;
  if (v < 25) return colors.red;
  if (v < 45) return colors.orange;
  if (v < 55) return colors.amber;
  if (v < 75) return "#9ade2f";
  return colors.green;
}

function btnStyle(opts: { danger?: boolean } = {}): React.CSSProperties {
  return {
    background: opts.danger ? "transparent" : colors.bg2,
    border: `1px solid ${opts.danger ? colors.red2 : colors.line2}`,
    color: opts.danger ? colors.red : colors.txt2,
    padding: "3px 10px",
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: "0.08em",
    cursor: "pointer",
    fontWeight: 600,
  };
}

function tabBtn(active: boolean): React.CSSProperties {
  return {
    background: active ? colors.bg2 : colors.bg1,
    border: `1px solid ${active ? colors.amberDim : colors.line2}`,
    color: active ? colors.amber : colors.txt3,
    padding: "3px 10px",
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: "0.08em",
    cursor: "pointer",
    fontWeight: active ? 700 : 500,
  };
}

const selectStyle: React.CSSProperties = {
  background: colors.bg2,
  border: `1px solid ${colors.line2}`,
  color: colors.amber,
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 10,
  padding: "3px 6px",
  outline: "none",
  cursor: "pointer",
  letterSpacing: "0.06em",
};

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontFamily: "JetBrains Mono, monospace",
  fontSize: 11,
};
const trHeadStyle: React.CSSProperties = {
  textAlign: "left",
  color: colors.txt3,
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  fontSize: 9,
};
const th: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: `1px solid ${colors.line}`,
  background: colors.bg1,
  position: "sticky",
  top: 0,
  fontWeight: 500,
};
const td: React.CSSProperties = {
  padding: "5px 10px",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};
