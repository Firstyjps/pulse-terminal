"use client";

import { useMemo, useState } from "react";
import { Panel, WsRow, Workspace, StatBlock, colors, fonts } from "@pulse/ui";
import { useFlow } from "../../lib/use-flow";

interface HourlyAprStat {
  hour_ict: number;
  avg_apr: number;
  max_apr: number;
  min_apr: number;
  avg_price: number;
  avg_iv: number | null;
  samples: number;
}

interface BestHourReport {
  period_days: number;
  target_price: number;
  coin_pair: string;
  overall_avg_apr: number;
  best_hours: HourlyAprStat[];
  hot_hours: number[];
  cold_hours: number[];
  hourly_data: HourlyAprStat[];
  recommendation: string;
}

interface Snapshot {
  timestamp_utc: string;
  timestamp_ict: string;
  hour_ict: number;
  coin_pair: string;
  direction: string;
  target_price: number;
  apr_pct: number;
  duration: string;
  settlement_utc: string | null;
  index_price: number | null;
  is_vip_only: number;
  sol_iv_pct: number | null;
}

interface DailySummary {
  date: string;
  coin_pair: string;
  target_price: number;
  avg_apr: number | null;
  max_apr: number | null;
  min_apr: number | null;
  best_hour_ict: number | null;
  worst_hour_ict: number | null;
  avg_index_price: number | null;
  sample_count: number;
}

const TARGETS = [78, 80] as const;
type Target = (typeof TARGETS)[number];

/**
 * Dual Assets — Bybit Earn APR analytics.
 *
 *   Row 1 (h-stats, 116px): KPIs (current APR / 7d avg / best hour / sample count)
 *   Row 2 (h-chart, 360px): HOURLY APR HEATMAP c-8 + RECOMMENDATION c-4
 *   Row 3 (h-table, 340px): RECENT SNAPSHOTS c-7 + DAILY SUMMARY c-5
 */
export default function DualAssetsPage() {
  const [target, setTarget] = useState<Target>(78);
  const [days, setDays] = useState<7 | 14 | 30>(7);

  const bestHour = useFlow<BestHourReport | { error: string }>(
    `/api/dual-assets/best-hour?coin_pair=SOL-USDT&target=${target}&days=${days}`,
  );
  const snapshots = useFlow<{ count: number; records: Snapshot[] }>(
    `/api/dual-assets/snapshots?limit=50`,
  );
  const summary = useFlow<{ count: number; summaries: DailySummary[] }>(
    `/api/dual-assets/summary?coin_pair=SOL-USDT&target=${target}&days=30`,
  );

  const report =
    bestHour.data && !("error" in bestHour.data) ? (bestHour.data as BestHourReport) : null;
  const reportError =
    bestHour.data && "error" in bestHour.data ? bestHour.data.error : null;

  const hourlyMap = useMemo(() => {
    const m = new Map<number, HourlyAprStat>();
    if (!report) return m;
    for (const h of report.hourly_data) m.set(h.hour_ict, h);
    return m;
  }, [report]);

  const filteredSnapshots = useMemo(() => {
    if (!snapshots.data) return [];
    return snapshots.data.records
      .filter((r) => r.target_price === target)
      .slice(0, 30);
  }, [snapshots.data, target]);

  const latestSnapshot = filteredSnapshots[0];
  const maxHourlyApr = report
    ? Math.max(...report.hourly_data.map((h) => h.avg_apr), 0.001)
    : 0.001;

  const headerActions = (
    <span style={{ display: "flex", gap: 1, background: colors.line }}>
      {TARGETS.map((t) => (
        <button
          key={t}
          onClick={() => setTarget(t)}
          style={{
            background: target === t ? colors.bg2 : colors.bg1,
            border: "none",
            color: target === t ? colors.amber : colors.txt3,
            padding: "3px 12px",
            fontFamily: fonts.mono,
            fontSize: 9,
            letterSpacing: "0.10em",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
        >
          ${t}
        </button>
      ))}
    </span>
  );

  return (
    <Workspace>
      {/* Row 1 — KPI strip */}
      <WsRow height="stats">
        <Panel
          span={12}
          title="DUAL ASSETS · BYBIT"
          badge={`SOL-USDT · ${days}D`}
          actions={headerActions}
          flush
        >
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(4, 1fr)",
              gap: 1,
              background: colors.line,
              height: "100%",
            }}
          >
            <StatBlock
              label="Current APR"
              value={latestSnapshot ? `${latestSnapshot.apr_pct.toFixed(2)}%` : "—"}
              delta={latestSnapshot ? latestSnapshot.direction : ""}
              deltaColor={
                latestSnapshot && latestSnapshot.direction === "BuyLow"
                  ? colors.green
                  : colors.red
              }
              sub={latestSnapshot ? formatICT(latestSnapshot.timestamp_ict) : "no data"}
            />
            <StatBlock
              label={`${days}D Avg APR`}
              value={report ? `${report.overall_avg_apr.toFixed(2)}%` : "—"}
              delta={report ? `target $${report.target_price}` : ""}
              deltaColor={colors.amber}
              sub={report ? `${report.hourly_data.length} active hours` : ""}
            />
            <StatBlock
              label="Best Hour (ICT)"
              value={report && report.best_hours[0] ? `${pad2(report.best_hours[0].hour_ict)}:00` : "—"}
              delta={
                report && report.best_hours[0]
                  ? `${report.best_hours[0].avg_apr.toFixed(2)}% avg`
                  : ""
              }
              deltaColor={colors.green}
              sub={
                report && report.best_hours[0]
                  ? `n=${report.best_hours[0].samples} · max ${report.best_hours[0].max_apr.toFixed(1)}%`
                  : ""
              }
            />
            <StatBlock
              label="Snapshots Captured"
              value={
                snapshots.data ? snapshots.data.count.toLocaleString() : "—"
              }
              delta={
                summary.data
                  ? `${summary.data.count} daily rollups`
                  : ""
              }
              deltaColor={colors.cyan}
              sub="cron 5min · rollup 00:05 ICT"
            />
          </div>
        </Panel>
      </WsRow>

      {/* Row 2 — Heatmap + Recommendation */}
      <WsRow height="chart">
        <Panel
          span={8}
          title="APR BY HOUR · ICT"
          badge={report ? `${report.hourly_data.length}/24 ACTIVE` : "—"}
          actions={
            <span style={{ display: "flex", gap: 1, background: colors.line }}>
              {([7, 14, 30] as const).map((d) => (
                <button
                  key={d}
                  onClick={() => setDays(d)}
                  style={{
                    background: days === d ? colors.bg2 : colors.bg1,
                    border: "none",
                    color: days === d ? colors.amber : colors.txt3,
                    padding: "3px 10px",
                    fontFamily: fonts.mono,
                    fontSize: 9,
                    letterSpacing: "0.08em",
                    cursor: "pointer",
                  }}
                >
                  {d}D
                </button>
              ))}
            </span>
          }
        >
          {reportError ? (
            <div
              style={{
                display: "grid",
                placeItems: "center",
                height: "100%",
                color: colors.txt3,
                fontFamily: fonts.mono,
                fontSize: 11,
                textAlign: "center",
                padding: 16,
              }}
            >
              {reportError}
              <span style={{ color: colors.txt4, fontSize: 10, marginTop: 8 }}>
                cron is collecting · check back in a few hours
              </span>
            </div>
          ) : (
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(24, 1fr)",
                gap: 2,
                padding: "8px 4px 4px",
                height: "100%",
                alignContent: "stretch",
              }}
            >
              {Array.from({ length: 24 }, (_, h) => {
                const stat = hourlyMap.get(h);
                const intensity = stat ? Math.min(stat.avg_apr / maxHourlyApr, 1) : 0;
                const bg = stat
                  ? `rgba(255, 176, 0, ${0.12 + intensity * 0.65})`
                  : "rgba(255,255,255,0.03)";
                const isBest = stat && report?.best_hours[0]?.hour_ict === h;
                return (
                  <div
                    key={h}
                    title={
                      stat
                        ? `${pad2(h)}:00 · avg ${stat.avg_apr.toFixed(2)}% · max ${stat.max_apr.toFixed(1)}% · n=${stat.samples}`
                        : `${pad2(h)}:00 · no data`
                    }
                    style={{
                      background: bg,
                      border: isBest ? `1px solid ${colors.amber}` : `1px solid transparent`,
                      display: "flex",
                      flexDirection: "column",
                      justifyContent: "flex-end",
                      padding: 4,
                      fontFamily: fonts.mono,
                      fontSize: 9,
                      color: stat ? colors.txt1 : colors.txt4,
                      minHeight: 60,
                      cursor: stat ? "pointer" : "default",
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 600, color: stat ? colors.amber : colors.txt4 }}>
                      {stat ? `${stat.avg_apr.toFixed(0)}%` : "—"}
                    </div>
                    <div style={{ color: colors.txt4, fontSize: 9 }}>{pad2(h)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel span={4} title="RECOMMENDATION" badge={report ? "LIVE" : "—"}>
          <div style={{ padding: "6px 4px", fontFamily: fonts.mono, fontSize: 11, lineHeight: 1.6 }}>
            {report ? (
              <>
                <div
                  style={{
                    background: colors.bg2,
                    border: `1px solid ${colors.amber}`,
                    padding: "10px 12px",
                    color: colors.amber,
                    fontSize: 12,
                    marginBottom: 12,
                    fontFamily: "'IBM Plex Sans Thai', 'Inter', sans-serif",
                    lineHeight: 1.55,
                  }}
                >
                  ▸ {report.recommendation}
                </div>

                {report.best_hours.length > 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ color: colors.txt3, fontSize: 9, letterSpacing: "0.1em", marginBottom: 6 }}>
                      ▸ TOP 3 HOURS
                    </div>
                    {report.best_hours.slice(0, 3).map((h, i) => (
                      <div
                        key={h.hour_ict}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "auto 1fr auto",
                          gap: 8,
                          padding: "4px 0",
                          borderBottom: i < 2 ? `1px dashed ${colors.line}` : "none",
                        }}
                      >
                        <span style={{ color: colors.txt3, width: 24 }}>#{i + 1}</span>
                        <span style={{ color: colors.amber, fontWeight: 600 }}>{pad2(h.hour_ict)}:00 ICT</span>
                        <span style={{ color: colors.green }}>{h.avg_apr.toFixed(2)}%</span>
                      </div>
                    ))}
                  </div>
                )}

                {report.cold_hours.length > 0 && (
                  <div>
                    <div style={{ color: colors.txt3, fontSize: 9, letterSpacing: "0.1em", marginBottom: 6 }}>
                      ▸ COLD HOURS (avoid)
                    </div>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      {report.cold_hours.map((h) => (
                        <span
                          key={h}
                          style={{
                            color: colors.red,
                            background: "rgba(255,77,94,0.08)",
                            padding: "2px 6px",
                            border: `1px solid ${colors.red}40`,
                            fontSize: 10,
                          }}
                        >
                          {pad2(h)}:00
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: colors.txt3, padding: "8px 4px" }}>
                {reportError ?? "loading…"}
              </div>
            )}
          </div>
        </Panel>
      </WsRow>

      {/* Row 3 — Snapshots + Daily summary */}
      <WsRow height="table">
        <Panel
          span={7}
          title="RECENT SNAPSHOTS"
          badge={`${filteredSnapshots.length} ROWS · TARGET $${target}`}
        >
          <div style={{ overflow: "auto", height: "100%", fontFamily: fonts.mono, fontSize: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: colors.bg1, zIndex: 1 }}>
                <tr style={{ color: colors.txt3, textAlign: "left", fontSize: 9, letterSpacing: "0.08em" }}>
                  <Th>TIME (ICT)</Th>
                  <Th align="right">HOUR</Th>
                  <Th>DIR</Th>
                  <Th align="right">APR</Th>
                  <Th align="right">PRICE</Th>
                  <Th>DUR</Th>
                </tr>
              </thead>
              <tbody>
                {filteredSnapshots.map((r, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: `1px dashed ${colors.line}`,
                      color: colors.txt2,
                    }}
                  >
                    <Td>{formatICT(r.timestamp_ict)}</Td>
                    <Td align="right" color={colors.amber}>{pad2(r.hour_ict)}</Td>
                    <Td color={r.direction === "BuyLow" ? colors.green : colors.red}>
                      {r.direction}
                    </Td>
                    <Td align="right" color={colors.amber}>{r.apr_pct.toFixed(2)}%</Td>
                    <Td align="right">{r.index_price?.toFixed(2) ?? "—"}</Td>
                    <Td color={colors.txt3}>{r.duration}</Td>
                  </tr>
                ))}
                {filteredSnapshots.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      style={{ padding: 16, textAlign: "center", color: colors.txt3, fontSize: 11 }}
                    >
                      no snapshots for target ${target} yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel
          span={5}
          title="DAILY SUMMARY"
          badge={summary.data ? `${summary.data.count} DAYS` : "—"}
        >
          <div style={{ overflow: "auto", height: "100%", fontFamily: fonts.mono, fontSize: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead style={{ position: "sticky", top: 0, background: colors.bg1, zIndex: 1 }}>
                <tr style={{ color: colors.txt3, textAlign: "left", fontSize: 9, letterSpacing: "0.08em" }}>
                  <Th>DATE</Th>
                  <Th align="right">AVG</Th>
                  <Th align="right">MAX</Th>
                  <Th align="right">BEST H</Th>
                  <Th align="right">N</Th>
                </tr>
              </thead>
              <tbody>
                {(summary.data?.summaries ?? []).map((d, i) => (
                  <tr
                    key={i}
                    style={{
                      borderBottom: `1px dashed ${colors.line}`,
                      color: colors.txt2,
                    }}
                  >
                    <Td>{d.date.slice(5)}</Td>
                    <Td align="right" color={colors.amber}>
                      {d.avg_apr != null ? d.avg_apr.toFixed(2) + "%" : "—"}
                    </Td>
                    <Td align="right" color={colors.green}>
                      {d.max_apr != null ? d.max_apr.toFixed(1) + "%" : "—"}
                    </Td>
                    <Td align="right">
                      {d.best_hour_ict != null ? pad2(d.best_hour_ict) + ":00" : "—"}
                    </Td>
                    <Td align="right" color={colors.txt3}>
                      {d.sample_count}
                    </Td>
                  </tr>
                ))}
                {(!summary.data || summary.data.count === 0) && (
                  <tr>
                    <td
                      colSpan={5}
                      style={{ padding: 16, textAlign: "center", color: colors.txt3, fontSize: 11 }}
                    >
                      no rollups yet · runs at 00:05 ICT
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </WsRow>
    </Workspace>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: "left" | "right" }) {
  return (
    <th
      style={{
        padding: "6px 8px",
        textAlign: align ?? "left",
        fontWeight: 400,
        textTransform: "uppercase",
        borderBottom: `1px solid ${colors.line}`,
      }}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  color,
}: {
  children: React.ReactNode;
  align?: "left" | "right";
  color?: string;
}) {
  return (
    <td
      style={{
        padding: "5px 8px",
        textAlign: align ?? "left",
        color: color ?? colors.txt2,
        fontVariantNumeric: "tabular-nums",
      }}
    >
      {children}
    </td>
  );
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function formatICT(iso: string): string {
  // e.g. "2026-04-29T18:25:00.000+07:00" → "04-29 18:25"
  const m = iso.match(/(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return iso.slice(0, 16);
  return `${m[1]}-${m[2]} ${m[3]}:${m[4]}`;
}
