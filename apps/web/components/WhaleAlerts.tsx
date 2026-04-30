"use client";

import { useEffect, useRef, useState } from "react";
import { colors, fonts } from "@pulse/ui";
import { formatUSD } from "@pulse/sources";
import type { WhaleAlertsResponse } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";
import { useSettings } from "../lib/use-settings";

const SEEN_KEY = "pulse.whale.seen";
const POLL_KEY = "pulse-whale-poll";

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(s: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    // Cap to 500 most recent — older hashes won't re-appear in mempool.
    const arr = [...s].slice(-500);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch { /* ignore */ }
}

export function WhaleAlerts() {
  const { settings } = useSettings();
  const threshold = settings.whaleThresholdUsd ?? 1_000_000;

  // Polling tick — refetch every 60s without remounting the panel.
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data, loading, error } = useFlow<WhaleAlertsResponse>(
    `/api/whale-alerts?threshold=${threshold}`,
    tick,
  );

  // Track which hashes we've shown a flash for. New tx since last tick → flash.
  const seenRef = useRef<Set<string>>(new Set());
  const [freshHashes, setFreshHashes] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (seenRef.current.size === 0) seenRef.current = loadSeen();
  }, []);

  useEffect(() => {
    if (!data?.alerts) return;
    const fresh = new Set<string>();
    for (const a of data.alerts) {
      if (!seenRef.current.has(a.hash)) {
        fresh.add(a.hash);
        seenRef.current.add(a.hash);
      }
    }
    if (fresh.size > 0) {
      setFreshHashes(fresh);
      saveSeen(seenRef.current);
      // Clear flash after 8s
      const t = setTimeout(() => setFreshHashes(new Set()), 8000);
      return () => clearTimeout(t);
    }
  }, [data]);

  const newCount = freshHashes.size;
  const total = data?.alerts.length ?? 0;

  if (error && !data) {
    return (
      <p style={{ padding: 14, fontSize: 11, color: colors.red, fontFamily: fonts.mono }}>
        DATA UNAVAILABLE — {error}
      </p>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", minHeight: 0 }}>
      {/* Sub-header: badge with new-tx count + threshold + scanned */}
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
          THRESHOLD <span style={{ color: colors.amber, fontWeight: 600 }}>${(threshold / 1e6).toFixed(2)}M</span>
          {" · "}SCANNED <span style={{ color: colors.txt2 }}>{data?.scanned ?? 0}</span>
        </span>
        <span>
          {total} HITS
          {newCount > 0 && (
            <span style={{ marginLeft: 8, color: colors.green, fontWeight: 600 }} className="blink">
              ● +{newCount} NEW
            </span>
          )}
        </span>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: "auto" }}>
        {loading && !data && (
          <p style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>Scanning mempool…</p>
        )}
        {data && data.alerts.length === 0 && (
          <p style={{ padding: 14, fontSize: 11, color: colors.txt3, fontFamily: fonts.mono }}>
            No whale tx above ${(threshold / 1e6).toFixed(2)}M in current mempool.
          </p>
        )}
        <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {data?.alerts.map((a) => {
            const fresh = freshHashes.has(a.hash);
            return (
              <li
                key={a.hash}
                onClick={() => window.open(`https://blockchain.com/btc/tx/${a.hash}`, "_blank", "noopener")}
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto auto",
                  gap: 10,
                  padding: "8px 12px",
                  borderBottom: `1px dashed ${colors.line}`,
                  cursor: "pointer",
                  fontFamily: fonts.mono,
                  fontSize: 11.5,
                  color: colors.txt2,
                  background: fresh ? `${colors.green}14` : "transparent",
                  borderLeft: fresh ? `2px solid ${colors.green}` : "2px solid transparent",
                  transition: "background 0.5s ease, border-left-color 0.5s ease",
                }}
                onMouseEnter={(e) => { if (!fresh) e.currentTarget.style.background = colors.bg2; }}
                onMouseLeave={(e) => { if (!fresh) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ color: colors.txt4, fontSize: 10, whiteSpace: "nowrap" }}>
                  {timeAgo(a.ts)}
                </span>
                <span className="mono-num" style={{ color: colors.amber, fontWeight: 600 }}>
                  {a.amountBtc.toFixed(4)} BTC
                </span>
                <span className="mono-num" style={{ color: colors.txt1, fontWeight: 700 }}>
                  {formatUSD(a.amountUsd, { compact: a.amountUsd >= 1_000_000, decimals: 0 })}
                </span>
                <span style={{ color: colors.txt4, fontSize: 10 }}>
                  {a.inputs}→{a.outputs}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}

function timeAgo(ms: number): string {
  const diff = Date.now() - ms;
  const s = Math.max(1, Math.floor(diff / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
