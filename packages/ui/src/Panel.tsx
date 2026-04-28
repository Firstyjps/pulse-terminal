"use client";

import * as React from "react";
import { colors, fonts } from "./tokens";

export interface PanelProps extends Omit<React.HTMLAttributes<HTMLDivElement>, "title"> {
  /** Header title — rendered with leading `▸ ` amber glyph + uppercase. */
  title?: React.ReactNode;
  /** Right of title — secondary metadata badge (e.g. "GLOBAL", "20 ASSETS"). */
  badge?: React.ReactNode;
  /** Right-edge action area (segmented controls, search inputs). */
  actions?: React.ReactNode;
  /** Remove inner padding (for tables / charts that fill edge-to-edge). */
  flush?: boolean;
  /** 12-col grid span. Maps to `grid-column: span N`. */
  span?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12;
  /** Body scroll behavior. Default: hidden (use within a fixed-height row). */
  scrollable?: boolean;
}

/**
 * Panel — Bloomberg/CryptoPulse panel primitive.
 *
 * Layout: 22px header bar (▸ TITLE + badge + right slot) + body that fills.
 * Style: `--bg-1` body, `--bg-2` header, 1px `--line` borders, sharp 0 corners.
 */
export const Panel = React.forwardRef<HTMLDivElement, PanelProps>(function Panel(
  { title, badge, actions, children, flush, span, scrollable = true, style, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      {...rest}
      className={className}
      style={{
        display: "flex",
        flexDirection: "column",
        background: colors.bg1,
        minHeight: 0,
        minWidth: 0,
        overflow: "hidden",
        gridColumn: span ? `span ${span}` : undefined,
        ...style,
      }}
    >
      {(title || badge || actions) && (
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "4px 8px",
            height: 22,
            background: colors.bg2,
            borderBottom: `1px solid ${colors.line}`,
            fontFamily: fonts.mono,
            fontSize: 9,
            textTransform: "uppercase",
            letterSpacing: "0.10em",
            color: colors.txt3,
            flexShrink: 0,
          }}
        >
          {title && (
            <span
              style={{
                color: colors.amber,
                fontWeight: 600,
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <span style={{ opacity: 0.85 }}>▸</span>
              {title}
            </span>
          )}
          {badge && (
            <span
              style={{
                padding: "0 5px",
                background: colors.bg3,
                color: colors.txt3,
                border: `1px solid ${colors.line2}`,
                fontSize: 9,
                fontWeight: 500,
              }}
            >
              {badge}
            </span>
          )}
          {actions && (
            <span style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
              {actions}
            </span>
          )}
        </header>
      )}
      <div
        style={{
          flex: 1,
          minHeight: 0,
          overflow: scrollable ? "auto" : "hidden",
          padding: flush ? 0 : 8,
        }}
      >
        {children}
      </div>
    </div>
  );
});
