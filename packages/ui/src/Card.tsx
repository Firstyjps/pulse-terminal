import * as React from "react";
import { colors, gradients, glows, radii } from "./tokens";

export type CardAccent = "none" | "purple" | "cyan" | "gold" | "btc" | "eth" | "green" | "red";

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  accent?: CardAccent;
  padded?: boolean;
  glow?: boolean;
  /** Adds a CSS-only translateY hover lift. */
  hoverLift?: boolean;
}

const accentColor: Record<CardAccent, string> = {
  none: "transparent",
  purple: colors.accent,
  cyan: colors.accent2,
  gold: colors.gold,
  btc: colors.btc,
  eth: colors.eth,
  green: colors.green,
  red: colors.red,
};

const HOVER_LIFT_CLASS = "pulse-ui-card-hover-lift";

const HOVER_CSS = `
.${HOVER_LIFT_CLASS}{transition:transform .25s ease, border-color .25s ease;}
.${HOVER_LIFT_CLASS}:hover{transform:translateY(-3px);border-color:${colors.line2}!important;}
`;

let injected = false;
function injectHoverStyles() {
  if (injected || typeof document === "undefined") return;
  injected = true;
  const style = document.createElement("style");
  style.setAttribute("data-pulse-ui", "card-hover");
  style.textContent = HOVER_CSS;
  document.head.appendChild(style);
}

export const Card = React.forwardRef<HTMLDivElement, CardProps>(function Card(
  { accent = "none", padded = true, glow = false, hoverLift = false, style, className, children, ...rest },
  ref
) {
  // Inject hover styles once on the client. Server-render: skipped (no document).
  if (hoverLift) injectHoverStyles();

  const baseStyle: React.CSSProperties = {
    position: "relative",
    background: colors.bg2,
    border: `1px solid ${colors.line}`,
    borderRadius: radii.lg,
    padding: padded ? 24 : 0,
    overflow: "hidden",
    boxShadow: glows.card,
    transition: "transform .25s ease, border-color .25s ease",
    ...style,
  };

  const showAccentGlow = glow && accent !== "none";
  const composedClass = [hoverLift ? HOVER_LIFT_CLASS : "", className].filter(Boolean).join(" ") || undefined;

  return (
    <div ref={ref} {...rest} className={composedClass} style={baseStyle}>
      {showAccentGlow && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: -30,
            top: -30,
            width: 130,
            height: 130,
            borderRadius: "50%",
            filter: "blur(40px)",
            opacity: 0.4,
            pointerEvents: "none",
            background: accentColor[accent],
          }}
        />
      )}
      <span
        aria-hidden
        style={{
          position: "absolute",
          inset: 0,
          background: gradients.card,
          pointerEvents: "none",
        }}
      />
      <div style={{ position: "relative", zIndex: 1 }}>{children}</div>
    </div>
  );
});
