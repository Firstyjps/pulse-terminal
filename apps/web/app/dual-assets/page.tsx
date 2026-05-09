"use client";

import { type CSSProperties, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  Clock3,
  Database,
  Filter,
  Flame,
  Gauge,
  ShieldCheck,
  Target,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { useFlow } from "../../lib/use-flow";
import styles from "./dual-assets.module.css";

interface HourlyAprStat {
  hour_ict: number;
  avg_apr: number;
  max_apr: number;
  min_apr: number;
  avg_price: number | null;
  avg_iv: number | null;
  samples: number;
}

interface BestHourReport {
  period_days: number;
  target_price: number | null;
  coin_pair: string;
  overall_avg_apr: number;
  confidence: {
    score: number;
    label: "low" | "medium" | "high";
    reasons: string[];
  };
  trend: {
    direction: "rising" | "falling" | "flat" | "insufficient";
    latest_avg_apr: number | null;
    previous_avg_apr: number | null;
    change_pct: number | null;
  };
  best_hours: HourlyAprStat[];
  hot_hours: number[];
  cold_hours: number[];
  hourly_data: HourlyAprStat[];
  recommendation: string;
}

interface Snapshot {
  id?: number;
  timestamp_utc: string;
  timestamp_ict: string;
  hour_ict: number;
  product_id: string;
  coin_pair: string;
  direction: Direction;
  target_price: number;
  apr_pct: number;
  duration: Duration;
  settlement_utc: string | null;
  index_price: number | null;
  is_vip_only: number;
  sol_iv_pct: number | null;
}

interface DailySummary {
  date: string;
  coin_pair: string;
  direction: Direction;
  duration: Duration;
  target_price: number;
  avg_apr: number | null;
  max_apr: number | null;
  min_apr: number | null;
  best_hour_ict: number | null;
  worst_hour_ict: number | null;
  avg_index_price: number | null;
  sample_count: number;
}

interface Settings {
  pairs: string[];
  directions: Direction[];
  durations: Duration[];
  durationLabels: Record<Duration, string>;
  minTrackAprPct: number;
  aprAlertPct: number;
  intervalMs: number;
  schedulerEnabled: boolean;
  bybitKeyConfigured: boolean;
  authRequiredForTracking: false;
}

const DURATIONS = [
  { value: "8h", label: "8 Hours" },
  { value: "1d", label: "1 Day" },
] as const;
const DIRECTIONS = [
  { value: "BuyLow", label: "Buy Low" },
  { value: "SellHigh", label: "Sell High" },
] as const;

type Duration = (typeof DURATIONS)[number]["value"];
type Direction = (typeof DIRECTIONS)[number]["value"];
type Days = 7 | 14 | 30;

const DEFAULT_PAIR = "SOL-USDT";

export default function DualAssetsPage() {
  const [days, setDays] = useState<Days>(7);
  const [selectedDurations, setSelectedDurations] = useState<Duration[]>(["8h", "1d"]);
  const [selectedDirections, setSelectedDirections] = useState<Direction[]>(["BuyLow", "SellHigh"]);

  const durationParam = selectedDurations.length ? selectedDurations.join(",") : "none";
  const directionParam = selectedDirections.length ? selectedDirections.join(",") : "none";
  const disabled = selectedDurations.length === 0 || selectedDirections.length === 0;

  const settings = useFlow<Settings>("/api/dual-assets/settings");
  const snapshots = useFlow<{ count: number; records: Snapshot[]; filters: unknown }>(
    `/api/dual-assets/snapshots?coin_pair=${DEFAULT_PAIR}&duration=${durationParam}&direction=${directionParam}&limit=500`,
  );
  const best8h = useFlow<BestHourReport | { error: string }>(
    `/api/dual-assets/best-hour?coin_pair=${DEFAULT_PAIR}&days=${days}&duration=8h&direction=${directionParam}`,
  );
  const best1d = useFlow<BestHourReport | { error: string }>(
    `/api/dual-assets/best-hour?coin_pair=${DEFAULT_PAIR}&days=${days}&duration=1d&direction=${directionParam}`,
  );
  const summary = useFlow<{ count: number; summaries: DailySummary[] }>(
    `/api/dual-assets/summary?coin_pair=${DEFAULT_PAIR}&days=30&duration=${durationParam}&direction=${directionParam}`,
  );

  const visibleRows = useMemo(() => {
    if (disabled) return [];
    return dedupeBestRows(snapshots.data?.records ?? []);
  }, [disabled, snapshots.data]);

  const opportunityRows = useMemo(
    () => visibleRows.slice().sort((a, b) => b.apr_pct - a.apr_pct || b.timestamp_utc.localeCompare(a.timestamp_utc)).slice(0, 10),
    [visibleRows],
  );

  const bestReports = useMemo(() => {
    const items: Array<{ duration: Duration; label: string; report: BestHourReport | null; error: string | null }> = [];
    if (selectedDurations.includes("8h")) {
      items.push({ duration: "8h", label: "8 Hours", ...unwrapReport(best8h.data) });
    }
    if (selectedDurations.includes("1d")) {
      items.push({ duration: "1d", label: "1 Day", ...unwrapReport(best1d.data) });
    }
    return items;
  }, [best8h.data, best1d.data, selectedDurations]);

  const topRow = opportunityRows[0] ?? null;
  const hotRows = visibleRows.filter((row) => row.apr_pct >= (settings.data?.aprAlertPct ?? 100));
  const decision = bestReports
    .map((item) => ({ ...item, best: item.report?.best_hours[0] ?? null }))
    .filter((item): item is typeof item & { best: HourlyAprStat } => item.best != null)
    .sort((a, b) => b.best.avg_apr - a.best.avg_apr)[0] ?? null;
  const decisionReport = decision?.report ?? null;
  const decisionBest = decision?.best ?? null;
  const decisionSampleCount = decisionReport?.hourly_data.reduce((sum, item) => sum + item.samples, 0) ?? 0;
  const decisionEdgePct =
    decisionReport && decisionBest && decisionReport.overall_avg_apr > 0
      ? ((decisionBest.avg_apr - decisionReport.overall_avg_apr) / decisionReport.overall_avg_apr) * 100
      : null;
  const bestWindowHours = useMemo(() => {
    const set = new Set<number>();
    for (const item of bestReports) {
      for (const hour of item.report?.best_hours.slice(0, 2) ?? []) set.add(hour.hour_ict);
    }
    return set;
  }, [bestReports]);

  const loading = settings.loading || snapshots.loading || best8h.loading || best1d.loading || summary.loading;
  const error = settings.error ?? snapshots.error ?? best8h.error ?? best1d.error ?? summary.error;

  return (
    <div className={styles.page}>
      <section className={styles.header}>
        <div className={styles.headerMain}>
          <div className={styles.bybit}>BYB<span>I</span>T</div>
          <div>
            <p className={styles.eyebrow}>Decision dashboard · {DEFAULT_PAIR}</p>
            <h1>Dual Assets Entry Timing</h1>
            <p className={styles.heroCopy}>
              Finds when Bybit Dual Asset APY is worth entering, based on live Pulse SQLite snapshots.
            </p>
          </div>
        </div>
        <div className={styles.headerStatus}>
          <StatusPill icon={ShieldCheck} label="Tracking" value={`>=${formatPct(settings.data?.minTrackAprPct ?? 55)}`} />
          <StatusPill icon={Flame} label="Hot Alert" value={`>=${formatPct(settings.data?.aprAlertPct ?? 100)}`} tone="hot" />
          <StatusPill icon={Database} label="Rows" value={String(visibleRows.length)} />
          <StatusPill icon={Activity} label="Auth" value={settings.data?.authRequiredForTracking === false ? "Public" : "Check"} />
        </div>
      </section>

      <section className={styles.decisionPanel}>
        <div className={styles.decisionMain}>
          <span className={styles.sectionLabel}>Best entry answer</span>
          <h2>{decisionBest ? formatWindow(decisionBest.hour_ict) : "--"}</h2>
          <p>
            {decision
              ? `${decision.label} has the strongest average APY over the last ${days}D. ${decisionReport?.recommendation ?? ""}`
              : disabled
                ? "Turn on at least one duration and one direction to compute a best entry window."
                : "Collecting enough hourly baseline to make a decision."}
          </p>
        </div>
        <div className={styles.decisionStats}>
          <DecisionStat
            icon={BarChart3}
            label={`Average APY · ${days}D`}
            value={formatPct(decisionReport?.overall_avg_apr)}
            note={decision ? `${decision.label} selected baseline` : "No baseline"}
          />
          <DecisionStat
            icon={TrendingUp}
            label="Best-hour APY"
            value={formatPct(decisionBest?.avg_apr)}
            note={decisionEdgePct == null ? "Edge unavailable" : `${formatSignedPct(decisionEdgePct)} vs average`}
            tone="good"
          />
          <DecisionStat
            icon={Gauge}
            label="Confidence"
            value={decisionReport ? titleCase(decisionReport.confidence.label) : "--"}
            note={decisionReport ? `${decisionReport.confidence.score}/100 · ${decisionSampleCount.toLocaleString("en-US")} samples` : "No report"}
          />
          <DecisionStat
            icon={Clock3}
            label="Trend"
            value={decisionReport ? titleCase(decisionReport.trend.direction) : "--"}
            note={decisionReport?.trend.change_pct == null ? "No daily trend" : `${formatSignedPct(decisionReport.trend.change_pct)} vs previous period`}
          />
        </div>
      </section>

      <section className={styles.durationGrid}>
        {bestReports.map((item) => (
          <DurationDecisionCard key={item.duration} item={item} days={days} />
        ))}
      </section>

      <section className={styles.filterPanel}>
        <div className={styles.filterTitle}>
          <Filter size={16} />
          <div>
            <strong>Market Filters</strong>
            <span>{DEFAULT_PAIR} / multi-toggle controls</span>
          </div>
        </div>
        <ToggleGroup
          label="Duration"
          items={DURATIONS}
          selected={selectedDurations}
          onToggle={(value) => setSelectedDurations((prev) => toggle(prev, value))}
        />
        <ToggleGroup
          label="Direction"
          items={DIRECTIONS}
          selected={selectedDirections}
          onToggle={(value) => setSelectedDirections((prev) => toggle(prev, value))}
        />
        <div className={styles.dayTabs}>
          {([7, 14, 30] as const).map((item) => (
            <button key={item} className={days === item ? styles.active : ""} onClick={() => setDays(item)}>
              {item}D
            </button>
          ))}
        </div>
      </section>

      {error ? (
        <div className={styles.error}>
          <AlertTriangle size={16} />
          {error}
        </div>
      ) : null}

      {disabled ? (
        <section className={styles.emptyState}>
          <AlertTriangle size={22} />
          <strong>No rows by design</strong>
          <span>Turn on at least one duration and one direction. When all toggles are off, Pulse sends `none` filters and returns an empty result.</span>
        </section>
      ) : (
        <>
          <section className={styles.opportunityPanel}>
            <PanelHeader
              title="Live Opportunities"
              subtitle="Current rows ranked by APY. Highlighted rows land inside a best entry hour."
              badge={`${opportunityRows.length} shown`}
            />
            <div className={styles.tableSummary}>
              <DecisionStat
                icon={Target}
                label="Current best APY"
                value={topRow ? formatPct(topRow.apr_pct) : "--"}
                note={topRow ? `${labelDirection(topRow.direction)} · ${labelDuration(topRow.duration)} · target ${formatUsd(topRow.target_price)}` : "No row"}
                tone={topRow && topRow.apr_pct >= (settings.data?.aprAlertPct ?? 100) ? "hot" : "good"}
              />
              <DecisionStat
                icon={Flame}
                label="Hot rows"
                value={String(hotRows.length)}
                note={`Alert threshold ${formatPct(settings.data?.aprAlertPct ?? 100)}`}
                tone={hotRows.length > 0 ? "hot" : "neutral"}
              />
              <DecisionStat
                icon={Database}
                label="Snapshots"
                value={snapshots.data ? String(snapshots.data.count) : "--"}
                note={loading ? "Loading live Pulse API" : "Deduped visible rows"}
              />
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>APY</th>
                    <th>Direction</th>
                    <th>Duration</th>
                    <th>Target Gap</th>
                    <th>Time ICT</th>
                    <th>Access</th>
                    <th>Product</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunityRows.map((row) => (
                    <tr
                      key={`${row.timestamp_utc}-${row.product_id}-${row.direction}-${row.target_price}`}
                      className={bestWindowHours.has(row.hour_ict) ? styles.bestWindowRow : undefined}
                    >
                      <td className={row.apr_pct >= (settings.data?.aprAlertPct ?? 100) ? styles.hotText : styles.goodText}>
                        {formatPct(row.apr_pct)}
                      </td>
                      <td><DirectionBadge direction={row.direction} /></td>
                      <td><span className={styles.durationBadge}>{labelDuration(row.duration)}</span></td>
                      <td>
                        <strong>{formatUsd(row.target_price)}</strong>
                        <span className={styles.gapText}>{formatTargetGap(row)}</span>
                      </td>
                      <td>{formatICT(row.timestamp_ict)}</td>
                      <td>{row.is_vip_only ? "VIP" : "Public"}</td>
                      <td className={styles.productCell}>{row.product_id || "--"}</td>
                    </tr>
                  ))}
                  {opportunityRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className={styles.noRows}>No tracked rows for current filters.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>

          <section className={styles.baselineGrid}>
            {bestReports.map((item) => (
              <BaselinePanel
                key={item.duration}
                label={item.label}
                duration={item.duration}
                report={item.report}
                error={item.error}
                rows={visibleRows.filter((row) => row.duration === item.duration)}
                summaries={(summary.data?.summaries ?? []).filter((row) => row.duration === item.duration)}
              />
            ))}
          </section>
        </>
      )}

      <section className={styles.runbook}>
        <PanelHeader title="Connection Contract" subtitle="Pulse owns the runtime now" badge="live" />
        <div className={styles.contractGrid}>
          <ContractItem label="Source" value="Bybit public Advanced Earn DualAssets endpoints" />
          <ContractItem label="Store" value="apps/alerts/data/dual-assets.sqlite" />
          <ContractItem label="Visibility" value={`Track APY >=${formatPct(settings.data?.minTrackAprPct ?? 55)}`} />
          <ContractItem label="Alert" value={`Hot APR >=${formatPct(settings.data?.aprAlertPct ?? 100)}`} />
          <ContractItem label="Durations" value="8 Hours and 1 Day only" />
          <ContractItem label="Directions" value="Buy Low and Sell High" />
        </div>
      </section>
    </div>
  );
}

function BaselinePanel({
  label,
  duration,
  report,
  error,
  rows,
  summaries,
}: {
  label: string;
  duration: Duration;
  report: BestHourReport | null;
  error: string | null;
  rows: Snapshot[];
  summaries: DailySummary[];
}) {
  const hourly = report?.hourly_data ?? [];
  const maxAvg = Math.max(...hourly.map((item) => item.avg_apr), 1);
  return (
    <article className={styles.baselinePanel}>
      <PanelHeader
        title={`${label} Baseline`}
        subtitle="Hourly APY baseline. Green = good entry zone, amber = neutral, red = avoid."
        badge={duration}
      />
      {error ? <div className={styles.panelNote}>{error}</div> : null}
      <div className={styles.baselineSummary}>
        <DecisionStat
          icon={Clock3}
          label="Best window"
          value={report?.best_hours[0] ? formatWindow(report.best_hours[0].hour_ict) : "--"}
          note={report?.best_hours[0] ? `Avg ${formatPct(report.best_hours[0].avg_apr)}` : "No hourly baseline"}
          tone="good"
        />
        <DecisionStat
          icon={BarChart3}
          label="Average APY"
          value={formatPct(report?.overall_avg_apr)}
          note={report ? `${report.period_days}D · ${report.confidence.label} confidence` : "No report"}
        />
      </div>
      <div className={styles.heatmapLegend}>
        <span><i className={styles.legendGood} /> Good</span>
        <span><i className={styles.legendNeutral} /> Neutral</span>
        <span><i className={styles.legendAvoid} /> Avoid</span>
      </div>
      <div className={styles.heatmap}>
        {Array.from({ length: 24 }, (_, hour) => {
          const stat = hourly.find((item) => item.hour_ict === hour);
          const intensity = stat ? Math.max(0.1, stat.avg_apr / maxAvg) : 0;
          const tier = !stat
            ? styles.noDataHour
            : report?.hot_hours.includes(hour)
              ? styles.goodHour
              : report?.cold_hours.includes(hour)
                ? styles.avoidHour
                : styles.neutralHour;
          return (
            <div
              key={hour}
              className={`${styles.hourCell} ${tier}`}
              style={{ "--intensity": intensity } as CSSProperties}
              title={stat ? `${pad2(hour)}:00 avg ${formatPct(stat.avg_apr)} max ${formatPct(stat.max_apr)}` : `${pad2(hour)}:00 no data`}
            >
              <strong>{stat ? Math.round(stat.avg_apr) : "--"}</strong>
              <span>{pad2(hour)}</span>
            </div>
          );
        })}
      </div>
      <div className={styles.baselineTables}>
        <MiniTable
          title="Top Rows"
          rows={rows.slice(0, 6).map((row) => ({
            key: `${row.timestamp_utc}-${row.product_id}`,
            a: formatPct(row.apr_pct),
            b: labelDirection(row.direction),
            c: formatUsd(row.target_price),
          }))}
        />
        <MiniTable
          title="Daily Summary"
          rows={summaries.slice(0, 6).map((row) => ({
            key: `${row.date}-${row.direction}-${row.target_price}`,
            a: row.date.slice(5),
            b: `${labelDirection(row.direction)} ${formatUsd(row.target_price)}`,
            c: row.avg_apr == null ? "--" : formatPct(row.avg_apr),
          }))}
        />
      </div>
    </article>
  );
}

function ToggleGroup<T extends string>({
  label,
  items,
  selected,
  onToggle,
}: {
  label: string;
  items: ReadonlyArray<{ value: T; label: string }>;
  selected: T[];
  onToggle: (value: T) => void;
}) {
  return (
    <div className={styles.toggleGroup}>
      <span>{label}</span>
      <div>
        {items.map((item) => (
          <button
            key={item.value}
            className={selected.includes(item.value) ? styles.active : ""}
            onClick={() => onToggle(item.value)}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function DecisionStat({
  icon: Icon,
  label,
  value,
  note,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone?: "hot" | "good" | "neutral";
}) {
  return (
    <article className={`${styles.decisionStat} ${styles[tone]}`}>
      <div><Icon size={18} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
    </article>
  );
}

function DurationDecisionCard({
  item,
  days,
}: {
  item: { duration: Duration; label: string; report: BestHourReport | null; error: string | null };
  days: Days;
}) {
  const best = item.report?.best_hours[0] ?? null;
  const edge =
    best && item.report && item.report.overall_avg_apr > 0
      ? ((best.avg_apr - item.report.overall_avg_apr) / item.report.overall_avg_apr) * 100
      : null;
  const samples = item.report?.hourly_data.reduce((sum, stat) => sum + stat.samples, 0) ?? 0;
  return (
    <article className={styles.durationCard}>
      <div className={styles.durationTop}>
        <span>{item.label}</span>
        <strong>{best ? formatWindow(best.hour_ict) : "--"}</strong>
      </div>
      {item.error ? <p className={styles.panelNote}>{item.error}</p> : null}
      <div className={styles.durationMetrics}>
        <DecisionStat
          icon={TrendingUp}
          label="Best-hour APY"
          value={formatPct(best?.avg_apr)}
          note={edge == null ? "Edge unavailable" : `${formatSignedPct(edge)} vs avg`}
          tone="good"
        />
        <DecisionStat
          icon={BarChart3}
          label={`Average APY · ${days}D`}
          value={formatPct(item.report?.overall_avg_apr)}
          note={`${samples.toLocaleString("en-US")} samples`}
        />
        <DecisionStat
          icon={CheckCircle2}
          label="Confidence"
          value={item.report ? titleCase(item.report.confidence.label) : "--"}
          note={item.report ? `${item.report.confidence.score}/100` : "No report"}
        />
      </div>
    </article>
  );
}

function StatusPill({
  icon: Icon,
  label,
  value,
  tone = "neutral",
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  tone?: "hot" | "neutral";
}) {
  return (
    <div className={`${styles.statusPill} ${tone === "hot" ? styles.hotPill : ""}`}>
      <Icon size={15} />
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function PanelHeader({ title, subtitle, badge }: { title: string; subtitle: string; badge: string }) {
  return (
    <div className={styles.panelHeader}>
      <div>
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      <span>{badge}</span>
    </div>
  );
}

function MiniTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ key: string; a: string; b: string; c: string }>;
}) {
  return (
    <div className={styles.miniTable}>
      <strong>{title}</strong>
      {rows.length === 0 ? <span className={styles.noRows}>No rows</span> : null}
      {rows.map((row) => (
        <div key={row.key}>
          <span>{row.a}</span>
          <span>{row.b}</span>
          <span>{row.c}</span>
        </div>
      ))}
    </div>
  );
}

function ContractItem({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.contractItem}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DirectionBadge({ direction }: { direction: Direction }) {
  return <span className={`${styles.directionBadge} ${direction === "BuyLow" ? styles.buyLow : styles.sellHigh}`}>{labelDirection(direction)}</span>;
}

function unwrapReport(data: BestHourReport | { error: string } | null): { report: BestHourReport | null; error: string | null } {
  if (!data) return { report: null, error: null };
  if ("error" in data) return { report: null, error: data.error };
  return { report: data, error: null };
}

function dedupeBestRows(rows: Snapshot[]): Snapshot[] {
  const map = new Map<string, Snapshot>();
  for (const row of rows) {
    const key = [row.timestamp_utc, row.coin_pair, row.direction, row.target_price, row.duration].join("|");
    const previous = map.get(key);
    if (
      !previous ||
      row.apr_pct > previous.apr_pct ||
      (row.apr_pct === previous.apr_pct && row.is_vip_only > previous.is_vip_only) ||
      (row.apr_pct === previous.apr_pct && row.is_vip_only === previous.is_vip_only && (row.id ?? 0) > (previous.id ?? 0))
    ) {
      map.set(key, row);
    }
  }
  return [...map.values()].sort((a, b) => b.timestamp_utc.localeCompare(a.timestamp_utc) || b.apr_pct - a.apr_pct);
}

function toggle<T extends string>(items: T[], value: T): T[] {
  return items.includes(value) ? items.filter((item) => item !== value) : [...items, value];
}

function labelDuration(duration: string): string {
  return duration.toLowerCase() === "8h" ? "8 Hours" : "1 Day";
}

function labelDirection(direction: string): string {
  return direction === "BuyLow" ? "Buy Low" : direction === "SellHigh" ? "Sell High" : direction;
}

function formatPct(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? `${value.toFixed(2)}%` : "--";
}

function formatSignedPct(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

function formatUsd(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toLocaleString("en-US", { minimumFractionDigits: value < 100 ? 2 : 0, maximumFractionDigits: 2 })}`
    : "--";
}

function formatSignedUsd(value: number | null | undefined): string {
  if (typeof value !== "number" || !Number.isFinite(value)) return "--";
  const sign = value > 0 ? "+" : value < 0 ? "-" : "";
  return `${sign}${formatUsd(Math.abs(value))}`;
}

function formatTargetGap(row: Snapshot): string {
  if (row.index_price == null || !Number.isFinite(row.index_price) || row.index_price === 0) return "index --";
  const diff = row.target_price - row.index_price;
  const pct = (diff / row.index_price) * 100;
  return `${formatSignedUsd(diff)} / ${formatSignedPct(pct)} from index`;
}

function formatICT(value: string): string {
  const match = value.match(/(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]} ${match[3]}:${match[4]}` : value.slice(0, 16);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatWindow(hour: number | null | undefined): string {
  if (typeof hour !== "number" || !Number.isFinite(hour)) return "--";
  return `${pad2(hour)}:00-${pad2((hour + 1) % 24)}:00 ICT`;
}

function titleCase(value: string): string {
  return value ? value.slice(0, 1).toUpperCase() + value.slice(1) : value;
}
