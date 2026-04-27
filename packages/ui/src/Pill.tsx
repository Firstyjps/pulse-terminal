import * as React from "react";
import { colors, fonts, radii } from "./tokens";

export type PillTone = "up" | "down" | "flat" | "gold" | "purple" | "cyan" | "btc" | "eth";
export type PillSize = "sm" | "md";

export interface PillProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: PillTone;
  size?: PillSize;
  mono?: boolean;
}

const toneStyle: Record<PillTone, { bg: string; fg: string }> = {
  up: { bg: "rgba(52,211,153,0.12)", fg: colors.green },
  down: { bg: "rgba(248,113,113,0.12)", fg: colors.red },
  flat: { bg: "rgba(156,163,175,0.10)", fg: colors.txt2 },
  gold: { bg: "rgba(251,191,36,0.12)", fg: colors.gold },
  purple: { bg: "rgba(124,92,255,0.15)", fg: "#a78bfa" },
  cyan: { bg: "rgba(34,211,238,0.15)", fg: colors.accent2 },
  btc: { bg: "rgba(247,147,26,0.12)", fg: colors.btc },
  eth: { bg: "rgba(98,126,234,0.15)", fg: colors.eth },
};

export const Pill = React.forwardRef<HTMLSpanElement, PillProps>(function Pill(
  { tone = "flat", size = "sm", mono = true, style, children, ...rest },
  ref
) {
  const t = toneStyle[tone];
  const padding = size === "sm" ? "4px 9px" : "6px 12px";
  const fontSize = size === "sm" ? 12 : 13;
  return (
    <span
      ref={ref}
      {...rest}
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding,
        borderRadius: radii.sm,
        background: t.bg,
        color: t.fg,
        fontSize,
        fontWeight: 600,
        fontFeatureSettings: '"tnum"',
        fontFamily: mono ? fonts.mono : fonts.body,
        letterSpacing: "0.02em",
        ...style,
      }}
    >
      {children}
    </span>
  );
});
