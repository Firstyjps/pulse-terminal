"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Panel, WsRow, Workspace, SignalPill, colors, fonts } from "@pulse/ui";
import { PulseClient, type ServerMessage } from "../../lib/ws-client";
import { FundingHeatmap } from "../../components/FundingHeatmap";
import { MCPQuickAsk } from "../../components/MCPQuickAsk";
import { fmtTimeICT } from "../../lib/time";

interface FundingRow {
  exchange: string;
  symbol: string;
  ratePercent: number;
  ts: number;
}

interface FundingFlip {
  exchange: string;
  symbol: string;
  prev: number;
  curr: number;
  delta: number;
  ts: number;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";

export default function DerivativesPage() {
  const [status, setStatus] = useState<"connecting" | "open" | "closed" | "error">("connecting");
  const [funding, setFunding] = useState<Map<string, FundingRow>>(new Map());
  const [lastTickTs, setLastTickTs] = useState<number | null>(null);
  const [flips, setFlips] = useState<FundingFlip[]>([]);
  const [debugOpen, setDebugOpen] = useState(false);
  const clientRef = useRef<PulseClient | null>(null);
  const flipsRef = useRef<FundingFlip[]>([]);

  useEffect(() => {
    const client = new PulseClient({
      url: WS_URL,
      onStatus: setStatus,
      onMessage: (msg: ServerMessage) => {
        if (msg.type !== "funding") return;
        const key = `${msg.exchange}:${msg.symbol}`;
        setFunding((prev) => {
          const previous = prev.get(key);
          if (previous && Math.sign(previous.ratePercent) !== Math.sign(msg.ratePercent) && previous.ratePercent !== 0) {
            const flip: FundingFlip = {
              exchange: msg.exchange,
              symbol: msg.symbol,
              prev: previous.ratePercent,
              curr: msg.ratePercent,
              delta: msg.ratePercent - previous.ratePercent,
              ts: msg.ts,
            };
            const cutoff = msg.ts - 60 * 60 * 1000;
            const next = [flip, ...flipsRef.current.filter((f) => f.ts >= cutoff)].slice(0, 50);
            flipsRef.current = next;
            setFlips(next);
          }
          const m = new Map(prev);
          m.set(key, { exchange: msg.exchange, symbol: msg.symbol, ratePercent: msg.ratePercent, ts: msg.ts });
          return m;
        });
        setLastTickTs(msg.ts);
      },
    });
    clientRef.current = client;
    return () => client.close();
  }, []);

  const rows = useMemo(
    () =>
      Array.from(funding.values()).sort(
        (a, b) => a.exchange.localeCompare(b.exchange) || a.symbol.localeCompare(b.symbol),
      ),
    [funding],
  );

  const topFlips = useMemo(() => [...flips].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5), [flips]);

  return (
    <Workspace>
      {/* Connection status strip — always visible at top */}
      <WsRow height="auto">
        <Panel span={12} flush>
          <ConnectionStrip status={status} count={rows.length} lastTickTs={lastTickTs} />
        </Panel>
      </WsRow>

      {/* Funding heatmap — primary content */}
      <WsRow height="auto" style={{ minHeight: 480 }}>
        <Panel
          span={12}
          title="FUNDING HEATMAP"
          badge="4 VENUES · 1300+ RATES"
          actions={<MCPQuickAsk endpoint="/api/funding" label="Ask Claude" />}
          flush
        >
          <FundingHeatmap />
        </Panel>
      </WsRow>

      {/* Funding flips — sign changes in last 1h */}
      <WsRow height="auto" style={{ minHeight: 200 }}>
        <Panel
          span={12}
          title="FUNDING FLIPS"
          badge={`SIGN CHANGES · LAST 1H · ${topFlips.length} OF ${flips.length}`}
          flush
        >
          <FlipsTable flips={topFlips} />
        </Panel>
      </WsRow>

      {/* Collapsible debug */}
      <WsRow height="auto">
        <Panel
          span={12}
          title="LIVE WS STREAM"
          badge="DEBUG"
          actions={
            <button
              type="button"
              onClick={() => setDebugOpen((v) => !v)}
              style={{
                background: colors.bg2,
                border: `1px solid ${colors.line2}`,
                color: colors.txt2,
                fontFamily: fonts.mono,
                fontSize: 9,
                letterSpacing: "0.08em",
                padding: "1px 8px",
                cursor: "pointer",
              }}
            >
              {debugOpen ? "▼ HIDE" : "▶ SHOW"}
            </button>
          }
          flush
        >
          {debugOpen ? (
            <DebugStream rows={rows} url={WS_URL} />
          ) : (
            <div style={{ padding: "10px 14px", fontSize: 10, color: colors.txt4, fontFamily: fonts.mono }}>
              {rows.length} ticks cached · click SHOW to inspect raw stream
            </div>
          )}
        </Panel>
      </WsRow>
    </Workspace>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function ConnectionStrip({
  status,
  count,
  lastTickTs,
}: {
  status: "connecting" | "open" | "closed" | "error";
  count: number;
  lastTickTs: number | null;
}) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);

  const tone = status === "open" ? "up" : status === "error" ? "down" : status === "closed" ? "muted" : "amber";
  const dot = status === "open" ? colors.green : status === "error" ? colors.red : status === "closed" ? colors.txt3 : colors.amber;
  const ageSec = lastTickTs ? Math.max(0, Math.floor((now - lastTickTs) / 1000)) : null;
  const stale = ageSec != null && ageSec > 30;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 16,
        padding: "8px 14px",
        background: colors.bg1,
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.txt2,
      }}
    >
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span
          style={{
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: dot,
            boxShadow: status === "open" ? `0 0 8px ${dot}` : undefined,
          }}
        />
        <SignalPill tone={tone} size="sm">{status}</SignalPill>
      </span>

      <span style={{ color: colors.txt3 }}>
        <span style={{ color: colors.txt4 }}>RATES</span>{" "}
        <span style={{ color: colors.txt1, fontVariantNumeric: "tabular-nums" }}>{count}</span>
      </span>

      <span style={{ color: colors.txt3 }}>
        <span style={{ color: colors.txt4 }}>LAST TICK</span>{" "}
        <span style={{ color: stale ? colors.amber : colors.txt1, fontVariantNumeric: "tabular-nums" }}>
          {ageSec == null ? "—" : ageSec < 1 ? "now" : `${ageSec}s ago`}
        </span>
      </span>

      <span style={{ marginLeft: "auto", color: colors.txt4, fontSize: 10 }}>
        {WS_URL}
      </span>
    </div>
  );
}

function FlipsTable({ flips }: { flips: FundingFlip[] }) {
  if (flips.length === 0) {
    return (
      <div style={{ padding: "14px 16px", fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
        No sign flips in the last hour. Flips populate when a perp's funding rate crosses zero.
      </div>
    );
  }
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 11 }}>
      <thead>
        <tr style={{ textAlign: "left", color: colors.txt4, textTransform: "uppercase", letterSpacing: "0.08em" }}>
          <th style={cellHeader}>Direction</th>
          <th style={cellHeader}>Exchange</th>
          <th style={cellHeader}>Symbol</th>
          <th style={{ ...cellHeader, textAlign: "right" }}>Prev</th>
          <th style={{ ...cellHeader, textAlign: "right" }}>Curr</th>
          <th style={{ ...cellHeader, textAlign: "right" }}>Δ</th>
          <th style={{ ...cellHeader, textAlign: "right" }}>When</th>
        </tr>
      </thead>
      <tbody>
        {flips.map((f) => {
          const turnedPositive = f.prev < 0 && f.curr > 0;
          return (
            <tr key={`${f.exchange}:${f.symbol}:${f.ts}`} style={{ borderTop: `1px solid ${colors.line}` }}>
              <td style={cellBody}>
                <SignalPill tone={turnedPositive ? "up" : "down"} size="xs">
                  {turnedPositive ? "→ LONG" : "→ SHORT"}
                </SignalPill>
              </td>
              <td style={cellBody}>{f.exchange}</td>
              <td style={{ ...cellBody, color: colors.amber, fontWeight: 600 }}>{f.symbol}</td>
              <td style={{ ...cellBody, textAlign: "right", color: f.prev >= 0 ? colors.green : colors.red }}>
                {f.prev.toFixed(4)}%
              </td>
              <td style={{ ...cellBody, textAlign: "right", color: f.curr >= 0 ? colors.green : colors.red }}>
                {f.curr.toFixed(4)}%
              </td>
              <td style={{ ...cellBody, textAlign: "right", color: colors.txt1, fontVariantNumeric: "tabular-nums" }}>
                {(f.delta >= 0 ? "+" : "") + f.delta.toFixed(4)}%
              </td>
              <td style={{ ...cellBody, textAlign: "right", color: colors.txt4 }}>{fmtTimeICT(f.ts)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function DebugStream({ rows, url }: { rows: FundingRow[]; url: string }) {
  if (rows.length === 0) {
    return (
      <div style={{ padding: 16, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
        Waiting for funding ticks from <code>{url}</code>…
        <br />
        Start realtime with <code style={{ color: colors.cyan }}>pnpm --filter @pulse/realtime dev</code>.
      </div>
    );
  }
  return (
    <div style={{ maxHeight: 360, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontFamily: fonts.mono, fontSize: 11 }}>
        <thead>
          <tr style={{ textAlign: "left", color: colors.txt3, textTransform: "uppercase", letterSpacing: "0.08em" }}>
            <th style={cellHeader}>Exchange</th>
            <th style={cellHeader}>Symbol</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Funding %</th>
            <th style={{ ...cellHeader, textAlign: "right" }}>Updated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={`${r.exchange}:${r.symbol}`} style={{ borderBottom: `1px solid ${colors.line}` }}>
              <td style={cellBody}>{r.exchange}</td>
              <td style={{ ...cellBody, color: colors.amber, fontWeight: 600 }}>{r.symbol}</td>
              <td style={{ ...cellBody, textAlign: "right", color: r.ratePercent >= 0 ? colors.green : colors.red }}>
                {r.ratePercent.toFixed(4)}%
              </td>
              <td style={{ ...cellBody, textAlign: "right", color: colors.txt4 }}>{fmtTimeICT(r.ts)}</td>
            </tr>
          ))}
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
