"use client";

import { useState } from "react";
import { colors, fonts, SignalPill } from "@pulse/ui";
import type { NewsItem, NewsFilter } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

const FILTERS: { id: NewsFilter; label: string }[] = [
  { id: "all",     label: "ALL" },
  { id: "BTC",     label: "BTC" },
  { id: "ETH",     label: "ETH" },
  { id: "hot",     label: "HOT" },
  { id: "bullish", label: "BULL" },
  { id: "bearish", label: "BEAR" },
];

interface NewsResp {
  filter: NewsFilter;
  items: NewsItem[];
  ts: number;
  error?: string;
}

export function NewsFeed() {
  const [filter, setFilter] = useState<NewsFilter>("all");
  const { data, loading, error } = useFlow<NewsResp>(`/api/news?filter=${filter}`, filter as unknown as number);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Filter strip */}
      <div
        style={{
          display: "flex",
          gap: 1,
          padding: "6px 8px",
          background: colors.bg1,
          borderBottom: `1px solid ${colors.line}`,
          flexShrink: 0,
        }}
      >
        {FILTERS.map((f) => {
          const active = filter === f.id;
          return (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              style={{
                background: active ? colors.bg2 : "transparent",
                border: `1px solid ${active ? colors.amberDim : colors.line2}`,
                color: active ? colors.amber : colors.txt3,
                padding: "3px 10px",
                fontFamily: fonts.mono,
                fontSize: 10,
                letterSpacing: "0.08em",
                cursor: "pointer",
                fontWeight: active ? 600 : 400,
              }}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {/* List */}
      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {loading && !data && (
          <p style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>Loading news…</p>
        )}
        {error && (
          <p style={{ padding: 14, fontSize: 11, color: colors.red, fontFamily: fonts.mono }}>
            DATA UNAVAILABLE — {error}
          </p>
        )}
        {data?.items?.length === 0 && (
          <p style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>No news.</p>
        )}
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data?.items?.map((it) => (
            <li
              key={it.id}
              onClick={() => window.open(it.url, "_blank", "noopener")}
              style={{
                display: "grid",
                gridTemplateColumns: "auto 1fr auto",
                gap: 10,
                padding: "8px 12px",
                borderBottom: `1px dashed ${colors.line}`,
                cursor: "pointer",
                fontFamily: fonts.mono,
                fontSize: 11.5,
                color: colors.txt2,
              }}
              onMouseEnter={(e) => { e.currentTarget.style.background = colors.bg2; }}
              onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ color: colors.txt4, fontSize: 10, whiteSpace: "nowrap", paddingTop: 2 }}>
                {timeAgo(it.publishedAt)}
              </span>
              <div style={{ minWidth: 0 }}>
                <div style={{ color: colors.txt1, lineHeight: 1.35 }}>
                  {it.title}
                </div>
                <div style={{ marginTop: 3, fontSize: 10, color: colors.txt3, display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
                  <span>{it.source}</span>
                  {it.tickers.slice(0, 5).map((t) => (
                    <SignalPill key={t} tone="FLOW" size="sm">{t}</SignalPill>
                  ))}
                  {it.vote && it.vote.important > 0 && (
                    <span style={{ color: colors.amber, fontWeight: 600 }}>★{it.vote.important}</span>
                  )}
                </div>
              </div>
              <span aria-hidden style={{ color: colors.txt4, fontSize: 12, paddingTop: 2 }}>↗</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
