"use client";

import { useLocale, useT } from "@pulse/i18n";
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
  const [locale, setLocale] = useLocale();
  const t = useT();

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
        {t("shell.ready")}
      </span>
      <span style={segStyle}><span className="dim">{t("shell.cmd")}</span> {cmd}</span>
      <span style={segStyle}><span className="dim">{t("shell.profile")}</span> {profile}</span>
      <span style={segStyle}>
        <span className="dim">{t("shell.latency")}</span>{" "}
        <span className="mono-num" style={{ color: colors.txt2 }}>{latencyMs}MS</span>
      </span>
      <span style={{ marginLeft: "auto", display: "flex", height: "100%" }}>
        <span style={segStyle}><span className="dim">F1</span> {t("shell.help")}</span>
        <span style={segStyle}><span className="dim">F8</span> {t("shell.hotkeys")}</span>
        <span style={segStyle}><span className="dim">⌘K</span> {t("shell.cmd_palette")}</span>
        <button
          type="button"
          onClick={() => setLocale(locale === "th" ? "en" : "th")}
          style={{
            ...segStyle,
            background: "transparent",
            border: "none",
            borderRight: `1px solid ${colors.line}`,
            color: colors.txt3,
            fontFamily: "inherit",
            fontSize: 9,
            letterSpacing: "0.08em",
            cursor: "pointer",
            textTransform: "uppercase",
          }}
          aria-label="Toggle language"
        >
          <span className="dim">{t("shell.lang")}</span> {locale}
        </button>
        <span style={{ ...segStyle, color: colors.amber, borderRight: "none" }}>
          © CRYPTOPULSE INTEL
        </span>
      </span>
    </div>
  );
}
