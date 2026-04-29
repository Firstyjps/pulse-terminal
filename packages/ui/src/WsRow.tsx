import * as React from "react";
import { colors } from "./tokens";

export type WsRowHeight = "stats" | "chart" | "table" | "feed" | "auto";

export interface WsRowProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Row height preset per handoff. `stats` 96px min, `chart` 360, `table` 340, `feed` 320. */
  height?: WsRowHeight;
}

const HEIGHT_MAP: Record<Exclude<WsRowHeight, "auto">, React.CSSProperties> = {
  // 116px gives each StatBlock its full 4-line layout (label + value + delta + sub)
  // without a vertical scroll — was 96 which clipped the sub line.
  stats: { minHeight: 116 },
  chart: { height: 360 },
  table: { height: 340 },
  feed: { height: 320 },
};

/**
 * WsRow — 12-col grid container, the workspace's vertical building block.
 *
 *   .workspace = vertical flex of these
 *   .ws-row    = 12-col grid, 1px gap (line color shows through)
 *
 * Children should be `<Panel span={N}>` where N spans the 12 columns.
 *
 * Mobile collapse: globals.css overrides `.ws-row` at < 720px to single-column
 * with auto height (each panel becomes a stacked card). This keeps fixed-height
 * desktop rows intact while letting children breathe on phones.
 */
export function WsRow({ height = "auto", style, children, className, ...rest }: WsRowProps) {
  const heightStyle = height === "auto" ? {} : HEIGHT_MAP[height];
  return (
    <div
      {...rest}
      className={["ws-row", `ws-row--${height}`, className].filter(Boolean).join(" ")}
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap: 1,
        background: colors.line,
        ...heightStyle,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/**
 * Workspace — vertical flex of WsRow's, separated by 1px lines (line color
 * showing through gaps). The handoff calls this the workspace container.
 */
export function Workspace({ style, children, className, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...rest}
      className={["workspace", className].filter(Boolean).join(" ")}
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 1,
        padding: 1,
        background: colors.line,
        overflow: "auto",
        height: "100%",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
