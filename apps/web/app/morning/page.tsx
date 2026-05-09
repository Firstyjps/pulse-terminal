"use client";

import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  formatPercent,
  formatUSD,
  type FundingRate,
  type MacroResponse,
  type MarketOverview,
  type StablecoinFlow,
} from "@pulse/sources";
import { Panel, SignalPill, Workspace, WsRow, colors, fonts } from "@pulse/ui";
import { useFlow } from "../../lib/use-flow";
import { useIsMobile } from "../../lib/use-media";

export default function MorningPage() {
  return (
    <Workspace>
      <WsRow height="auto" style={{ minHeight: 240 }}>
        <Panel span={8} title="OVERNIGHT DIGEST" badge="LIVE ENDPOINTS">
          <OvernightDigest />
        </Panel>
        <Panel span={4} title="MACRO REGIME" badge="LIVE RULES v0">
          <MacroRegime />
        </Panel>
      </WsRow>

      <WsRow height="auto" style={{ minHeight: 360 }}>
        <Panel span={7} title="SIGNAL FEED" badge="TOP 5 LIVE" flush>
          <SignalFeed />
        </Panel>
        <Panel span={5} title="ACTION ITEMS" badge="DERIVED LIVE" flush>
          <ActionItems />
        </Panel>
      </WsRow>
    </Workspace>
  );
}

interface TickerResp {
  btc: { price: number; change24h: number } | null;
  eth: { price: number; change24h: number } | null;
  fearGreed: { value: number; classification: string } | null;
  marketCap: { total: number; change24h: number } | null;
  ts: number;
}

interface FundingResp {
  rates: FundingRate[];
  ts: number;
}

interface HealthResp {
  status: "healthy" | "degraded" | "unhealthy";
}

function OvernightDigest() {
  const isMobile = useIsMobile();
  const ticker = useFlow<TickerResp>("/api/ticker");
  const macro = useFlow<MacroResponse>("/api/macro");
  const stablecoins = useFlow<StablecoinFlow>("/api/flows/stablecoins");
  const funding = useFlow<FundingResp>("/api/funding");
  const recent = useFlow<RecentResp>("/api/alerts/recent?limit=100");

  const ranked = useMemo(() => rankSignals(recent.data?.records ?? []), [recent.data]);
  const fundingSummary = useMemo(() => summarizeFunding(funding.data?.rates ?? []), [funding.data]);
  const lines = useMemo(
    () => buildDigestLines({
      ticker: ticker.data,
      macro: macro.data,
      stablecoins: stablecoins.data,
      funding: fundingSummary,
      topSignal: ranked[0],
      alertsConfigured: recent.data?.configured ?? null,
      alertScanCount: recent.data?.count ?? null,
    }),
    [fundingSummary, macro.data, ranked, recent.data, stablecoins.data, ticker.data],
  );

  const loading = ticker.loading || macro.loading || stablecoins.loading || funding.loading || recent.loading;
  const errors = [
    ticker.error && `ticker ${ticker.error}`,
    macro.error && `macro ${macro.error}`,
    stablecoins.error && `stablecoins ${stablecoins.error}`,
    funding.error && `funding ${funding.error}`,
    recent.error && `alerts ${recent.error}`,
  ].filter(Boolean);

  return (
    <div
      style={{
        fontFamily: fonts.mono,
        fontSize: isMobile ? 13 : 11,
        lineHeight: isMobile ? 1.55 : 1.65,
        color: colors.txt2,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: "100%",
      }}
    >
      {loading && <InlineState>Loading live morning inputs...</InlineState>}
      {errors.length > 0 && <InlineState tone="red">{errors.join(" / ")}</InlineState>}

      <div style={{ display: "grid", gap: 8 }}>
        {lines.map((line) => (
          <p key={line} style={{ margin: 0 }}>
            <span style={{ color: colors.amber }}>-</span> {line}
          </p>
        ))}
      </div>

      <div
        style={{
          marginTop: "auto",
          display: "flex",
          gap: 6,
          alignItems: "center",
          flexWrap: "wrap",
          fontSize: isMobile ? 10 : 9,
          color: colors.txt4,
        }}
      >
        <SignalPill tone="muted" size="xs">SOURCES</SignalPill>
        <span>/api/ticker</span>
        <span>/api/macro</span>
        <span>/api/funding</span>
        <span>/api/flows/stablecoins</span>
        <span>/api/alerts/recent</span>
      </div>
    </div>
  );
}

function MacroRegime() {
  const macro = useFlow<MacroResponse>("/api/macro");
  const overview = useFlow<MarketOverview>("/api/flows/overview");
  const stablecoins = useFlow<StablecoinFlow>("/api/flows/stablecoins");
  const funding = useFlow<FundingResp>("/api/funding");

  const fundingSummary = useMemo(() => summarizeFunding(funding.data?.rates ?? []), [funding.data]);
  const regime = deriveRegime({
    dxyChange: macro.data?.dxy?.change24h ?? null,
    spxChange: macro.data?.spx?.change24h ?? null,
    stable7dPct: stablecoins.data?.summary.change7dPercent ?? null,
    avgFundingBps: fundingSummary.avgBps,
  });

  const loading = macro.loading || overview.loading || stablecoins.loading || funding.loading;
  const errors = [macro.error, overview.error, stablecoins.error, funding.error].filter(Boolean);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      {loading && <InlineState>Loading regime inputs...</InlineState>}
      {errors.length > 0 && <InlineState tone="red">{errors.join(" / ")}</InlineState>}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <SignalPill tone={regime.tone} size="sm" glow>{regime.label}</SignalPill>
        <div style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.txt3, lineHeight: 1.55 }}>
          {regime.reason}
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 8 }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.txt4, letterSpacing: "0.10em", marginBottom: 6 }}>
          INPUTS
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 8px", fontSize: 10, fontFamily: fonts.mono }}>
          <InputRow label="Funding avg" value={fundingSummary.avgBps == null ? "--" : `${fundingSummary.avgBps.toFixed(2)}bps`} />
          <InputRow label="BTC.D" value={overview.data?.btcDominance == null ? "--" : `${overview.data.btcDominance.toFixed(1)}%`} />
          <InputRow label="DXY 1d" value={macro.data?.dxy ? formatPercent(macro.data.dxy.change24h) : "--"} />
          <InputRow label="SPX 1d" value={macro.data?.spx ? formatPercent(macro.data.spx.change24h) : "--"} />
          <InputRow label="Stable 7d" value={stablecoins.data ? `${formatSignedUsd(stablecoins.data.summary.change7d)} (${formatPercent(stablecoins.data.summary.change7dPercent)})` : "--"} />
        </div>
      </div>

      <div style={{ marginTop: "auto" }}>
        <SignalPill tone="muted" size="xs">computed from live web APIs</SignalPill>
      </div>
    </div>
  );
}

function InputRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span style={{ color: colors.txt3 }}>{label}</span>
      <span style={{ color: colors.txt2, fontVariantNumeric: "tabular-nums" }}>{value}</span>
    </>
  );
}

interface AlertRecord {
  ts: string;
  scan_id: string;
  symbol: string;
  findings: { category: string; severity: "low" | "med" | "high"; signal: string; evidence: Record<string, unknown> }[];
  marker: { btcPrice?: number; ethPrice?: number };
}

interface RecentResp {
  configured: boolean;
  count: number;
  records: AlertRecord[];
  message?: string;
}

interface RankedSignal {
  tag: "WHALE" | "LIQ" | "FLOW" | "OI" | "PUMP" | "NEWS";
  symbol: string;
  signal: string;
  severity: "low" | "med" | "high";
  ts: number;
  score: number;
  ageStr: string;
}

const SEVERITY_W: Record<RankedSignal["severity"], number> = { high: 3, med: 2, low: 1 };

function categoryToTag(cat: string): RankedSignal["tag"] {
  const c = cat.toUpperCase();
  if (c.includes("WHALE")) return "WHALE";
  if (c.includes("LIQ")) return "LIQ";
  if (c.includes("FLOW") || c.includes("ETF") || c.includes("STABLE")) return "FLOW";
  if (c.includes("OI") || c.includes("OPEN_INTEREST") || c.includes("FUNDING")) return "OI";
  if (c.includes("PUMP") || c.includes("TVL")) return "PUMP";
  return "NEWS";
}

function ageString(ms: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function rankSignals(records: AlertRecord[]): RankedSignal[] {
  const flat: { rec: AlertRecord; finding: AlertRecord["findings"][number]; ts: number }[] = [];
  for (const rec of records) {
    const ts = Date.parse(rec.ts);
    if (!Number.isFinite(ts)) continue;
    for (const f of rec.findings) flat.push({ rec, finding: f, ts });
  }

  const firstSeen = new Map<string, number>();
  const cutoff24h = Date.now() - 24 * 3600 * 1000;
  for (const item of flat) {
    if (item.ts < cutoff24h) continue;
    const key = `${item.finding.category}:${item.rec.symbol}`;
    const prev = firstSeen.get(key);
    if (prev == null || item.ts < prev) firstSeen.set(key, item.ts);
  }

  return flat
    .map(({ rec, finding, ts }) => {
      const key = `${finding.category}:${rec.symbol}`;
      const novelty = firstSeen.get(key) === ts ? 1.0 : 0.5;
      const hoursOld = Math.max(0, (Date.now() - ts) / 3600_000);
      const recency = Math.exp(-hoursOld / 12);
      const score = SEVERITY_W[finding.severity] * novelty * recency;
      return {
        tag: categoryToTag(finding.category),
        symbol: rec.symbol,
        signal: finding.signal,
        severity: finding.severity,
        ts,
        score,
        ageStr: ageString(ts),
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function SignalFeed() {
  const { data, loading, error } = useFlow<RecentResp>("/api/alerts/recent?limit=100");
  const isMobile = useIsMobile();

  if (loading && !data) return <SignalEmpty>Loading signals...</SignalEmpty>;
  if (error) return <SignalEmpty tone="red">Alerts feed error: {error}</SignalEmpty>;
  if (!data?.configured && data?.message) return <SignalEmpty>{data.message}</SignalEmpty>;

  const ranked = rankSignals(data?.records ?? []);

  if (isMobile) {
    return (
      <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <div style={{ flex: 1, minHeight: 0, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {ranked.length === 0 ? (
            <div style={{ padding: 16, fontFamily: fonts.mono, fontSize: 11, color: colors.txt4 }}>
              No findings in last {data?.count ?? 0} alert scans; scanner returned clean.
            </div>
          ) : (
            ranked.map((s, i) => (
              <SignalCard key={`${s.symbol}-${s.ts}-${i}`} signal={s} />
            ))
          )}
        </div>
        <ScoreFooter />
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 10 }}>
        <thead>
          <tr style={{ color: colors.txt4, textAlign: "left", letterSpacing: "0.08em" }}>
            <th style={th}>TAG</th>
            <th style={th}>SYM</th>
            <th style={th}>SIGNAL</th>
            <th style={{ ...th, textAlign: "right" }}>SCORE</th>
            <th style={{ ...th, textAlign: "right" }}>AGE</th>
          </tr>
        </thead>
        <tbody>
          {ranked.length === 0 ? (
            <tr>
              <td colSpan={5} style={{ padding: 16, color: colors.txt4 }}>
                No findings in last {data?.count ?? 0} alert scans; scanner returned clean.
              </td>
            </tr>
          ) : (
            ranked.map((s, i) => (
              <tr key={`${s.symbol}-${s.ts}-${i}`} style={{ borderTop: `1px solid ${colors.line}`, color: colors.txt3 }}>
                <td style={td}><SignalPill tone={s.tag} size="xs">{s.tag}</SignalPill></td>
                <td style={{ ...td, color: colors.txt2 }}>{s.symbol}</td>
                <td style={{ ...td, color: colors.txt2 }}>{s.signal}</td>
                <td style={{ ...td, textAlign: "right", color: colors.txt2, fontVariantNumeric: "tabular-nums" }}>{s.score.toFixed(2)}</td>
                <td style={{ ...td, textAlign: "right", color: colors.txt4 }}>{s.ageStr}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <ScoreFooter />
    </div>
  );
}

function SignalCard({ signal }: { signal: RankedSignal }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "10px 12px",
        borderBottom: `1px solid ${colors.line}`,
        fontFamily: fonts.mono,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <SignalPill tone={signal.tag} size="xs">{signal.tag}</SignalPill>
        <span style={{ color: colors.txt2, fontSize: 12, fontWeight: 600, letterSpacing: "0.04em" }}>{signal.symbol}</span>
        <span style={{ marginLeft: "auto", color: colors.txt4, fontSize: 10 }}>{signal.ageStr}</span>
      </div>
      <div style={{ color: colors.txt2, fontSize: 12, lineHeight: 1.4 }}>{signal.signal}</div>
      <div style={{ color: colors.txt4, fontSize: 9, fontVariantNumeric: "tabular-nums" }}>
        score {signal.score.toFixed(2)} / severity {signal.severity}
      </div>
    </div>
  );
}

function SignalEmpty({ children, tone }: { children: ReactNode; tone?: "red" }) {
  return (
    <div style={{ padding: "14px 16px", fontFamily: fonts.mono, fontSize: 11, color: tone === "red" ? colors.red : colors.txt3 }}>
      {children}
    </div>
  );
}

function ScoreFooter() {
  return (
    <div style={{ marginTop: "auto", padding: "6px 10px", borderTop: `1px solid ${colors.line}`, fontSize: 9, color: colors.txt4 }}>
      Composite score = severity({SEVERITY_W.high}/{SEVERITY_W.med}/{SEVERITY_W.low}) x novelty(1.0/0.5) x recency(exp(-h/12))
    </div>
  );
}

function ActionItems() {
  const recent = useFlow<RecentResp>("/api/alerts/recent?limit=100");
  const health = useFlow<HealthResp>("/api/health");
  const ranked = useMemo(() => rankSignals(recent.data?.records ?? []), [recent.data]);
  const actions = useMemo(
    () => buildActions({
      ranked,
      health: health.data,
      alerts: recent.data,
      alertError: recent.error,
      healthError: health.error,
    }),
    [health.data, health.error, ranked, recent.data, recent.error],
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: fonts.mono, fontSize: 10 }}>
      {(recent.loading || health.loading) && <InlineState>Loading action inputs...</InlineState>}
      {actions.map((action, i) => (
        <div
          key={`${action.kind}:${action.title}:${i}`}
          style={{
            display: "grid",
            gridTemplateColumns: "70px 1fr",
            alignItems: "center",
            gap: 8,
            padding: "10px 10px",
            minHeight: 44,
            borderTop: i === 0 ? "none" : `1px solid ${colors.line}`,
          }}
        >
          <SignalPill tone={toneForAction(action.kind)} size="xs">{action.kind}</SignalPill>
          <div>
            <div style={{ color: colors.txt2, lineHeight: 1.45 }}>{action.title}</div>
            <div style={{ color: colors.txt4, fontSize: 9, marginTop: 2 }}>{action.reason}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: "6px 10px", borderTop: `1px solid ${colors.line}`, fontSize: 9, color: colors.txt4 }}>
        Derived from /api/alerts/recent and /api/health. No execution controls on this screen.
      </div>
    </div>
  );
}

type ActionKind = "DECIDE" | "WATCH" | "REVIEW";
interface ActionItem {
  kind: ActionKind;
  title: string;
  reason: string;
}

function buildActions({
  ranked,
  health,
  alerts,
  alertError,
  healthError,
}: {
  ranked: RankedSignal[];
  health: HealthResp | null;
  alerts: RecentResp | null;
  alertError: string | null;
  healthError: string | null;
}): ActionItem[] {
  const actions: ActionItem[] = [];

  if (alertError) {
    actions.push({ kind: "REVIEW", title: "Alert log endpoint failed", reason: alertError });
  } else if (alerts && !alerts.configured) {
    actions.push({ kind: "REVIEW", title: "Alert worker not writing recent log", reason: alerts.message ?? "No alert log returned" });
  }

  for (const signal of ranked.filter((s) => s.severity !== "low").slice(0, 3)) {
    actions.push({
      kind: signal.severity === "high" ? "DECIDE" : "WATCH",
      title: `${signal.symbol} ${signal.tag}: ${signal.signal}`,
      reason: `${signal.severity} severity / score ${signal.score.toFixed(2)} / ${signal.ageStr} old`,
    });
  }

  if (healthError) {
    actions.push({ kind: "REVIEW", title: "Health endpoint failed", reason: healthError });
  } else if (health?.status && health.status !== "healthy") {
    actions.push({ kind: "REVIEW", title: `System health is ${health.status}`, reason: "/api/health reports degraded upstream or hub state" });
  }

  if (actions.length === 0) {
    actions.push({
      kind: "WATCH",
      title: "No med/high alert action from recent scans",
      reason: alerts ? `${alerts.count} scan(s) checked; health ${health?.status ?? "checking"}` : "waiting for alerts endpoint",
    });
  }

  return actions.slice(0, 5);
}

function toneForAction(kind: ActionKind) {
  if (kind === "DECIDE") return "amber";
  if (kind === "REVIEW") return "down";
  return "muted";
}

interface FundingSummary {
  avgBps: number | null;
  count: number;
  bias: string;
}

function summarizeFunding(rates: FundingRate[]): FundingSummary {
  const majorRates = rates.filter((rate) => {
    const symbol = rate.symbol.toUpperCase().replace(/[-_]/g, "");
    return symbol.startsWith("BTC") || symbol.startsWith("ETH") || symbol.startsWith("SOL");
  });
  const sample = majorRates.length > 0 ? majorRates : rates;
  if (sample.length === 0) return { avgBps: null, count: 0, bias: "funding unavailable" };

  const avgBps = sample.reduce((sum, rate) => sum + rate.ratePercent * 100, 0) / sample.length;
  const bias = avgBps > 1 ? "long leverage paying" : avgBps < -1 ? "short pressure paying" : "leverage neutral";
  return { avgBps, count: sample.length, bias };
}

function deriveRegime({
  dxyChange,
  spxChange,
  stable7dPct,
  avgFundingBps,
}: {
  dxyChange: number | null;
  spxChange: number | null;
  stable7dPct: number | null;
  avgFundingBps: number | null;
}) {
  let score = 0;
  const reasons: string[] = [];

  if (spxChange != null) {
    if (spxChange > 0.25) { score += 1; reasons.push("SPX bid"); }
    else if (spxChange < -0.25) { score -= 1; reasons.push("SPX offered"); }
    else reasons.push("SPX flat");
  }
  if (dxyChange != null) {
    if (dxyChange < -0.15) { score += 1; reasons.push("DXY softer"); }
    else if (dxyChange > 0.15) { score -= 1; reasons.push("DXY firmer"); }
    else reasons.push("DXY flat");
  }
  if (stable7dPct != null) {
    if (stable7dPct > 0.1) { score += 1; reasons.push("stablecoin supply expanding"); }
    else if (stable7dPct < -0.1) { score -= 1; reasons.push("stablecoin supply contracting"); }
    else reasons.push("stablecoins flat");
  }
  if (avgFundingBps != null) {
    if (avgFundingBps > 1) { score += 1; reasons.push("funding positive"); }
    else if (avgFundingBps < -1) { score -= 1; reasons.push("funding negative"); }
    else reasons.push("funding neutral");
  }

  if (score >= 2) {
    return { label: "RISK-ON" as const, tone: "up" as const, reason: reasons.join(" / ") || "Live inputs lean risk-on." };
  }
  if (score <= -2) {
    return { label: "RISK-OFF" as const, tone: "down" as const, reason: reasons.join(" / ") || "Live inputs lean risk-off." };
  }
  return { label: "RANGE" as const, tone: "amber" as const, reason: reasons.join(" / ") || "Waiting for enough live inputs." };
}

function buildDigestLines({
  ticker,
  macro,
  stablecoins,
  funding,
  topSignal,
  alertsConfigured,
  alertScanCount,
}: {
  ticker: TickerResp | null;
  macro: MacroResponse | null;
  stablecoins: StablecoinFlow | null;
  funding: FundingSummary;
  topSignal?: RankedSignal;
  alertsConfigured: boolean | null;
  alertScanCount: number | null;
}): string[] {
  const lines: string[] = [];

  const btc = ticker?.btc
    ? `BTC ${formatUSD(ticker.btc.price, { compact: ticker.btc.price >= 1000, decimals: 2 })} (${formatPercent(ticker.btc.change24h)} 24h)`
    : "BTC price unavailable";
  const eth = ticker?.eth
    ? `ETH ${formatUSD(ticker.eth.price, { compact: ticker.eth.price >= 1000, decimals: 2 })} (${formatPercent(ticker.eth.change24h)} 24h)`
    : "ETH price unavailable";
  const fearGreed = ticker?.fearGreed ? `Fear/Greed ${ticker.fearGreed.value} ${ticker.fearGreed.classification}` : "Fear/Greed unavailable";
  lines.push(`${btc}; ${eth}. ${fearGreed}.`);

  lines.push(
    funding.avgBps == null
      ? "Funding endpoint returned no major rows yet."
      : `Perp funding avg ${funding.avgBps.toFixed(2)}bps across ${funding.count} major rows; ${funding.bias}.`,
  );

  if (stablecoins) {
    lines.push(
      `Stablecoin supply ${formatUSD(stablecoins.summary.currentTotal)} total; 7d ${formatSignedUsd(stablecoins.summary.change7d)} (${formatPercent(stablecoins.summary.change7dPercent)}).`,
    );
  } else {
    lines.push("Stablecoin supply unavailable.");
  }

  const macroParts = [
    macro?.dxy ? `DXY ${formatPercent(macro.dxy.change24h)}` : null,
    macro?.spx ? `SPX ${formatPercent(macro.spx.change24h)}` : null,
    macro?.gold ? `Gold ${formatPercent(macro.gold.change24h)}` : null,
  ].filter(Boolean);
  lines.push(macroParts.length ? `Macro tape: ${macroParts.join(", ")}.` : "Macro tape unavailable.");

  if (topSignal) {
    lines.push(`Top logged signal: ${topSignal.symbol} ${topSignal.tag} ${topSignal.severity} - ${topSignal.signal} (${topSignal.ageStr}).`);
  } else if (alertsConfigured === false) {
    lines.push("Alerts log is not configured or has not been generated by the worker yet.");
  } else {
    lines.push(`Alerts log returned no ranked findings across ${alertScanCount ?? 0} recent scans.`);
  }

  return lines;
}

function formatSignedUsd(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${formatUSD(value)}`;
}

function InlineState({ children, tone }: { children: ReactNode; tone?: "red" }) {
  return (
    <div style={{ fontFamily: fonts.mono, fontSize: 10, color: tone === "red" ? colors.red : colors.txt4 }}>
      {children}
    </div>
  );
}

const th: CSSProperties = {
  padding: "5px 10px",
  fontWeight: 500,
  fontSize: 9,
  textTransform: "uppercase",
  background: colors.bg2,
  borderBottom: `1px solid ${colors.line}`,
};

const td: CSSProperties = {
  padding: "6px 10px",
  verticalAlign: "top",
};
