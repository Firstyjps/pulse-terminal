"use client";

import { Panel, WsRow, Workspace, StatBlock, MonoNum, SignalPill, colors, fonts } from "@pulse/ui";

/**
 * Morning Brief — question-driven single-screen dashboard.
 *
 * ROADMAP Action 1: open pulse.local in the morning → 30 seconds to know what
 * to focus on today. Sections in priority order:
 *
 *   Row 1 (stats):   PORTFOLIO STRIP    — total + per-window P&L + venue split
 *   Row 2 (digest):  OVERNIGHT DIGEST   c-8  ·  MACRO REGIME  c-4
 *   Row 3 (action):  SIGNAL FEED top-5  c-7  ·  ACTION ITEMS  c-5
 *
 * All data is PLACEHOLDER until subsequent dispatches wire:
 *   - /api/portfolio/aggregate (Role 3)
 *   - /api/digest/today        (alerts worker)
 *   - /api/regime              (intelligence layer)
 *   - re-ranked alerts feed    (signal scorer)
 */
export default function MorningPage() {
  return (
    <Workspace>
      {/* Row 1 — Portfolio strip (4 KPI tiles + venue breakdown) */}
      <WsRow height="stats">
        <Panel
          span={12}
          title="PORTFOLIO"
          badge={<span><span style={{ color: colors.amber }}>●</span> PLACEHOLDER</span>}
          flush
        >
          <PortfolioStrip />
        </Panel>
      </WsRow>

      {/* Row 2 — Overnight digest + Macro regime */}
      <WsRow height="auto" style={{ minHeight: 240 }}>
        <Panel
          span={8}
          title="OVERNIGHT DIGEST"
          badge="07:00 ICT · PLACEHOLDER"
        >
          <OvernightDigest />
        </Panel>
        <Panel
          span={4}
          title="MACRO REGIME"
          badge="RULES v0 · PLACEHOLDER"
        >
          <MacroRegime />
        </Panel>
      </WsRow>

      {/* Row 3 — Signal feed + Action items */}
      <WsRow height="auto" style={{ minHeight: 360 }}>
        <Panel
          span={7}
          title="SIGNAL FEED"
          badge="TOP 5 · PLACEHOLDER"
          flush
        >
          <SignalFeed />
        </Panel>
        <Panel
          span={5}
          title="ACTION ITEMS"
          badge="TODAY · PLACEHOLDER"
          flush
        >
          <ActionItems />
        </Panel>
      </WsRow>
    </Workspace>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */
/*  Section components — placeholder data flagged with `_isProxy: true`     */
/*  shape until /api/portfolio/aggregate + /api/digest + /api/regime ship.  */
/* ──────────────────────────────────────────────────────────────────────── */

function PortfolioStrip() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(4, minmax(0, 1fr)) 1.4fr",
        gap: 1,
        background: colors.line,
        height: "100%",
      }}
    >
      <StatBlock
        label="TOTAL USD"
        value={<MonoNum size={18} value={null}>$—,—</MonoNum>}
        delta="+—.——%"
        deltaColor={colors.txt4}
        sub="vs prev close"
      />
      <StatBlock
        label="24H P&L"
        value={<MonoNum size={18} value={null}>$—</MonoNum>}
        delta="—.——%"
        deltaColor={colors.txt4}
        sub="realized + unrealized"
      />
      <StatBlock
        label="7D P&L"
        value={<MonoNum size={18} value={null}>$—</MonoNum>}
        delta="—.——%"
        deltaColor={colors.txt4}
        sub="rolling 7d"
      />
      <StatBlock
        label="30D P&L"
        value={<MonoNum size={18} value={null}>$—</MonoNum>}
        delta="—.——%"
        deltaColor={colors.txt4}
        sub="rolling 30d"
      />
      <VenueBreakdown />
    </div>
  );
}

function VenueBreakdown() {
  // PLACEHOLDER: real data from /api/portfolio/aggregate `byVenue` field
  const venues: { name: string; pct: number }[] = [
    { name: "BINANCE", pct: 0 },
    { name: "BYBIT",   pct: 0 },
    { name: "OKX",     pct: 0 },
    { name: "BITKUB",  pct: 0 },
    { name: "GATE",    pct: 0 },
    { name: "DEFI LP", pct: 0 },
  ];
  return (
    <div
      style={{
        background: colors.bg1,
        padding: "8px 10px",
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.txt3,
        }}
      >
        VENUE SPLIT
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "2px 12px",
          fontFamily: fonts.mono,
          fontSize: 10,
        }}
      >
        {venues.map((v) => (
          <div key={v.name} style={{ display: "flex", justifyContent: "space-between", color: colors.txt3 }}>
            <span>{v.name}</span>
            <span style={{ color: colors.txt2, fontVariantNumeric: "tabular-nums" }}>
              {v.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function OvernightDigest() {
  // PLACEHOLDER: real paragraph from apps/alerts/data/digest-YYYY-MM-DD.md
  return (
    <div
      style={{
        fontFamily: fonts.mono,
        fontSize: 11,
        lineHeight: 1.65,
        color: colors.txt2,
        display: "flex",
        flexDirection: "column",
        gap: 10,
        height: "100%",
      }}
    >
      <p style={{ margin: 0 }}>
        <span style={{ color: colors.amber }}>▸</span>{" "}
        <span style={{ color: colors.txt4, fontStyle: "italic" }}>
          Digest generator wires up at Week 2-3 (intelligence layer).
          Conversational paragraph, ~150 words, written by Claude over MCP each
          morning at 06:30 ICT and persisted to{" "}
          <code style={{ color: colors.cyan }}>apps/alerts/data/digest-YYYY-MM-DD.md</code>.
        </span>
      </p>

      <div
        style={{
          padding: "8px 10px",
          background: colors.bg2,
          border: `1px dashed ${colors.line2}`,
          color: colors.txt3,
          fontSize: 10,
        }}
      >
        <div style={{ color: colors.txt4, marginBottom: 4, letterSpacing: "0.08em" }}>
          ── EXAMPLE OUTPUT (NOT LIVE) ──
        </div>
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
        <span style={{ color: colors.txt4, fontSize: 10 }}>
          digest-2026-05-01.md (not generated yet)
        </span>
      </div>
    </div>
  );
}

function MacroRegime() {
  // PLACEHOLDER: real value from /api/regime → "Risk-On" | "Risk-Off" | "Range"
  const regime = "RANGE" as "RISK-ON" | "RISK-OFF" | "RANGE";
  const tone = regime === "RISK-ON" ? "up" : regime === "RISK-OFF" ? "down" : "amber";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        height: "100%",
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
        <SignalPill tone={tone} size="sm" glow>
          {regime}
        </SignalPill>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            color: colors.txt3,
            lineHeight: 1.55,
          }}
        >
          Funding compressed across BTC/ETH/SOL · DXY flat · stablecoins flat.
          No directional thrust either side.
        </div>
      </div>

      <div style={{ borderTop: `1px solid ${colors.line}`, paddingTop: 8 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 9,
            color: colors.txt4,
            letterSpacing: "0.10em",
            marginBottom: 6,
          }}
        >
          INPUTS
        </div>
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

function SignalFeed() {
  // PLACEHOLDER: real signals from re-ranked apps/alerts/data/alerts.jsonl
  type Sig = { tag: "WHALE" | "LIQ" | "FLOW" | "OI" | "PUMP" | "NEWS"; symbol: string; note: string; score: number; age: string };
  const signals: Sig[] = [
    { tag: "FLOW",  symbol: "—",       note: "(re-ranked alerts feed pending)", score: 0, age: "—" },
    { tag: "OI",    symbol: "—",       note: "(re-ranked alerts feed pending)", score: 0, age: "—" },
    { tag: "WHALE", symbol: "—",       note: "(re-ranked alerts feed pending)", score: 0, age: "—" },
    { tag: "LIQ",   symbol: "—",       note: "(re-ranked alerts feed pending)", score: 0, age: "—" },
    { tag: "NEWS",  symbol: "—",       note: "(re-ranked alerts feed pending)", score: 0, age: "—" },
  ];

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <table
        style={{
          width: "100%",
          borderCollapse: "collapse",
          fontFamily: fonts.mono,
          fontSize: 10,
        }}
      >
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
          {signals.map((s, i) => (
            <tr
              key={i}
              style={{
                borderTop: `1px solid ${colors.line}`,
                color: colors.txt3,
              }}
            >
              <td style={td}>
                <SignalPill tone={s.tag} size="xs">{s.tag}</SignalPill>
              </td>
              <td style={{ ...td, color: colors.txt2 }}>{s.symbol}</td>
              <td style={{ ...td, color: colors.txt3 }}>{s.note}</td>
              <td style={{ ...td, textAlign: "right", color: colors.txt2, fontVariantNumeric: "tabular-nums" }}>
                {s.score.toFixed(2)}
              </td>
              <td style={{ ...td, textAlign: "right", color: colors.txt4 }}>{s.age}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: "auto", padding: "6px 10px", borderTop: `1px solid ${colors.line}`, fontSize: 9, color: colors.txt4 }}>
        Composite score = severity × novelty × user-relevance · ranker pending
      </div>
    </div>
  );
}

function ActionItems() {
  // PLACEHOLDER: actions derived from signals + open positions + portfolio drift
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        fontFamily: fonts.mono,
        fontSize: 10,
      }}
    >
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
