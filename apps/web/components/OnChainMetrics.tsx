"use client";

import { colors, fonts } from "@pulse/ui";
import type { OnChainMetrics as Metrics } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

export function OnChainMetricsPanel() {
  const { data, loading, error } = useFlow<Metrics>("/api/on-chain");

  const tiles: { label: string; value: string; sub?: string; tint?: string }[] = [
    {
      label: "Hashrate",
      value: data?.hashrateEhs != null ? `${data.hashrateEhs.toFixed(1)} EH/s` : "—",
      sub: "network compute",
      tint: colors.amber,
    },
    {
      label: "Difficulty",
      value: data?.difficultyT != null ? `${data.difficultyT.toFixed(1)} T` : "—",
      sub: "epoch · adjust /2016 blocks",
      tint: colors.cyan,
    },
    {
      label: "Mempool",
      value: data?.mempoolCount != null ? data.mempoolCount.toLocaleString() : "—",
      sub: "unconfirmed tx",
      tint: data?.mempoolCount != null && data.mempoolCount > 50_000 ? colors.red : colors.txt2,
    },
    {
      label: "Block Height",
      value: data?.blockHeight != null ? data.blockHeight.toLocaleString() : "—",
      sub: "latest block",
      tint: colors.green,
    },
    {
      label: "Active Addrs · 24h",
      value: data?.activeAddresses != null ? compactNum(data.activeAddresses) : "—",
      sub: "unique on-chain",
      tint: colors.amberBright,
    },
  ];

  if (error && !data) {
    return (
      <p style={{ padding: 14, fontSize: 11, color: colors.red, fontFamily: fonts.mono }}>
        DATA UNAVAILABLE — {error}
      </p>
    );
  }

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
        gap: 1,
        background: colors.line,
        height: "100%",
      }}
    >
      {tiles.map((t) => (
        <div
          key={t.label}
          style={{
            background: colors.bg1,
            padding: "10px 14px",
            display: "flex",
            flexDirection: "column",
            gap: 4,
            minHeight: 78,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 9,
              textTransform: "uppercase",
              letterSpacing: "0.10em",
              color: colors.txt3,
            }}
          >
            {t.label}
          </span>
          <span
            className="mono-num"
            style={{
              fontFamily: fonts.mono,
              fontSize: 18,
              fontWeight: 700,
              color: loading && !data ? colors.txt4 : (t.tint ?? colors.txt1),
              letterSpacing: "-0.01em",
              lineHeight: 1.1,
            }}
          >
            {t.value}
          </span>
          {t.sub && (
            <span
              style={{
                fontFamily: fonts.mono,
                fontSize: 9,
                color: colors.txt4,
                letterSpacing: "0.04em",
              }}
            >
              {t.sub}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function compactNum(n: number): string {
  if (n >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toString();
}
