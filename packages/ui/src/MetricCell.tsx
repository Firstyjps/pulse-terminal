"use client";

import * as React from "react";
import { colors, fonts } from "./tokens";
import { MonoNum } from "./MonoNum";
import { SignalPill, type SignalTone } from "./SignalPill";

export interface MetricCellProps {
  /** Top-left label — usually a Bilingual node. */
  label: React.ReactNode;
  /** Pre-formatted display value. */
  value: React.ReactNode;
  /** Numeric backing for tick-flash. Pass undefined while loading. */
  numeric?: number | null;
  /** Pre-formatted delta string (e.g. "+2.34%"). */
  deltaText?: string;
  /** Direction tone — drives delta pill color and number flash direction. */
  deltaTone?: SignalTone;
  /** Right-edge sparkbar / sparkline / icon. */
  spark?: React.ReactNode;
  /** Optional bottom meta (e.g. "24h"). */
  meta?: React.ReactNode;
  /** Click handler — when set, the cell becomes interactive (hot tier on hover). */
  onClick?: () => void;
  /** Tier — 1 (panel surface, default) or 2 (cell on darker substrate). */
  tier?: 1 | 2;
  style?: React.CSSProperties;
}

/**
 * MetricCell — single info cell. ~92px tall, dense info-per-pixel.
 *
 *  ╭──────────────────────────────────╮
 *  │ LABEL                       META │
 *  │ 99,999.99      ▁▂▄▆█  +2.34%     │
 *  ╰──────────────────────────────────╯
 */
export function MetricCell({
  label,
  value,
  numeric,
  deltaText,
  deltaTone = "muted",
  spark,
  meta,
  onClick,
  tier = 1,
  style,
}: MetricCellProps) {
  const [hover, setHover] = React.useState(false);
  const interactive = !!onClick;

  const baseBg = tier === 2 ? colors.bg3 : colors.bg2;
  const hotBg = colors.bg4;
  const baseBorder = tier === 2 ? colors.line2 : colors.line;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        position: "relative",
        background: hover && interactive ? hotBg : baseBg,
        border: `1px solid ${hover && interactive ? "rgba(65,255,139,0.30)" : baseBorder}`,
        borderRadius: 3,
        padding: "12px 14px 11px",
        cursor: interactive ? "pointer" : "default",
        transition: "background .14s ease, border-color .14s ease",
        boxShadow: hover && interactive
          ? "0 0 0 1px rgba(65,255,139,0.22), 0 8px 24px -10px rgba(65,255,139,0.18)"
          : "0 1px 0 rgba(255,255,255,0.04) inset",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        minHeight: 108,
        ...style,
      }}
    >
      {/* header row */}
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8 }}>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 11,
            fontWeight: 700,
            letterSpacing: "0.10em",
            textTransform: "uppercase",
            color: colors.txt2,
          }}
        >
          {label}
        </span>
        {meta && (
          <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.txt4, letterSpacing: "0.06em" }}>{meta}</span>
        )}
      </div>

      {/* value row */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 12, flex: 1 }}>
        <MonoNum value={numeric ?? null} size={28} weight={700} style={{ color: colors.txt1, lineHeight: 1, letterSpacing: "-0.025em" }}>
          {value}
        </MonoNum>
        {spark && <div style={{ flex: "0 0 auto", opacity: 0.9 }}>{spark}</div>}
      </div>

      {/* delta row */}
      {deltaText && (
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <SignalPill tone={deltaTone} size="sm">{deltaText}</SignalPill>
        </div>
      )}
    </div>
  );
}
