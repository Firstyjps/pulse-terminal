"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { colors, fonts } from "@pulse/ui";
import { useT } from "@pulse/i18n";
import type { DictKey } from "@pulse/i18n";

interface NavItem {
  id: string;
  /** i18n dict key for the visible label. */
  labelKey: DictKey;
  key: string;
  href: string;
}

const NAV: { sectionKey: DictKey; items: NavItem[] }[] = [
  {
    sectionKey: "nav.intel",
    items: [
      { id: "overview",  labelKey: "nav.overview",  key: "F1", href: "/" },
      { id: "markets",   labelKey: "nav.markets",   key: "F2", href: "/markets" },
      { id: "fundflow",  labelKey: "nav.fundflow",  key: "F3", href: "/fundflow" },
    ],
  },
  {
    sectionKey: "nav.trading",
    items: [
      { id: "derivatives", labelKey: "nav.derivatives", key: "F4", href: "/derivatives" },
      { id: "options",     labelKey: "nav.options",     key: "F5", href: "/options" },
      { id: "backtest",    labelKey: "nav.backtest",    key: "F6", href: "/backtest" },
      { id: "dual-assets", labelKey: "nav.dual_assets", key: "F8", href: "/dual-assets" },
    ],
  },
  {
    sectionKey: "nav.system",
    items: [
      { id: "settings", labelKey: "nav.settings", key: "F7", href: "/settings" },
    ],
  },
];

const KEY_TO_HREF = NAV.flatMap((g) => g.items).reduce<Record<string, string>>(
  (acc, it) => ((acc[it.key] = it.href), acc),
  {},
);

/**
 * TerminalNav — 140px left rail with F-key shortcuts + STATUS block.
 *
 *   ─ INTEL ─                ─ TRADING ─               ─ SYSTEM ─
 *   F1 Overview              F4 Derivatives            F6 Alerts
 *   F2 Markets               F5 Backtest               F7 Settings
 *   F3 Fundflow                                        ┌─ STATUS ────┐
 *                                                      │ ALERTS  12  │
 *                                                      │ STREAMS  3  │
 *                                                      │ UPLINK 14ms │
 *                                                      └─────────────┘
 *
 * FEED + DERIV mini-blocks were removed per user request 2026-04-28
 * (top-of-page TerminalTicker covers the same data).
 */
export function TerminalNav() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

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
        <div key={group.sectionKey}>
          <div
            style={{
              padding: "8px 10px 4px",
              color: colors.txt4,
              fontSize: 9,
              borderTop: gi === 0 ? "none" : `1px solid ${colors.line}`,
            }}
          >
            — {t(group.sectionKey)} —
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
                <span>{t(it.labelKey)}</span>
              </button>
            );
          })}

          {/* SYSTEM keeps its STATUS block; FEED + DERIV blocks removed per user request 2026-04-28. */}
          {group.sectionKey === "nav.system" && <StatusBlock />}
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
        <div><span style={{ color: colors.green }}>●</span> {t("status.socket_live")}</div>
        <div><span style={{ color: colors.amber }}>●</span> {t("status.mcp_ready")}</div>
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

function StatusBlock() {
  const t = useT();
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
      title={t("status.title")}
      rows={[
        { k: t("status.alerts"),  v: <span>12 {t("status.armed")}</span> },
        { k: t("status.streams"), v: <span>3</span> },
        { k: t("status.uplink"),  v: <span style={{ color: latency < 20 ? colors.green : colors.amber }}>{latency}ms</span> },
        { k: "UTC",     v: <span>{now.toISOString().slice(11, 16)}</span> },
      ]}
    />
  );
}
