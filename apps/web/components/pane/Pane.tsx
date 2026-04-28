"use client";

import * as React from "react";

interface PaneProps {
  title?: React.ReactNode;
  /** Compact subtitle / status badge after title */
  meta?: React.ReactNode;
  /** Right-side action area (buttons, toggles) */
  actions?: React.ReactNode;
  children: React.ReactNode;
  /** Remove inner padding (for tables/charts that fill edge-to-edge) */
  flush?: boolean;
  /** Make body scrollable when content overflows */
  scrollable?: boolean;
  style?: React.CSSProperties;
}

/**
 * Pro multi-pane primitive — TradingView/Bloomberg style:
 *  - Compact header (title left, actions right)
 *  - Subtle border, no glassmorphism (saves GPU on dense layouts)
 *  - Body fills remaining height
 */
export function Pane({ title, meta, actions, children, flush, scrollable, style }: PaneProps) {
  return (
    <div style={{
      height: "100%",
      display: "flex",
      flexDirection: "column",
      background: "rgba(13,17,29,0.55)",
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 8,
      overflow: "hidden",
      ...style,
    }}>
      {(title || actions || meta) && (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          padding: "8px 12px",
          background: "rgba(20,25,39,0.5)",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          minHeight: 34,
          flex: "0 0 auto",
        }}>
          {title && (
            <span style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#9ca3af",
              fontWeight: 600,
            }}>
              {title}
            </span>
          )}
          {meta && (
            <span style={{
              fontSize: 11,
              color: "#6b7280",
              fontFamily: "JetBrains Mono, monospace",
              fontVariantNumeric: "tabular-nums",
            }}>
              {meta}
            </span>
          )}
          {actions && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
              {actions}
            </div>
          )}
        </div>
      )}
      <div style={{
        flex: 1,
        minHeight: 0,
        overflow: scrollable !== false ? "auto" : "hidden",
        padding: flush ? 0 : 12,
      }}>
        {children}
      </div>
    </div>
  );
}
