import * as React from "react";
import { colors, fonts, withAlpha } from "@pulse/ui";

export type Regime = "risk-on" | "risk-off" | "range";

export interface RegimeChipProps {
  regime: Regime;
  reason: string;
  /** Pre-formatted timestamp shown as a "· asOf" suffix. Caller controls formatting. */
  asOf?: string;
  /** Reason is truncated past this many characters with an ellipsis. Default 80. */
  maxReasonLength?: number;
}

const META: Record<Regime, { label: string; color: string }> = {
  "risk-on": { label: "RISK-ON", color: colors.green },
  "risk-off": { label: "RISK-OFF", color: colors.red },
  range: { label: "RANGE", color: colors.amber },
};

/**
 * Single horizontal pill encoding the current market regime + reason. Color
 * (green/red/amber) reinforces the text label so the regime is also legible
 * to color-blind readers. Designed for the Morning Brief header strip.
 */
export function RegimeChip({
  regime,
  reason,
  asOf,
  maxReasonLength = 80,
}: RegimeChipProps) {
  const meta = META[regime];
  const truncated =
    reason.length > maxReasonLength
      ? reason.slice(0, maxReasonLength - 1).trimEnd() + "…"
      : reason;

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        fontFamily: fonts.mono,
        fontSize: 11,
        color: colors.txt2,
        maxWidth: "100%",
      }}
    >
      <span
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px",
          background: withAlpha(meta.color, 0.12),
          color: meta.color,
          border: `1px solid ${withAlpha(meta.color, 0.5)}`,
          letterSpacing: "0.08em",
          fontWeight: 600,
          fontSize: 10,
          whiteSpace: "nowrap",
        }}
      >
        <span
          style={{
            width: 6,
            height: 6,
            background: meta.color,
            display: "inline-block",
          }}
          aria-hidden
        />
        {meta.label}
      </span>
      <span
        style={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          minWidth: 0,
        }}
        title={reason}
      >
        {truncated}
      </span>
      {asOf && (
        <span
          style={{
            color: colors.txt4,
            fontSize: 10,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          · {asOf}
        </span>
      )}
    </div>
  );
}
