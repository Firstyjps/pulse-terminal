"use client";

import { colors, fonts } from "@pulse/ui";
import type { HealthStatus } from "../lib/use-terminal-telemetry";

/**
 * TerminalBotBar — bottom 22px status row.
 */
export function TerminalBotBar({
  cmd = ":overview",
  profile = "MACRO·DEFAULT",
  latencyMs,
  healthStatus = "checking",
}: {
  cmd?: string;
  profile?: string;
  latencyMs?: number | null;
  healthStatus?: HealthStatus;
}) {
  const segStyle: React.CSSProperties = {
    padding: "0 10px",
    height: "100%",
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRight: `1px solid ${colors.line}`,
  };

  return (
    <div
      style={{
        background: colors.bg1,
        borderTop: `1px solid ${colors.line}`,
        display: "flex",
        alignItems: "center",
        fontFamily: fonts.mono,
        fontSize: 9,
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: colors.txt3,
        height: 22,
      }}
    >
      <span style={segStyle}>
        <span className={`live-dot ${healthDotClass(healthStatus)}`} />
        {healthLabel(healthStatus)}
      </span>
      <span style={segStyle}><span className="dim">CMD</span> {cmd}</span>
      <span style={segStyle}><span className="dim">PROFILE</span> {profile}</span>
      <span style={segStyle}>
        <span className="dim">LATENCY</span>{" "}
        <span className="mono-num" style={{ color: latencyTone(latencyMs) }}>{latencyMs == null ? "--" : `${latencyMs}MS`}</span>
      </span>
      <span style={{ marginLeft: "auto", display: "flex", height: "100%" }}>
        <span style={segStyle}><span className="dim">F1–F10</span> Tabs</span>
        <span style={segStyle}><span className="dim">⌘K</span> CMD Palette</span>
        <span style={{ ...segStyle, color: colors.amber, borderRight: "none" }}>
          © CRYPTOPULSE INTEL
        </span>
      </span>
    </div>
  );
}

function healthLabel(status: HealthStatus): string {
  if (status === "healthy") return "HEALTHY";
  if (status === "degraded") return "DEGRADED";
  if (status === "unhealthy") return "UNHEALTHY";
  if (status === "offline") return "OFFLINE";
  return "CHECKING";
}

function healthDotClass(status: HealthStatus): string {
  if (status === "healthy") return "";
  if (status === "degraded" || status === "checking") return "amber";
  return "red";
}

function latencyTone(latency?: number | null): string {
  if (latency == null) return colors.txt4;
  if (latency < 250) return colors.green;
  if (latency < 1000) return colors.amber;
  return colors.red;
}
