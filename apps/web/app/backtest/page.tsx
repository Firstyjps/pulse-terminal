"use client";

import { useState } from "react";
import { Panel, WsRow, Workspace, StatBlock, colors, fonts } from "@pulse/ui";
import { useFlow } from "../../lib/use-flow";
import { EmptyState } from "../../components/EmptyState";
import { Skeleton } from "../../components/Skeleton";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";

interface PatternStats {
  pattern: string;
  count: number;
  hitRate: number;
  avgMove: number;
  samples: number;
}

interface ApiResp {
  configured: boolean;
  message?: string;
  summary: {
    totalScans: number;
    scoredScans: number;
    oldestTs: string | null;
    newestTs: string | null;
    lookaheadHours: number;
  };
  stats: PatternStats[];
}

interface BucketStats {
  count: number;
  hits: number;
  hitRate: number;
  meanConfidence: number;
  meanRealizedPct: number;
}
interface CalibrationBucket {
  bin: string;
  binMin: number;
  binMax: number;
  count: number;
  hitRate: number;
  meanConfidence: number;
}
interface GradedReport {
  generatedAt: string;
  totalReplayed: number;
  totalScored: number;
  overall: BucketStats;
  byCategory: Record<string, BucketStats>;
  bySeverity: Record<string, BucketStats>;
  calibration: CalibrationBucket[];
}
interface GradedResp {
  report: GradedReport;
  meta: {
    sourceFile: string;
    lookaheadHours: number;
    thresholdPercent: number;
    sinceMs: number | null;
    syntheticUsed?: boolean;
  };
  error?: string;
}

const LOOKAHEADS = [4, 24, 72, 168] as const;

/**
 * Backtest — Bloomberg shell.
 *
 *   Row 1 (h-stats, 96px): SUMMARY · scans / scored / since c-12
 *   Row 2 (h-table, 340px): PATTERN HIT RATE c-12
 */
export default function BacktestPage() {
  const [hours, setHours] = useState<number>(24);
  const { data, loading } = useFlow<ApiResp>(`/api/backtest?hours=${hours}`, hours);
  const graded = useFlow<GradedResp>(
    `/api/backtest/grade?lookahead=${hours}&threshold=1.0&lookback=30`,
    hours,
  );

  return (
    <Workspace>
      <WsRow height="stats">
        <Panel span={12} title="SUMMARY" badge={`LOOKAHEAD ${hours < 24 ? `${hours}h` : `${hours / 24}d`}`} actions={
          <span style={{ display: "flex", gap: 1, background: colors.line }}>
            {LOOKAHEADS.map((h) => (
              <button
                key={h}
                onClick={() => setHours(h)}
                style={{
                  background: hours === h ? colors.bg2 : colors.bg1,
                  border: "none",
                  color: hours === h ? colors.amber : colors.txt3,
                  padding: "2px 10px",
                  fontFamily: fonts.mono,
                  fontSize: 9,
                  letterSpacing: "0.08em",
                  cursor: "pointer",
                  textTransform: "uppercase",
                }}
              >
                {h < 24 ? `${h}h` : `${h / 24}d`}
              </button>
            ))}
          </span>
        } flush>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: colors.line, height: "100%" }}>
            <StatBlock
              label="Total Scans"
              value={data?.summary?.totalScans?.toLocaleString() ?? "—"}
              sub="alerts.jsonl rows"
            />
            <StatBlock
              label="Scored"
              value={data?.summary?.scoredScans?.toLocaleString() ?? "—"}
              sub={`aged ≥ ${hours < 24 ? `${hours}h` : `${hours / 24}d`}`}
            />
            <StatBlock
              label="Oldest Scan"
              value={data?.summary?.oldestTs ? data.summary.oldestTs.slice(0, 10) : "—"}
              sub="seed date"
            />
            <StatBlock
              label="Pattern Count"
              value={data?.stats?.length?.toString() ?? "—"}
              sub="distinct categories"
            />
          </div>
        </Panel>
      </WsRow>

      <WsRow height="auto" style={{ minHeight: 360 }}>
        <Panel
          span={12}
          title="PATTERN HIT RATE"
          badge={`${hours < 24 ? `${hours}h` : `${hours / 24}d`} LOOKAHEAD`}
          actions={<MCPQuickAsk endpoint={`/api/backtest?hours=${hours}`} label="Ask Claude" />}
          flush
        >
          {loading && !data && (
            <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              {Array.from({ length: 4 }, (_, i) => (
                <div key={i} style={{ display: "flex", gap: 12 }}>
                  <Skeleton width="40%" height={18} />
                  <Skeleton width={60} height={18} />
                  <Skeleton width={70} height={18} />
                  <Skeleton width={120} height={18} />
                </div>
              ))}
            </div>
          )}
          {data && !data.configured && (
            <div style={{ padding: 16 }}>
              <EmptyState
                icon="📊"
                title="No alert log yet"
                body={
                  <>
                    Backtest reads <code>apps/alerts/data/alerts.jsonl</code>. Run the alerts worker for a few hours to start collecting findings:
                    <br /><br />
                    <code style={{ color: colors.cyan }}>pnpm pulse:start</code> &nbsp;then come back later.
                  </>
                }
              />
            </div>
          )}
          {data?.configured && data.stats.length === 0 && (
            <div style={{ padding: 16 }}>
              <EmptyState
                icon="⏳"
                title="Not enough scored scans yet"
                body={`Findings need to age at least ${hours}h before scoring. Older lookahead = more samples.`}
                compact
              />
            </div>
          )}
          {data?.configured && data.stats.length > 0 && (
            <div style={{ height: "100%", overflow: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 11 }}>
                <thead>
                  <tr style={{ textAlign: "left", color: colors.txt3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                    <th style={cellHeader}>Pattern</th>
                    <th style={{ ...cellHeader, textAlign: "right" }}>Samples</th>
                    <th style={{ ...cellHeader, textAlign: "right" }}>Hit-rate</th>
                    <th style={{ ...cellHeader, textAlign: "right" }}>Avg BTC move ({hours}h)</th>
                  </tr>
                </thead>
                <tbody>
                  {data.stats.map((s) => (
                    <tr key={s.pattern} style={{ borderBottom: `1px solid ${colors.line}` }}>
                      <td style={{ ...cellBody, color: colors.amber, fontWeight: 600 }}>{s.pattern}</td>
                      <td style={{ ...cellBody, textAlign: "right", color: colors.txt3 }}>{s.samples}</td>
                      <td style={{ ...cellBody, textAlign: "right", color: s.hitRate >= 50 ? colors.green : colors.red, fontWeight: 600 }}>
                        {s.hitRate.toFixed(1)}%
                      </td>
                      <td style={{ ...cellBody, textAlign: "right", color: s.avgMove >= 0 ? colors.green : colors.red }}>
                        {s.avgMove >= 0 ? "+" : ""}{s.avgMove.toFixed(2)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </WsRow>

      <WsRow height="auto" style={{ minHeight: 360 }}>
        <Panel
          span={7}
          title="GRADED BACKTEST"
          badge={
            graded.data?.report
              ? `${graded.data.report.totalScored} SCORED · OVERALL ${(graded.data.report.overall.hitRate * 100).toFixed(0)}%`
              : "LOADING"
          }
          flush
        >
          <GradedCalibrationTable graded={graded.data ?? null} />
        </Panel>
        <Panel
          span={5}
          title="BY CATEGORY"
          badge={graded.data?.report ? `MEAN CONF ${(graded.data.report.overall.meanConfidence * 100).toFixed(0)}%` : "LOADING"}
          flush
        >
          <GradedCategoryTable graded={graded.data ?? null} />
        </Panel>
      </WsRow>

      <WsRow height="auto">
        <Panel span={12} title="METHODOLOGY" badge="HOW HITS ARE SCORED">
          <p style={{ margin: 0, fontSize: 11, color: colors.txt3, lineHeight: 1.6, fontFamily: fonts.mono }}>
            <strong style={{ color: colors.txt2 }}>Pattern hit-rate</strong> (above): binary direction-match per category.
            Hit = BTC moved in expected direction within window:
            <br />
            <span style={{ color: colors.red }}>etf / funding / futures / tvl / dex</span> → expect <span style={{ color: colors.red }}>down</span>
            <br />
            <span style={{ color: colors.green }}>stablecoin</span> → expect <span style={{ color: colors.green }}>up</span>
            <br /><br />
            <strong style={{ color: colors.txt2 }}>Graded backtest</strong>: same outcomes but bucketed by the rubric's
            confidence score (signalStrength + regimeAlignment + crossSourceConfirmation + historicalHitRate). Calibration
            should be monotonic — high-confidence buckets should hit more often than low-confidence ones, and the
            mean confidence in each bucket should track the realized hit-rate within ±10%.
            <br /><br />
            Both views read <code style={{ color: colors.cyan }}>apps/alerts/data/alerts.jsonl</code>. Run alerts worker to populate.
          </p>
        </Panel>
      </WsRow>
    </Workspace>
  );
}

function GradedCalibrationTable({ graded }: { graded: GradedResp | null }) {
  if (!graded?.report || graded.error) {
    return (
      <p style={{ padding: 16, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
        {graded?.error ?? "Loading graded backtest…"}
      </p>
    );
  }
  const buckets = graded.report.calibration;
  if (!buckets.length) {
    return (
      <p style={{ padding: 16, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
        Not enough scored findings yet. Each confidence bucket needs ≥ 3 samples.
      </p>
    );
  }
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 11 }}>
        <thead>
          <tr style={{ textAlign: "left", color: colors.txt3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <th style={cellHeader}>Confidence Bin</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Samples</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Mean Conf</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Realized Hit-rate</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Calibration Δ</th>
          </tr>
        </thead>
        <tbody>
          {buckets.map((b) => {
            const delta = b.hitRate - b.meanConfidence; // positive = under-confident, negative = over-confident
            const wellCalibrated = Math.abs(delta) <= 0.1;
            return (
              <tr key={b.bin} style={{ borderBottom: `1px solid ${colors.line}` }}>
                <td style={{ ...cellBody, color: colors.amber, fontWeight: 600 }}>{b.bin}</td>
                <td style={{ ...cellBody, textAlign: "right", color: colors.txt3 }}>{b.count}</td>
                <td style={{ ...cellBody, textAlign: "right", color: colors.txt2 }}>
                  {(b.meanConfidence * 100).toFixed(0)}%
                </td>
                <td
                  style={{
                    ...cellBody,
                    textAlign: "right",
                    color: b.hitRate >= 0.5 ? colors.green : colors.red,
                    fontWeight: 600,
                  }}
                >
                  {(b.hitRate * 100).toFixed(0)}%
                </td>
                <td
                  style={{
                    ...cellBody,
                    textAlign: "right",
                    color: wellCalibrated ? colors.green : Math.abs(delta) > 0.2 ? colors.red : colors.amber,
                    fontWeight: 600,
                  }}
                >
                  {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(0)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function GradedCategoryTable({ graded }: { graded: GradedResp | null }) {
  if (!graded?.report || graded.error) {
    return (
      <p style={{ padding: 16, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
        {graded?.error ?? "Loading…"}
      </p>
    );
  }
  const rows = Object.entries(graded.report.byCategory)
    .filter(([, s]) => (s as BucketStats).count > 0)
    .sort(([, a], [, b]) => (b as BucketStats).count - (a as BucketStats).count);

  if (!rows.length) {
    return (
      <p style={{ padding: 16, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>No category samples yet.</p>
    );
  }
  return (
    <div style={{ height: "100%", overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 11 }}>
        <thead>
          <tr style={{ textAlign: "left", color: colors.txt3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <th style={cellHeader}>Category</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>N</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Hit %</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Conf %</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Realized Δ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([cat, s]) => {
            const stats = s as BucketStats;
            return (
              <tr key={cat} style={{ borderBottom: `1px solid ${colors.line}` }}>
                <td style={{ ...cellBody, color: colors.amber, fontWeight: 600, textTransform: "uppercase" }}>{cat}</td>
                <td style={{ ...cellBody, textAlign: "right", color: colors.txt3 }}>{stats.count}</td>
                <td
                  style={{
                    ...cellBody,
                    textAlign: "right",
                    color: stats.hitRate >= 0.5 ? colors.green : colors.red,
                    fontWeight: 600,
                  }}
                >
                  {(stats.hitRate * 100).toFixed(0)}%
                </td>
                <td style={{ ...cellBody, textAlign: "right", color: colors.txt2 }}>
                  {(stats.meanConfidence * 100).toFixed(0)}%
                </td>
                <td
                  style={{
                    ...cellBody,
                    textAlign: "right",
                    color: stats.meanRealizedPct >= 0 ? colors.green : colors.red,
                  }}
                >
                  {stats.meanRealizedPct >= 0 ? "+" : ""}{stats.meanRealizedPct.toFixed(2)}%
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
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
};

const cellBody: React.CSSProperties = {
  padding: "6px 10px",
  whiteSpace: "nowrap",
  color: colors.txt2,
};
