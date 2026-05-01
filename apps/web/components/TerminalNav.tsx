"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { colors, fonts } from "@pulse/ui";
import { fmtDateICT, fmtTimeShortICT } from "../lib/time";

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
      { id: "overview",  label: "OVERVIEW",  key: "F1",  href: "/" },
      { id: "markets",   label: "MARKETS",   key: "F2",  href: "/markets" },
      { id: "fundflow",  label: "FUNDFLOW",  key: "F3",  href: "/fundflow" },
      { id: "intel",     label: "INTEL",     key: "F4",  href: "/intel" },
      { id: "history",   label: "HISTORY",   key: "F5",  href: "/history" },
      { id: "morning",   label: "MORNING",   key: "F11", href: "/morning" },
    ],
  },
  {
    section: "TRADING",
    items: [
      { id: "derivatives", label: "DERIVATIVES", key: "F6", href: "/derivatives" },
      { id: "options",     label: "OPTIONS",     key: "F7", href: "/options" },
      { id: "backtest",    label: "BACKTEST",    key: "F8", href: "/backtest" },
      { id: "dual-assets", label: "DUAL ASSETS", key: "F9", href: "/dual-assets" },
    ],
  },
  {
    section: "SYSTEM",
    items: [
      { id: "settings", label: "SETTINGS", key: "F10", href: "/settings" },
    ],
  },
];

const KEY_TO_HREF = NAV.flatMap((g) => g.items).reduce<Record<string, string>>(
  (acc, it) => ((acc[it.key] = it.href), acc),
  {},
);

/**
 * TerminalNav — 140px left rail with F-key shortcuts + STATUS block.
 */
export function TerminalNav() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let chordPrefix: string | null = null;
    let chordTimer: number | null = null;

    const isTypingTarget = (t: EventTarget | null) => {
      const el = t as HTMLElement | null;
      if (!el) return false;
      const tag = el.tagName;
      return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable;
    };

    const clearChord = () => {
      chordPrefix = null;
      if (chordTimer != null) {
        window.clearTimeout(chordTimer);
        chordTimer = null;
      }
    };

    const onKey = (e: KeyboardEvent) => {
      // F-key shortcuts (always intercept, even in inputs — they're not text keys)
      if (KEY_TO_HREF[e.key]) {
        e.preventDefault();
        router.push(KEY_TO_HREF[e.key]);
        return;
      }

      // Chord shortcuts (skip when typing, skip with modifiers)
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;

      if (chordPrefix === "g" && e.key === "m") {
        e.preventDefault();
        clearChord();
        router.push("/morning");
        return;
      }

      if (e.key === "g") {
        chordPrefix = "g";
        if (chordTimer != null) window.clearTimeout(chordTimer);
        chordTimer = window.setTimeout(clearChord, 1000);
        return;
      }

      if (chordPrefix) clearChord();
    };

    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (chordTimer != null) window.clearTimeout(chordTimer);
    };
  }, [router]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      style={{
        width: 172,
        background: colors.bg1,
        borderRight: `1px solid ${colors.line}`,
        display: "flex",
        flexDirection: "column",
        fontFamily: fonts.mono,
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        height: "100%",
        minHeight: 0,
        overflow: "auto",
      }}
    >
      {NAV.map((group, gi) => (
        <div key={group.section}>
          <div
            style={{
              padding: "12px 14px 6px",
              color: colors.txt4,
              fontSize: 10,
              letterSpacing: "0.10em",
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
                  gap: 10,
                  padding: "9px 14px",
                  width: "100%",
                  background: active ? colors.bg2 : "transparent",
                  color: active ? colors.amber : colors.txt3,
                  border: "none",
                  borderLeft: `3px solid ${active ? colors.amber : "transparent"}`,
                  cursor: "pointer",
                  textAlign: "left",
                  fontFamily: "inherit",
                  fontSize: 12,
                  fontWeight: active ? 700 : 500,
                  letterSpacing: "0.06em",
                  textTransform: "uppercase",
                  userSelect: "none",
                  minHeight: 36,
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
                    width: 22,
                    color: active ? colors.amber : colors.txt4,
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.04em",
                  }}
                >
                  {it.key}
                </span>
                <span>{it.label}</span>
              </button>
            );
          })}

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
        <div><span style={{ color: colors.txt3 }}>●</span> {fmtDateICT(new Date())}</div>
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

function StatusBlock() {
  const [latency, setLatency] = useState(14);
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(new Date());
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
        { k: "ICT",     v: <span>{fmtTimeShortICT(now)}</span> },
      ]}
    />
  );
}
