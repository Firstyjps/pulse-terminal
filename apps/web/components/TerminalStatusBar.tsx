"use client";

import { useEffect, useState } from "react";
import { colors, fonts } from "@pulse/ui";
import { fmtTimeICT, fmtTimeShortICT, fmtDateICT } from "../lib/time";

type FeedStatus = "connecting" | "live" | "stale" | "offline";

interface Props {
  feedStatus?: FeedStatus;
  version?: string;
  user?: string;
  desk?: string;
  /** Mobile-style: drop VER/USR/DESK + DATE/SESS, keep brand + feed dot + UTC. */
  compact?: boolean;
}

const FEED_LABEL_LONG: Record<FeedStatus, string> = {
  live: "FEED LIVE",
  stale: "FEED STALE",
  offline: "FEED OFFLINE",
  connecting: "CONNECTING…",
};

const FEED_LABEL_SHORT: Record<FeedStatus, string> = {
  live: "LIVE",
  stale: "STALE",
  offline: "OFFLINE",
  connecting: "CONNECTING…",
};

/**
 * TerminalStatusBar — top 22px status row.
 *
 * Desktop layout (full):
 *   ◆ CRYPTOPULSE · VER · USR · DESK | (right) feed dot · ICT · DATE · SESS
 *
 * Mobile / `compact` layout:
 *   ◆ CRYPTOPULSE | feed dot · ICT HH:MM
 */
export function TerminalStatusBar({
  feedStatus = "live",
  version = "4.12.0",
  user = "ANALYST",
  desk = "MACRO·INTEL",
  compact = false,
}: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

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
        ◆ CRYPTOPULSE
      </span>

      {!compact && <span style={segStyle}><span className="dim">VER</span> {version}</span>}
      {!compact && <span style={segStyle}><span className="dim">USR</span> {user}</span>}
      {!compact && <span style={segStyle}><span className="dim">DESK</span> {desk}</span>}

      <span style={{ marginLeft: "auto", display: "flex", height: "100%" }}>
        <span style={segStyle}>
          <span className={`live-dot ${dotClass}`} />
          <span>{compact ? FEED_LABEL_SHORT[feedStatus] : FEED_LABEL_LONG[feedStatus]}</span>
        </span>
        <span style={segStyle}>
          <span className="dim">ICT</span>{" "}
          <span className="mono-num">{compact ? fmtTimeShortICT(now) : fmtTimeICT(now)}</span>
        </span>
        {!compact && <span style={segStyle}><span className="dim">DATE</span> <span className="mono-num">{fmtDateICT(now)}</span></span>}
        {!compact && (
          <span style={{ ...segStyle, borderRight: "none" }}>
            <span className="dim">SESS</span> US·EU OVERLAP
          </span>
        )}
      </span>
    </div>
  );
}
