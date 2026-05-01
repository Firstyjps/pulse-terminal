"use client";

import { Panel, WsRow, Workspace, SignalPill, colors, fonts } from "@pulse/ui";
import { useFlow } from "../../lib/use-flow";

/**
 * Morning Brief — question-driven single-screen dashboard.
 *
 *   Row 1 (digest):  OVERNIGHT DIGEST   c-8  ·  MACRO REGIME  c-4
 *   Row 2 (action):  SIGNAL FEED top-5  c-7  ·  ACTION ITEMS  c-5
 *
 * Wired now: SIGNAL FEED (/api/alerts/recent re-ranked).
 * Still PLACEHOLDER: OVERNIGHT DIGEST, MACRO REGIME inputs, ACTION ITEMS — wire at Week 2-3.
 */
export default function MorningPage() {
  return (
    <Workspace>
      <WsRow height="auto" style={{ minHeight: 240 }}>
        <Panel span={8} title="OVERNIGHT DIGEST" badge="07:00 ICT · PLACEHOLDER">
          <OvernightDigest />
        </Panel>
        <Panel span={4} title="MACRO REGIME" badge="RULES v0 · PLACEHOLDER">
          <MacroRegime />
        </Panel>
      </WsRow>

      <WsRow height="auto" style={{ minHeight: 360 }}>
        <Panel span={7} title="SIGNAL FEED" badge="TOP 5 · LIVE" flush>
          <SignalFeed />
        </Panel>
        <Panel span={5} title="ACTION ITEMS" badge="TODAY · PLACEHOLDER" flush>
          <ActionItems />
        </Panel>
      </WsRow>
    </Workspace>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  OVERNIGHT DIGEST — placeholder until Week 2-3 (digest generator cron)    */
/* ──────────────────────────────────────────────────────────────────────── */

function OvernightDigest() {
  return (
    <div style={{ fontFamily: fonts.mono, fontSize: 11, lineHeight: 1.65, color: colors.txt2, display: "flex", flexDirection: "column", gap: 10, height: "100%" }}>
      <p style={{ margin: 0 }}>
        <span style={{ color: colors.amber }}>▸</span>{" "}
        <span style={{ color: colors.txt4, fontStyle: "italic" }}>
          Digest generator wires up at Week 2-3 (intelligence layer).
          Conversational paragraph, ~150 words, written by Claude over MCP each
          morning at 06:30 ICT and persisted to{" "}
          <code style={{ color: colors.cyan }}>apps/alerts/data/digest-YYYY-MM-DD.md</code>.
        </span>
      </p>
      <div style={{ padding: "8px 10px", background: colors.bg2, border: `1px dashed ${colors.line2}`, color: colors.txt3, fontSize: 10 }}>
        <div style={{ color: colors.txt4, marginBottom: 4, letterSpacing: "0.08em" }}>── EXAMPLE OUTPUT (NOT LIVE) ──</div>
        Markets traded sideways overnight with BTC pinned around $—.—K and ETH
        showing modest weakness against the cross. Funding compressed across all
        three majors — Binance perp now at —bps vs. —bps yesterday — pointing to
        leverage being rinsed without a directional bid. Stablecoin supply
        printed flat (USDT cap +$—M, USDC -$—M); no fresh dollar entering the
        complex. Two whale alerts on Bybit (BTC +$—M into spot wallet) and one
        ETF inflow notice from Farside scrape. Bias remains range-bound until
        funding crosses zero or DXY breaks $—.
      </div>
      <div style={{ marginTop: "auto", display: "flex", gap: 6, alignItems: "center" }}>
        <SignalPill tone="muted" size="xs">SOURCE</SignalPill>
        <span style={{ color: colors.txt4, fontSize: 10 }}>digest-YYYY-MM-DD.md (not generated yet)</span>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  MACRO REGIME — still placeholder inputs (rules engine pending)           */
/* ──────────────────────────────────────────────────────────────────────── */

function MacroRegime() {
  const regime = "RANGE" as "RISK-ON" | "RISK-OFF" | "RANGE";
  const tone = regime === "RISK-ON" ? "up" : regime === "RISK-OFF" ? "down" : "amber";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <SignalPill tone={tone} size="sm" glow>{regime}</SignalPill>
        <div style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.txt3, lineHeight: 1.55 }}>
          Funding compressed across BTC/ETH/SOL · DXY flat · stablecoins flat.
          No directional thrust either side.
        </div>
      </div>
      <div style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 8 }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 9, color: colors.txt4, letterSpacing: "0.10em", marginBottom: 6 }}>INPUTS</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: "3px 8px", fontSize: 10, fontFamily: fonts.mono }}>
          <span style={{ color: colors.txt3 }}>Funding (4-venue avg)</span>
          <span style={{ color: colors.txt2, fontVariantNumeric: "tabular-nums" }}>—bps</span>
          <span style={{ color: colors.txt3 }}>BTC.D</span>
          <span style={{ color: colors.txt2, fontVariantNumeric: "tabular-nums" }}>—.—%</span>
          <span style={{ color: colors.txt3 }}>DXY 1d</span>
          <span style={{ color: colors.txt2, fontVariantNumeric: "tabular-nums" }}>—.—%</span>
          <span style={{ color: colors.txt3 }}>Stable Δ24h</span>
          <span style={{ color: colors.txt2, fontVariantNumeric: "tabular-nums" }}>$—M</span>
        </div>
      </div>
      <div style={{ marginTop: "auto" }}>
        <SignalPill tone="muted" size="xs">RULES v0 + LLM OVERRIDE PENDING</SignalPill>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  SIGNAL FEED — wired to /api/alerts/recent, re-ranked top 5               */
/* ──────────────────────────────────────────────────────────────────────── */

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
  if (c.includes("OI") || c.includes("OPEN_INTEREST")) return "OI";
  if (c.includes("PUMP")) return "PUMP";
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

  // Novelty: 1.0 if (category, symbol) first occurrence in last 24h, else 0.5
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
      const sevW = SEVERITY_W[finding.severity];
      const key = `${finding.category}:${rec.symbol}`;
      const novelty = firstSeen.get(key) === ts ? 1.0 : 0.5;
      const hoursOld = Math.max(0, (Date.now() - ts) / 3600_000);
      const recency = Math.exp(-hoursOld / 12);
      const score = sevW * novelty * recency;
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

  if (loading && !data) {
    return <SignalEmpty>Loading signals…</SignalEmpty>;
  }
  if (error) {
    return <SignalEmpty tone="red">Alerts feed error: {error}</SignalEmpty>;
  }
  if (!data?.configured && data?.message) {
    return <SignalEmpty>{data.message}</SignalEmpty>;
  }

  const ranked = rankSignals(data?.records ?? []);

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
                No findings in last {data?.count ?? 0} alert scans · scanner running clean
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
      <div style={{ marginTop: "auto", padding: "6px 10px", borderTop: `1px solid ${colors.line}`, fontSize: 9, color: colors.txt4 }}>
        Composite score = severity({SEVERITY_W.high}/{SEVERITY_W.med}/{SEVERITY_W.low}) × novelty(1.0/0.5) × recency(exp(-h/12))
      </div>
    </div>
  );
}

function SignalEmpty({ children, tone }: { children: React.ReactNode; tone?: "red" }) {
  return (
    <div style={{ padding: "14px 16px", fontFamily: fonts.mono, fontSize: 11, color: tone === "red" ? colors.red : colors.txt3 }}>
      {children}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  ACTION ITEMS — placeholder until signal scorer + DeFi adapters wire up   */
/* ──────────────────────────────────────────────────────────────────────── */

function ActionItems() {
  type Action = { kind: "DECIDE" | "WATCH" | "REBALANCE" | "REVIEW"; title: string; reason: string };
  const actions: Action[] = [
    { kind: "DECIDE",    title: "(action items derived from signals + portfolio drift)", reason: "wires up after signal scorer" },
    { kind: "WATCH",     title: "(macro regime change watchlist)",                      reason: "wires up after regime indicator" },
    { kind: "REBALANCE", title: "(LP position drift > threshold)",                      reason: "wires up after DeFi adapters" },
    { kind: "REVIEW",    title: "(open paper trades requiring review)",                 reason: "wires up at Action 2 (Strategy Engine)" },
  ];
  const toneFor = (k: Action["kind"]) =>
    k === "DECIDE" ? "amber" : k === "WATCH" ? "info" : k === "REBALANCE" ? "OI" : "muted";

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", fontFamily: fonts.mono, fontSize: 10 }}>
      {actions.map((a, i) => (
        <div
          key={i}
          style={{
            display: "grid",
            gridTemplateColumns: "70px 1fr",
            alignItems: "start",
            gap: 8,
            padding: "8px 10px",
            borderTop: i === 0 ? "none" : `1px solid ${colors.line}`,
          }}
        >
          <SignalPill tone={toneFor(a.kind)} size="xs">{a.kind}</SignalPill>
          <div>
            <div style={{ color: colors.txt2, lineHeight: 1.45 }}>{a.title}</div>
            <div style={{ color: colors.txt4, fontSize: 9, marginTop: 2 }}>{a.reason}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: "auto", padding: "6px 10px", borderTop: `1px solid ${colors.line}`, fontSize: 9, color: colors.txt4 }}>
        Semi-auto execution unlocked after 90d stable paper-trade · per ROADMAP
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "5px 10px",
  fontWeight: 500,
  fontSize: 9,
  textTransform: "uppercase",
  background: colors.bg2,
  borderBottom: `1px solid ${colors.line}`,
};

const td: React.CSSProperties = {
  padding: "6px 10px",
  verticalAlign: "top",
};
