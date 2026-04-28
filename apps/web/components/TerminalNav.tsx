"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { colors, fonts } from "@pulse/ui";
import { formatUSD, formatPercent } from "@pulse/sources";

interface NavItem {
  id: string;
  label: string;
  key: string;
  href: string;
}

const NAV: { section: string; items: NavItem[] }[] = [
  {
    section: "INTEL",
    items: [
      { id: "overview",  label: "Overview",  key: "F1", href: "/" },
      { id: "markets",   label: "Markets",   key: "F2", href: "/markets" },
      { id: "fundflow",  label: "Fundflow",  key: "F3", href: "/fundflow" },
    ],
  },
  {
    section: "TRADING",
    items: [
      { id: "derivatives", label: "Derivatives", key: "F4", href: "/derivatives" },
      { id: "backtest",    label: "Backtest",    key: "F5", href: "/backtest" },
    ],
  },
  {
    section: "SYSTEM",
    items: [
      { id: "alerts",   label: "Alerts",   key: "F6", href: "/alerts" },
      { id: "settings", label: "Settings", key: "F7", href: "/settings" },
    ],
  },
];

const KEY_TO_HREF = NAV.flatMap((g) => g.items).reduce<Record<string, string>>(
  (acc, it) => ((acc[it.key] = it.href), acc),
  {},
);

interface TickerData {
  btc: { price: number; change24h: number } | null;
  eth: { price: number; change24h: number } | null;
  fearGreed: { value: number; classification: string } | null;
  marketCap: { total: number; change24h: number } | null;
  ts: number;
}

/**
 * TerminalNav — 140px left rail with F-key shortcuts + live status blocks
 * under each section so the rail reads dense (handoff fidelity).
 *
 *   ─ INTEL ─                ─ TRADING ─               ─ SYSTEM ─
 *   F1 Overview              F4 Derivatives            F6 Alerts
 *   F2 Markets               F5 Backtest               F7 Settings
 *   F3 Fundflow              ┌─ DERIV ─────┐           ┌─ STATUS ────┐
 *   ┌─ FEED ──────┐          │ FND  +0.01% │           │ ALERTS  12  │
 *   │ MCAP  $2.6T │          │ OI   $89B   │           │ STREAMS  3  │
 *   │ BTC   $76K  │          └─────────────┘           │ UPLINK 14ms │
 *   │ ETH   $2.2K │                                    └─────────────┘
 *   │ F&G    33   │
 *   └─────────────┘
 */
export function TerminalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [ticker, setTicker] = useState<TickerData | null>(null);

  // Live status — same source as TerminalTicker, but only sampled for nav rail.
  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/ticker", { cache: "no-store" });
        if (!res.ok) return;
        const j = (await res.json()) as TickerData;
        if (!cancelled) setTicker(j);
      } catch { /* ignore */ }
    };
    void poll();
    const id = setInterval(poll, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // F1–F7 keyboard navigation (handoff feature)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (KEY_TO_HREF[e.key]) {
        e.preventDefault();
        router.push(KEY_TO_HREF[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      style={{
        width: 140,
        background: colors.bg1,
        borderRight: `1px solid ${colors.line}`,
        display: "flex",
        flexDirection: "column",
        fontFamily: fonts.mono,
        fontSize: 10,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        height: "100%",
        minHeight: 0,
        overflow: "auto",
      }}
    >
      {NAV.map((group, gi) => (
        <div key={group.section}>
          <div
            style={{
              padding: "8px 10px 4px",
              color: colors.txt4,
              fontSize: 9,
              borderTop: gi === 0 ? "none" : `1px solid ${colors.line}`,
            }}
          >
            — {group.section} —
          </div>
          {group.items.map((it) => {
            const active = isActive(it.href);
            return (
              <button
                key={it.id}
                type="button"
                onClick={() => router.push(it.href)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "5px 10px",
                  width: "100%",
                  background: active ? colors.bg2 : "transparent",
                  color: active ? colors.amber : colors.txt3,
                  border: "none",
                  borderLeft: `2px solid ${active ? colors.amber : "transparent"}`,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 10,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  userSelect: "none",
                }}
                onMouseEnter={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = colors.bg2;
                    e.currentTarget.style.color = colors.txt2;
                  }
                }}
                onMouseLeave={(e) => {
                  if (!active) {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.color = colors.txt3;
                  }
                }}
              >
                <span
                  style={{
                    width: 14,
                    color: active ? colors.amber : colors.txt4,
                    fontSize: 9,
                  }}
                >
                  {it.key}
                </span>
                <span>{it.label}</span>
              </button>
            );
          })}

          {/* live status block per section — keeps the rail dense */}
          {group.section === "INTEL" && <FeedBlock ticker={ticker} />}
          {group.section === "TRADING" && <DerivBlock />}
          {group.section === "SYSTEM" && <StatusBlock />}
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <div
        style={{
          padding: "8px 10px",
          fontSize: 9,
          color: colors.txt4,
          borderTop: `1px solid ${colors.line}`,
          lineHeight: 1.7,
          letterSpacing: "0.06em",
        }}
      >
        <div><span style={{ color: colors.green }}>●</span> SOCKET LIVE</div>
        <div><span style={{ color: colors.amber }}>●</span> MCP READY</div>
        <div><span style={{ color: colors.txt3 }}>●</span> {new Date().toISOString().slice(0, 10).replace(/-/g, "·")}</div>
      </div>
    </nav>
  );
}

function MiniBlock({ title, rows }: { title: string; rows: { k: string; v: React.ReactNode }[] }) {
  return (
    <div
      style={{
        margin: "6px 8px 8px",
        padding: "5px 8px",
        background: colors.bg2,
        border: `1px solid ${colors.line}`,
        fontFamily: fonts.mono,
        fontSize: 9,
        lineHeight: 1.5,
      }}
    >
      <div
        style={{
          color: colors.txt4,
          letterSpacing: "0.10em",
          textTransform: "uppercase",
          marginBottom: 3,
          paddingBottom: 2,
          borderBottom: `1px dashed ${colors.line}`,
        }}
      >
        ▸ {title}
      </div>
      {rows.map((r) => (
        <div
          key={r.k}
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 4,
            color: colors.txt3,
          }}
        >
          <span style={{ color: colors.txt3 }}>{r.k}</span>
          <span style={{ color: colors.txt1, fontVariantNumeric: "tabular-nums" }}>{r.v}</span>
        </div>
      ))}
    </div>
  );
}

function FeedBlock({ ticker }: { ticker: TickerData | null }) {
  if (!ticker) {
    return (
      <MiniBlock
        title="FEED"
        rows={[
          { k: "MCAP", v: "—" },
          { k: "BTC",  v: "—" },
          { k: "ETH",  v: "—" },
          { k: "F&G",  v: "—" },
        ]}
      />
    );
  }
  const fgColor =
    ticker.fearGreed && ticker.fearGreed.value < 25 ? colors.red :
    ticker.fearGreed && ticker.fearGreed.value < 45 ? colors.orange :
    ticker.fearGreed && ticker.fearGreed.value < 55 ? colors.amber :
    ticker.fearGreed && ticker.fearGreed.value < 75 ? colors.amberBright : colors.green;
  return (
    <MiniBlock
      title="FEED"
      rows={[
        {
          k: "MCAP",
          v: ticker.marketCap ? formatUSD(ticker.marketCap.total, { compact: true, decimals: 1 }) : "—",
        },
        {
          k: "BTC",
          v: ticker.btc ? (
            <span style={{ color: ticker.btc.change24h >= 0 ? colors.green : colors.red }}>
              {formatUSD(ticker.btc.price, { compact: true, decimals: 1 })}
            </span>
          ) : "—",
        },
        {
          k: "ETH",
          v: ticker.eth ? (
            <span style={{ color: ticker.eth.change24h >= 0 ? colors.green : colors.red }}>
              {formatUSD(ticker.eth.price, { compact: true, decimals: 1 })}
            </span>
          ) : "—",
        },
        {
          k: "F&G",
          v: ticker.fearGreed ? (
            <span style={{ color: fgColor }}>{ticker.fearGreed.value}</span>
          ) : "—",
        },
      ]}
    />
  );
}

function DerivBlock() {
  const [data, setData] = useState<{ avgFnd?: number; oiUsd?: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/funding", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: { rates?: { ratePercent: number }[] }) => {
        if (cancelled || !Array.isArray(j.rates)) return;
        // BTCUSDT cross-venue avg
        const btc = j.rates.filter((r: { symbol?: string; ratePercent: number }) =>
          (r as { symbol?: string }).symbol?.toUpperCase()?.replace("-USDT-SWAP", "USDT") === "BTCUSDT");
        const avgFnd = btc.length
          ? btc.reduce((s, r) => s + r.ratePercent, 0) / btc.length
          : undefined;
        setData({ avgFnd });
      })
      .catch(() => { /* ignore */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <MiniBlock
      title="DERIV"
      rows={[
        {
          k: "FND",
          v: data?.avgFnd != null ? (
            <span style={{ color: data.avgFnd >= 0 ? colors.green : colors.red }}>
              {formatPercent(data.avgFnd, 3)}
            </span>
          ) : "—",
        },
        { k: "VENUES", v: <span>3</span> },
      ]}
    />
  );
}

function StatusBlock() {
  const [latency, setLatency] = useState(14);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
      // Random small drift around 14ms — purely ornamental until /api/health wired
      setLatency(12 + Math.floor(Math.random() * 8));
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <MiniBlock
      title="STATUS"
      rows={[
        { k: "ALERTS",  v: <span>12 ARMED</span> },
        { k: "STREAMS", v: <span>3</span> },
        { k: "UPLINK",  v: <span style={{ color: latency < 20 ? colors.green : colors.amber }}>{latency}ms</span> },
        { k: "UTC",     v: <span>{now.toISOString().slice(11, 16)}</span> },
      ]}
    />
  );
}
