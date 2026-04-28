import * as React from "react";
import { colors, fonts } from "./tokens";

export type SignalTone =
  | "up" | "down" | "amber" | "info" | "muted" | "btc" | "eth"
  // Bloomberg anomaly tags
  | "WHALE" | "LIQ" | "FLOW" | "OI" | "PUMP" | "NEWS";

export type SignalSize = "xs" | "sm";

export interface SignalPillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: SignalTone;
  size?: SignalSize;
  icon?: React.ReactNode;
  /** Subtle phosphor glow (HIGH severity / live emphasis) — kept for compat. */
  glow?: boolean;
}

const TONE: Record<SignalTone, { bg: string; fg: string; border: string }> = {
  up:    { bg: "rgba(25,210,122,0.12)", fg: colors.green,   border: colors.green2 },
  down:  { bg: "rgba(255,77,94,0.12)",  fg: colors.red,     border: colors.red2 },
  amber: { bg: "rgba(255,176,0,0.15)",  fg: colors.amber,   border: colors.amberDim },
  info:  { bg: "rgba(68,200,255,0.12)", fg: colors.cyan,    border: "#1e5a78" },
  muted: { bg: "rgba(125,138,153,0.12)",fg: colors.txt3,    border: colors.line2 },
  btc:   { bg: "rgba(255,176,0,0.12)",  fg: colors.btc,     border: colors.amberDim },
  eth:   { bg: "rgba(98,126,234,0.15)", fg: colors.eth,     border: "#3a4ba8" },

  // Anomaly feed tags — handoff exact
  WHALE: { bg: "rgba(255,176,0,0.15)",  fg: colors.amber,   border: colors.amberDim },
  LIQ:   { bg: "rgba(255,77,94,0.12)",  fg: colors.red,     border: colors.red2 },
  FLOW:  { bg: "rgba(68,200,255,0.12)", fg: colors.cyan,    border: "#1e5a78" },
  OI:    { bg: "rgba(255,92,243,0.10)", fg: colors.magenta, border: "#6e1d6a" },
  PUMP:  { bg: "rgba(25,210,122,0.12)", fg: colors.green,   border: colors.green2 },
  NEWS:  { bg: "rgba(125,138,153,0.12)",fg: colors.txt3,    border: colors.line2 },
};

/**
 * SignalPill — Bloomberg-style rectangular tag.
 * No rounded corners, capillary border, mono caps, tabular-nums.
 */
export const SignalPill = React.forwardRef<HTMLSpanElement, SignalPillProps>(function SignalPill(
  { tone = "muted", size = "sm", icon, glow, style, children, ...rest },
  ref,
) {
  const t = TONE[tone];
  const padding = size === "xs" ? "0 4px" : "1px 6px";
  const fontSize = size === "xs" ? 9 : 9.5;

  return (
    <span
      ref={ref}
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        padding,
        background: t.bg,
        color: t.fg,
        border: `1px solid ${t.border}`,
        fontSize,
        fontWeight: 500,
        fontFamily: fonts.mono,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        fontVariantNumeric: "tabular-nums",
        boxShadow: glow ? `0 0 8px -2px ${t.fg}66` : undefined,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {icon && <span style={{ display: "inline-flex" }}>{icon}</span>}
      {children}
    </span>
  );
});
