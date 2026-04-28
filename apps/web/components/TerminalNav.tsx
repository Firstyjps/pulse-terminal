"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { colors, fonts } from "@pulse/ui";

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

/**
 * TerminalNav — 140px left rail with F-key shortcuts.
 * Routes via Next.js, supports F1–F7 keyboard navigation.
 */
export function TerminalNav() {
  const pathname = usePathname();
  const router = useRouter();

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
        </div>
      ))}

      <div style={{ flex: 1 }} />
      <div
        style={{
          padding: "8px 10px",
          fontSize: 9,
          color: colors.txt4,
          borderTop: `1px solid ${colors.line}`,
          lineHeight: 1.6,
        }}
      >
        <div>● UPLINK 14ms</div>
        <div>● 12 ALERTS ARMED</div>
        <div>● 3 STREAMS</div>
      </div>
    </nav>
  );
}
