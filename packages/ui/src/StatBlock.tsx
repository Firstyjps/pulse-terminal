"use client";

import * as React from "react";
import { colors, fonts } from "./tokens";

export interface StatBlockProps {
  /** Top label — uppercase 9px mono mid-color. */
  label: React.ReactNode;
  /** Big number value — 18px mono fg-1. */
  value: React.ReactNode;
  /** Optional inline delta (e.g. "+2.34%"). Color via `deltaColor`. */
  delta?: React.ReactNode;
  /** Hex/var color for delta text. Defaults to `--mid`. */
  deltaColor?: string;
  /** Sub line (e.g. "24h Δ"). */
  sub?: React.ReactNode;
  /** Optional click handler — adds hover affordance. */
  onClick?: () => void;
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
 */
export function StatBlock({ label, value, delta, deltaColor, sub, onClick }: StatBlockProps) {
  const interactive = !!onClick;
  return (
    <div
      onClick={onClick}
      style={{
        background: colors.bg1,
        padding: "8px 10px",
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
          fontSize: 9,
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
          fontSize: 18,
          fontWeight: 500,
          color: colors.txt1,
          marginTop: 3,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>
      {delta != null && (
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 10,
            marginTop: 2,
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
            fontSize: 10,
            marginTop: 2,
            color: colors.txt3,
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
