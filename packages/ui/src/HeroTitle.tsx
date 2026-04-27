import * as React from "react";
import { colors, fonts, gradients } from "./tokens";

export interface HeroTitleProps {
  /** First word — rendered with the purple→cyan gradient. */
  primary: string;
  /** Second word — solid foreground. */
  secondary?: string;
  /** Optional terminal dot (e.g. "."). */
  dot?: string;
  subtitle?: React.ReactNode;
  meta?: React.ReactNode;
  style?: React.CSSProperties;
}

export function HeroTitle({
  primary,
  secondary,
  dot = ".",
  subtitle,
  meta,
  style,
}: HeroTitleProps) {
  return (
    <header style={{ position: "relative", ...style }}>
      <h1
        style={{
          fontFamily: fonts.display,
          fontSize: "clamp(54px, 9vw, 132px)",
          fontWeight: 700,
          lineHeight: 0.92,
          letterSpacing: "-0.04em",
          margin: 0,
        }}
      >
        <span
          style={{
            background: gradients.purple,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            color: "transparent",
          }}
        >
          {primary}
        </span>
        {secondary && (
          <>
            <br />
            <span style={{ color: colors.txt1 }}>{secondary}</span>
            <span style={{ color: colors.accent2 }}>{dot}</span>
          </>
        )}
      </h1>
      {subtitle && (
        <p
          style={{
            marginTop: 20,
            fontSize: 18,
            color: colors.txt2,
            maxWidth: 680,
            lineHeight: 1.55,
            fontWeight: 300,
          }}
        >
          {subtitle}
        </p>
      )}
      {meta && (
        <div
          style={{
            display: "flex",
            gap: 14,
            marginTop: 36,
            flexWrap: "wrap",
          }}
        >
          {meta}
        </div>
      )}
    </header>
  );
}
