"use client";

import { colors, fonts } from "@pulse/ui";

/**
 * TerminalBotBar — bottom 22px status row.
 * "● READY · CMD :overview · PROFILE Macro·Default · LATENCY 14ms"
 */
export function TerminalBotBar({
  cmd = ":overview",
  profile = "MACRO·DEFAULT",
  latencyMs = 14,
}: {
  cmd?: string;
  profile?: string;
  latencyMs?: number;
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
        <span className="live-dot" />
        READY
      </span>
      <span style={segStyle}><span className="dim">CMD</span> {cmd}</span>
      <span style={segStyle}><span className="dim">PROFILE</span> {profile}</span>
      <span style={segStyle}>
        <span className="dim">LATENCY</span>{" "}
        <span className="mono-num" style={{ color: colors.txt2 }}>{latencyMs}MS</span>
      </span>
      <span style={{ marginLeft: "auto", display: "flex", height: "100%" }}>
        <span style={segStyle}><span className="dim">F1</span> Help</span>
        <span style={segStyle}><span className="dim">F8</span> Hotkeys</span>
        <span style={segStyle}><span className="dim">⌘K</span> CMD Palette</span>
        <span style={{ ...segStyle, color: colors.amber, borderRight: "none" }}>
          © CRYPTOPULSE INTEL
        </span>
      </span>
    </div>
  );
}
