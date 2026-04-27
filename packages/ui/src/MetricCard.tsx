import * as React from "react";
import { Card, type CardAccent } from "./Card";
import { Pill, type PillTone } from "./Pill";
import { colors, fonts } from "./tokens";

export interface MetricCardProps {
  label: string;
  value: React.ReactNode;
  delta?: { value: string; tone: PillTone };
  meta?: React.ReactNode;
  accent?: CardAccent;
  icon?: React.ReactNode;
  spark?: React.ReactNode;
  footer?: React.ReactNode;
  minHeight?: number | string;
  style?: React.CSSProperties;
}

export function MetricCard({
  label,
  value,
  delta,
  meta,
  accent = "none",
  icon,
  spark,
  footer,
  minHeight = 200,
  style,
}: MetricCardProps) {
  return (
    <Card
      accent={accent}
      glow
      hoverLift
      style={{ minHeight, ...style }}
    >
      {(icon || label) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          {icon}
          <span
            style={{
              fontSize: 11,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: colors.txt3,
              fontWeight: 600,
            }}
          >
            {label}
          </span>
        </div>
      )}
      <div
        style={{
          fontSize: 38,
          fontWeight: 800,
          letterSpacing: "-0.03em",
          fontFeatureSettings: '"tnum"',
          lineHeight: 1,
          fontFamily: fonts.display,
        }}
      >
        {value}
      </div>
      {(delta || meta) && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14, fontSize: 13 }}>
          {delta && <Pill tone={delta.tone}>{delta.value}</Pill>}
          {meta && <span style={{ color: colors.txt2, fontSize: 12 }}>{meta}</span>}
        </div>
      )}
      {footer && <div style={{ marginTop: 14 }}>{footer}</div>}
      {spark && (
        <div
          aria-hidden
          style={{
            position: "absolute",
            right: 0,
            bottom: 0,
            left: 0,
            height: 60,
            pointerEvents: "none",
          }}
        >
          {spark}
        </div>
      )}
    </Card>
  );
}
