"use client";

import * as React from "react";
import { colors, fonts } from "./tokens";

export interface StatBlockProps {
  /** Top label — uppercase 9px mono mid-color (11px on mobile). */
  label: React.ReactNode;
  /** Big number value — 18px mono fg-1 (22px on mobile). */
  value: React.ReactNode;
  /** Optional inline delta (e.g. "+2.34%"). Color via `deltaColor`. */
  delta?: React.ReactNode;
  /** Hex/var color for delta text. Defaults to `--mid`. */
  deltaColor?: string;
  /** Sub line (e.g. "24h Δ"). */
  sub?: React.ReactNode;
  /** Optional click handler — adds hover affordance. */
  onClick?: () => void;
  /**
   * Phone-comfortable scaling. Bumps label/value/delta/sub sizes ~2-4px and
   * widens padding so each tile reads cleanly at the full panel width on a
   * 390px viewport (used by `MetricStrip` mobile single-column layout).
   */
  mobile?: boolean;
}

/**
 * StatBlock — single tile in the Market Pulse / KPI strip.
 *
 *   ┌────────────────────────────┐
 *   │ TOTAL MARKET CAP        9px mid │
 *   │ $2.64T                  18px fg-1 │
 *   │ +1.23%                  10px green/red │
 *   │ 24h Δ                   10px mid │
 *   └────────────────────────────┘
 *
 * `mobile` prop scales each line up by 2-4px and bumps padding to 12/14 so
 * the tile reads at arm's length on a phone.
 */
export function StatBlock({ label, value, delta, deltaColor, sub, onClick, mobile }: StatBlockProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.bg1,
        padding: mobile ? "12px 14px" : "8px 10px",
        cursor: interactive ? "pointer" : "default",
        transition: "background 0.12s ease",
        minHeight: 0,
      }}
      onMouseEnter={interactive ? (e) => (e.currentTarget.style.background = colors.bg2) : undefined}
      onMouseLeave={interactive ? (e) => (e.currentTarget.style.background = colors.bg1) : undefined}
    >
      <div
        style={{
          fontFamily: fonts.mono,
          fontSize: mobile ? 11 : 9,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          color: colors.txt3,
          fontWeight: 400,
        }}
      >
        {label}
      </div>
      <div
        className="mono-num"
        style={{
          fontFamily: fonts.mono,
          fontSize: mobile ? 22 : 18,
          fontWeight: 500,
          color: colors.txt1,
          marginTop: mobile ? 4 : 3,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {delta != null && (
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: mobile ? 12 : 10,
            marginTop: mobile ? 3 : 2,
            color: deltaColor ?? colors.txt3,
          }}
        >
          {delta}
        </div>
      )}
      {sub != null && (
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: mobile ? 11 : 10,
            marginTop: mobile ? 3 : 2,
            color: colors.txt3,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
