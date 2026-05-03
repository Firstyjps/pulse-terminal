"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { colors, fonts } from "@pulse/ui";

interface TabDef {
  id: string;
  label: string;
  glyph: string;
  href: string;
  fkey: string;
}

const TABS: TabDef[] = [
  { id: "overview",    label: "OVERVIEW", glyph: "◆", href: "/",            fkey: "F1"  },
  { id: "morning",     label: "MORNING",  glyph: "☀", href: "/morning",     fkey: "F11" },
  { id: "markets",     label: "MARKETS",  glyph: "▦", href: "/markets",     fkey: "F2"  },
  { id: "intel",       label: "INTEL",    glyph: "ℹ", href: "/intel",       fkey: "F4"  },
  { id: "derivatives", label: "DERIV",    glyph: "Ξ", href: "/derivatives", fkey: "F6"  },
  { id: "options",     label: "OPTIONS",  glyph: "Σ", href: "/options",     fkey: "F7"  },
  { id: "settings",    label: "SETTINGS", glyph: "⚙", href: "/settings",    fkey: "F10" },
];

/**
 * BottomTabNav — fixed-bottom 56px tab bar for mobile (< 768px,
 * Tailwind `md:` lower bound aligned in Phase 0).
 *
 * Replaces the 140px left rail when the viewport is too narrow.
 * Each tap-target is 56×≥56px (exceeds the 44px iOS HIG minimum).
 */
export function BottomTabNav() {
  const pathname = usePathname();
  const router = useRouter();

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
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
