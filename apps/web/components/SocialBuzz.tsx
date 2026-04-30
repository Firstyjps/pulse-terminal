"use client";

import { colors, fonts } from "@pulse/ui";
import type { SocialBuzzResponse } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

export function SocialBuzz() {
  const { data, loading, error } = useFlow<SocialBuzzResponse>("/api/social");

  if (error && !data) {
    return (
      <p style={{ padding: 14, fontSize: 11, color: colors.red, fontFamily: fonts.mono }}>
        DATA UNAVAILABLE — {error}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "6px 12px",
          borderBottom: `1px solid ${colors.line}`,
          fontFamily: fonts.mono,
          fontSize: 10,
          color: colors.txt3,
          letterSpacing: "0.06em",
          flexShrink: 0,
        }}
      >
        <span>
          {data?.path === "coingecko-trending" ? "COINGECKO TRENDING" : "REDDIT"}
          {" · "}{data?.scanned ?? 0} {data?.path === "coingecko-trending" ? "COINS" : "POSTS"}
        </span>
        <span>
          {data?.path === "coingecko-trending" ? "TREND-WEIGHTED" : "SCORE = UPVOTES × ln(COMMENTS+1)"}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {loading && !data && (
          <p style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>Scanning Reddit…</p>
        )}
        {data && data.top.length === 0 && (
          <p style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
            No ticker mentions detected in current hot posts.
          </p>
        )}
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontFamily: fonts.mono,
            fontSize: 11.5,
          }}
        >
          <thead>
            <tr style={{ textAlign: "left", color: colors.txt3, textTransform: "uppercase", letterSpacing: "0.08em", fontSize: 9 }}>
              <th style={th}>#</th>
              <th style={th}>Ticker</th>
              <th style={{ ...th, textAlign: "right" }}>Mentions</th>
              <th style={{ ...th, textAlign: "right" }}>Score</th>
              <th style={th}>Top Post</th>
            </tr>
          </thead>
          <tbody>
            {data?.top.map((m, i) => (
              <tr
                key={m.ticker}
                onClick={() => window.open(m.topPostUrl, "_blank", "noopener")}
                style={{
                  borderBottom: `1px dashed ${colors.line}`,
                  cursor: "pointer",
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg2; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                <td style={{ ...td, color: colors.txt4, width: 28 }}>{i + 1}</td>
                <td style={{ ...td, color: colors.amber, fontWeight: 700 }}>{m.ticker}</td>
                <td style={{ ...td, textAlign: "right", color: colors.txt2 }}>{m.mentions}</td>
                <td style={{ ...td, textAlign: "right", color: colors.green, fontWeight: 600 }}>
                  {compactNum(m.score)}
                </td>
                <td
                  style={{ ...td, color: colors.txt2, maxWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                  title={m.topPostTitle}
                >
                  {m.topPostTitle}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "6px 10px",
  borderBottom: `1px solid ${colors.line}`,
  background: colors.bg1,
  position: "sticky",
  top: 0,
  fontWeight: 500,
};
const td: React.CSSProperties = {
  padding: "5px 10px",
  whiteSpace: "nowrap",
  fontVariantNumeric: "tabular-nums",
};

function compactNum(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}
