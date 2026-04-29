"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { colors, fonts } from "@pulse/ui";
import { useT } from "@pulse/i18n";
import type { DictKey } from "@pulse/i18n";

interface TabDef {
  id: string;
  /** i18n key for the on-screen label. */
  labelKey: DictKey;
  glyph: string;
  href: string;
  fkey: string;
}

const TABS: TabDef[] = [
  { id: "overview",    labelKey: "nav.overview",    glyph: "◆", href: "/",            fkey: "F1" },
  { id: "markets",     labelKey: "nav.markets",     glyph: "▦", href: "/markets",     fkey: "F2" },
  { id: "fundflow",    labelKey: "nav.flow_short",  glyph: "≈", href: "/fundflow",    fkey: "F3" },
  { id: "derivatives", labelKey: "nav.deriv_short", glyph: "Ξ", href: "/derivatives", fkey: "F4" },
  { id: "options",     labelKey: "nav.options",     glyph: "Σ", href: "/options",     fkey: "F5" },
  { id: "settings",    labelKey: "nav.settings",    glyph: "⚙", href: "/settings",    fkey: "F7" },
];

/**
 * BottomTabNav — fixed-bottom 56px tab bar for mobile (< 720px).
 *
 * Replaces the 140px left rail when the viewport is too narrow.
 * Each tap-target is 56×≥56px (exceeds the 44px iOS HIG minimum).
 * F-key keyboard nav still works because it's wired up here too —
 * keeps parity with desktop TerminalNav.
 */
export function BottomTabNav() {
  const pathname = usePathname();
  const router = useRouter();
  const t = useT();

  useEffect(() => {
    const map: Record<string, string> = {};
    for (const tab of TABS) map[tab.fkey] = tab.href;
    const onKey = (e: KeyboardEvent) => {
      if (map[e.key]) {
        e.preventDefault();
        router.push(map[e.key]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav
      role="tablist"
      aria-label="Primary"
      style={{
        background: colors.bg1,
        borderTop: `1px solid ${colors.line}`,
        display: "grid",
        gridTemplateColumns: `repeat(${TABS.length}, 1fr)`,
        height: 56,
        fontFamily: fonts.mono,
      }}
    >
      {TABS.map((tab) => {
        const active = isActive(tab.href);
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            aria-current={active ? "page" : undefined}
            onClick={() => router.push(tab.href)}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 2,
              minHeight: 44,
              minWidth: 44,
              padding: "6px 4px",
              background: active ? colors.bg2 : "transparent",
              borderTop: `2px solid ${active ? colors.amber : "transparent"}`,
              borderLeft: "none",
              borderRight: "none",
              borderBottom: "none",
              color: active ? colors.amber : colors.txt3,
              cursor: "pointer",
              userSelect: "none",
              WebkitTapHighlightColor: "transparent",
            }}
          >
            <span
              aria-hidden
              style={{
                fontSize: 16,
                lineHeight: 1,
                color: active ? colors.amber : colors.txt3,
              }}
            >
              {tab.glyph}
            </span>
            <span
              style={{
                fontSize: 9,
                fontWeight: active ? 600 : 400,
                letterSpacing: "0.06em",
              }}
            >
              {t(tab.labelKey)}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
