"use client";

import { useEffect, useState } from "react";
import { colors, fonts } from "@pulse/ui";
import { useT } from "@pulse/i18n";

type FeedStatus = "connecting" | "live" | "stale" | "offline";

function fmtTime(d: Date) { return d.toISOString().slice(11, 19); }
function fmtTimeShort(d: Date) { return d.toISOString().slice(11, 16); }
function fmtDate(d: Date) { return d.toISOString().slice(0, 10).replace(/-/g, "·"); }

interface Props {
  feedStatus?: FeedStatus;
  version?: string;
  user?: string;
  desk?: string;
  /** Mobile-style: drop VER/USR/DESK + DATE/SESS, keep brand + feed dot + UTC. */
  compact?: boolean;
}

/**
 * TerminalStatusBar — top 22px status row.
 *
 * Desktop layout (full):
 *   ◆ CRYPTOPULSE · VER · USR · DESK | (right) feed dot · UTC · DATE · SESS
 *
 * Mobile / `compact` layout:
 *   ◆ CRYPTOPULSE | feed dot · UTC HH:MM
 */
export function TerminalStatusBar({
  feedStatus = "live",
  version = "4.12.0",
  user = "ANALYST",
  desk = "MACRO·INTEL",
  compact = false,
}: Props) {
  const t = useT();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const feedLabelLong =
    feedStatus === "live" ? t("shell.feed_live") :
    feedStatus === "stale" ? t("shell.feed_stale") :
    feedStatus === "offline" ? t("shell.feed_offline") :
    t("shell.feed_connecting");
  // For compact mode strip the "FEED " prefix where present (works in both langs)
  const feedLabel = feedLabelLong.replace(/^FEED\s+/i, "").replace(/^ฟีด/, "");
  const dotClass = feedStatus === "live" ? "" : feedStatus === "stale" ? "amber" : "red";

  const segStyle: React.CSSProperties = {
    padding: compact ? "0 8px" : "0 10px",
    height: "100%",
    display: "flex",
    alignItems: "center",
    gap: 6,
    borderRight: `1px solid ${colors.line}`,
    color: colors.txt3,
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 0,
        background: colors.bg1,
        borderBottom: `1px solid ${colors.line}`,
        fontFamily: fonts.mono,
        fontSize: compact ? 9 : 10,
        textTransform: "uppercase",
        letterSpacing: "0.06em",
        height: 22,
      }}
    >
      <span
        style={{
          ...segStyle,
          background: colors.amber,
          color: "#000",
          fontWeight: 700,
          padding: compact ? "0 8px" : "0 12px",
          letterSpacing: compact ? "0.10em" : "0.14em",
        }}
      >
        ◆ {compact ? "CRYPTOPULSE" : "CRYPTOPULSE"}
      </span>

      {!compact && <span style={segStyle}><span className="dim">VER</span> {version}</span>}
      {!compact && <span style={segStyle}><span className="dim">USR</span> {user}</span>}
      {!compact && <span style={segStyle}><span className="dim">DESK</span> {desk}</span>}

      <span style={{ marginLeft: "auto", display: "flex", height: "100%" }}>
        <span style={segStyle}>
          <span className={`live-dot ${dotClass}`} />
          <span>{compact ? feedLabel : feedLabelLong}</span>
        </span>
        <span style={segStyle}>
          <span className="dim">UTC</span>{" "}
          <span className="mono-num">{compact ? fmtTimeShort(now) : fmtTime(now)}</span>
        </span>
        {!compact && <span style={segStyle}><span className="dim">DATE</span> <span className="mono-num">{fmtDate(now)}</span></span>}
        {!compact && (
          <span style={{ ...segStyle, borderRight: "none" }}>
            <span className="dim">{t("shell.session")}</span> {t("shell.session_us_eu")}
          </span>
        )}
      </span>
    </div>
  );
}
