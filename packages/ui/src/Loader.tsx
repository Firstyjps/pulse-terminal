import * as React from "react";
import { colors, fonts, gradients } from "./tokens";

export interface LoaderProps {
  /** Headline shown above the bar. */
  title?: string;
  /** Mono status line shown below the bar. */
  status?: string;
  /** 0-100. If `undefined`, an indeterminate animation runs. */
  progress?: number;
  /** Hide the loader (fade out). */
  hidden?: boolean;
  style?: React.CSSProperties;
}

const indeterminateKeyframes = `@keyframes pulseUiLoaderIndeterminate {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(400%); }
}`;

export function Loader({
  title = "PULSE COMMAND",
  status = "— initializing terminal",
  progress,
  hidden = false,
  style,
}: LoaderProps) {
  const indeterminate = progress === undefined;
  const pct = Math.max(0, Math.min(100, progress ?? 0));

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        background: colors.bg0,
        display: "grid",
        placeItems: "center",
        transition: "opacity .6s ease, visibility .6s ease",
        opacity: hidden ? 0 : 1,
        visibility: hidden ? "hidden" : "visible",
        pointerEvents: hidden ? "none" : "auto",
        ...style,
      }}
    >
      <style>{indeterminateKeyframes}</style>
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontSize: 14,
            letterSpacing: "0.4em",
            color: colors.txt2,
            fontWeight: 600,
          }}
        >
          {title}
        </div>
        <div
          style={{
            width: 280,
            height: 2,
            background: colors.bg3,
            margin: "24px auto 12px",
            overflow: "hidden",
            position: "relative",
          }}
        >
          <div
            style={{
              height: "100%",
              background: gradients.purple,
              width: indeterminate ? "30%" : `${pct}%`,
              transition: indeterminate ? undefined : "width .15s linear",
              animation: indeterminate
                ? "pulseUiLoaderIndeterminate 1.4s ease-in-out infinite"
                : undefined,
            }}
          />
        </div>
        <div
          style={{
            fontSize: 11,
            color: colors.txt3,
            fontFamily: fonts.mono,
          }}
        >
          {status}
        </div>
      </div>
    </div>
  );
}
