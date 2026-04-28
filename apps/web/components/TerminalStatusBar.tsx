"use client";

import { useEffect, useState } from "react";
import { colors, fonts } from "@pulse/ui";

type FeedStatus = "connecting" | "live" | "stale" | "offline";

function fmtTime(d: Date) { return d.toISOString().slice(11, 19); }
function fmtDate(d: Date) { return d.toISOString().slice(0, 10).replace(/-/g, "·"); }

interface Props {
  feedStatus?: FeedStatus;
  version?: string;
  user?: string;
  desk?: string;
}

/**
 * TerminalStatusBar — top 22px status row.
 * Layout: brand pill (amber bg, black text) · VER · USR · DESK | (right) feed dot · UTC · DATE · SESS
 */
export function TerminalStatusBar({
  feedStatus = "live",
  version = "4.12.0",
  user = "ANALYST",
  desk = "MACRO·INTEL",
}: Props) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const feedLabel =
    feedStatus === "live" ? "FEED LIVE" :
    feedStatus === "stale" ? "FEED STALE" :
    feedStatus === "offline" ? "FEED OFFLINE" : "CONNECTING…";
  const dotClass = feedStatus === "live" ? "" : feedStatus === "stale" ? "amber" : "red";

  const segStyle: React.CSSProperties = {
    padding: "0 10px",
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
        fontSize: 10,
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
          padding: "0 12px",
          letterSpacing: "0.14em",
        }}
      >
        ◆ CRYPTOPULSE
      </span>
      <span style={segStyle}><span className="dim">VER</span> {version}</span>
      <span style={segStyle}><span className="dim">USR</span> {user}</span>
      <span style={segStyle}><span className="dim">DESK</span> {desk}</span>

      <span style={{ marginLeft: "auto", display: "flex", height: "100%" }}>
        <span style={segStyle}>
          <span className={`live-dot ${dotClass}`} />
          <span>{feedLabel}</span>
        </span>
        <span style={segStyle}><span className="dim">UTC</span> <span className="mono-num">{fmtTime(now)}</span></span>
        <span style={segStyle}><span className="dim">DATE</span> <span className="mono-num">{fmtDate(now)}</span></span>
        <span style={{ ...segStyle, borderRight: "none" }}>
          <span className="dim">SESS</span> US·EU OVERLAP
        </span>
      </span>
    </div>
  );
}
