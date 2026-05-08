"use client";

import { type CSSProperties, useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Clock3,
  Database,
  Filter,
  Flame,
  RefreshCw,
  ShieldCheck,
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
    () => visibleRows.slice().sort((a, b) => b.apr_pct - a.apr_pct || b.timestamp_utc.localeCompare(a.timestamp_utc)).slice(0, 18),
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
  const bestAvg = bestReports
    .map((item) => item.report?.best_hours[0]?.avg_apr)
    .filter((value): value is number => typeof value === "number");
  const bestHour = bestReports
    .map((item) => ({ label: item.label, hour: item.report?.best_hours[0]?.hour_ict, apr: item.report?.best_hours[0]?.avg_apr }))
    .filter((item) => item.hour != null)
    .sort((a, b) => (b.apr ?? 0) - (a.apr ?? 0))[0];

  const loading = settings.loading || snapshots.loading || best8h.loading || best1d.loading || summary.loading;
  const error = settings.error ?? snapshots.error ?? best8h.error ?? best1d.error ?? summary.error;

  return (
    <div className={styles.page}>
      <section className={styles.hero}>
        <div className={styles.heroMain}>
          <div className={styles.bybit}>BYB<span>I</span>T</div>
          <div>
            <p className={styles.eyebrow}>Connected Pulse implementation</p>
            <h1>Dual Assets Manager</h1>
            <p className={styles.heroCopy}>
              Public Bybit data to Pulse SQLite, API, MCP, alerts, and this live dashboard. No separate Dual-assets_MD runtime.
            </p>
          </div>
        </div>
        <div className={styles.heroStatus}>
          <StatusPill icon={ShieldCheck} label="Tracking" value={`>=${formatPct(settings.data?.minTrackAprPct ?? 55)}`} />
          <StatusPill icon={Flame} label="Hot Alert" value={`>=${formatPct(settings.data?.aprAlertPct ?? 100)}`} tone="hot" />
          <StatusPill icon={Database} label="Rows" value={String(visibleRows.length)} />
          <StatusPill icon={Activity} label="Auth" value={settings.data?.authRequiredForTracking === false ? "Public" : "Check"} />
        </div>
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

      <section className={styles.kpiGrid}>
        <KpiCard
          icon={TrendingUp}
          label="Live Best APR"
          value={topRow ? formatPct(topRow.apr_pct) : "--"}
          note={topRow ? `${labelDirection(topRow.direction)} / ${labelDuration(topRow.duration)} / target ${formatUsd(topRow.target_price)}` : disabled ? "No filters selected" : "Waiting for tracked rows"}
          tone={topRow && topRow.apr_pct >= (settings.data?.aprAlertPct ?? 100) ? "hot" : "good"}
        />
        <KpiCard
          icon={Clock3}
          label="Best Hour"
          value={bestHour?.hour != null ? `${pad2(bestHour.hour)}:00` : "--"}
          note={bestHour ? `${bestHour.label} / avg ${formatPct(bestHour.apr)}` : disabled ? "No filters selected" : "Collecting hourly baseline"}
          tone="good"
        />
        <KpiCard
          icon={Flame}
          label="Hot Rows"
          value={disabled ? "--" : String(hotRows.length)}
          note={`alert threshold ${formatPct(settings.data?.aprAlertPct ?? 100)}`}
          tone={hotRows.length > 0 ? "hot" : "neutral"}
        />
        <KpiCard
          icon={Database}
          label="Snapshots"
          value={snapshots.data ? String(snapshots.data.count) : "--"}
          note={loading ? "Loading live Pulse API" : "deduped visible rows"}
          tone="neutral"
        />
      </section>

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
              subtitle="Best/latest useful APY rows across selected durations and directions"
              badge={`${opportunityRows.length} visible`}
            />
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>APR</th>
                    <th>Direction</th>
                    <th>Duration</th>
                    <th>Target</th>
                    <th>Index</th>
                    <th>Time ICT</th>
                    <th>Product</th>
                  </tr>
                </thead>
                <tbody>
                  {opportunityRows.map((row) => (
                    <tr key={`${row.timestamp_utc}-${row.product_id}-${row.direction}-${row.target_price}`}>
                      <td className={row.apr_pct >= (settings.data?.aprAlertPct ?? 100) ? styles.hotText : styles.goodText}>
                        {formatPct(row.apr_pct)}
                      </td>
                      <td><DirectionBadge direction={row.direction} /></td>
                      <td><span className={styles.durationBadge}>{labelDuration(row.duration)}</span></td>
                      <td>{formatUsd(row.target_price)}</td>
                      <td>{row.index_price == null ? "--" : formatUsd(row.index_price)}</td>
                      <td>{formatICT(row.timestamp_ict)}</td>
                      <td className={styles.productCell}>{row.product_id || "--"}{row.is_vip_only ? " / VIP" : ""}</td>
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
        subtitle="Computed independently, no cross-duration averaging"
        badge={duration}
      />
      {error ? <div className={styles.panelNote}>{error}</div> : null}
      <div className={styles.heatmap}>
        {Array.from({ length: 24 }, (_, hour) => {
          const stat = hourly.find((item) => item.hour_ict === hour);
          const intensity = stat ? Math.max(0.1, stat.avg_apr / maxAvg) : 0;
          return (
            <div
              key={hour}
              className={styles.hourCell}
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

function KpiCard({
  icon: Icon,
  label,
  value,
  note,
  tone,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  note: string;
  tone: "hot" | "good" | "neutral";
}) {
  return (
    <article className={`${styles.kpiCard} ${styles[tone]}`}>
      <div><Icon size={18} /></div>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{note}</p>
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

function formatUsd(value: number | null | undefined): string {
  return typeof value === "number" && Number.isFinite(value)
    ? `$${value.toLocaleString("en-US", { minimumFractionDigits: value < 100 ? 2 : 0, maximumFractionDigits: 2 })}`
    : "--";
}

function formatICT(value: string): string {
  const match = value.match(/(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  return match ? `${match[1]}-${match[2]} ${match[3]}:${match[4]}` : value.slice(0, 16);
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}
