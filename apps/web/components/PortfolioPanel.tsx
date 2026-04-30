"use client";

import { MonoNum, SignalPill, colors, fonts } from "@pulse/ui";
import { formatUSD } from "@pulse/sources";
import type { PortfolioBalance, PortfolioSource } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";
import { EmptyState } from "./EmptyState";
import { SkeletonRows } from "./Skeleton";

interface SourceSnapshot {
  source: PortfolioSource;
  totalUsd: number;
  balances: PortfolioBalance[];
  ts: number;
}

interface ApiResp {
  configured: boolean;
  message?: string;
  sources?: SourceSnapshot[];
  totalUsd?: number;
  status?: Array<{ source: PortfolioSource; configured: boolean; error?: string }>;
  ts?: number;
}

const ASSET_COLOR: Record<string, string> = {
  BTC: colors.btc,
  ETH: colors.eth,
  USDT: colors.green,
  USDC: colors.accent2,
  BNB: colors.gold,
  SOL: "#9b6dff",
  XRP: "#9aa3b3",
  DOGE: "#cba135",
};

const SOURCE_COLOR: Record<PortfolioSource, string> = {
  binance: colors.gold,
  bybit:   "#ff9c2b",
  okx:     "#22d3ee",
};

const SOURCE_LABEL: Record<PortfolioSource, string> = {
  binance: "BINANCE",
  bybit:   "BYBIT",
  okx:     "OKX",
};

function colorFor(asset: string): string {
  if (ASSET_COLOR[asset]) return ASSET_COLOR[asset];
  let h = 0;
  for (let i = 0; i < asset.length; i++) h = (h * 31 + asset.charCodeAt(i)) | 0;
  const palette = [colors.accent, colors.accent2, colors.gold, colors.eth, colors.btc, "#9b6dff"];
  return palette[Math.abs(h) % palette.length];
}

interface AggregatedBalance {
  asset: string;
  total: number;
  locked: number;
  usdValue: number;
  /** Per-source breakdown for hover/tooltip */
  bySource: Array<{ source: PortfolioSource; total: number; usd: number }>;
}

/**
 * Merge `balances` across sources keyed by asset. USD values sum directly;
 * unit `total` sums by asset symbol (BTC across all CEX → one row).
 */
function aggregate(sources: SourceSnapshot[]): AggregatedBalance[] {
  const map = new Map<string, AggregatedBalance>();
  for (const s of sources) {
    for (const b of s.balances) {
      const usd = b.usdValue ?? 0;
      if (usd <= 0) continue;
      const cur = map.get(b.asset) ?? {
        asset: b.asset,
        total: 0,
        locked: 0,
        usdValue: 0,
        bySource: [],
      };
      cur.total += b.total;
      cur.locked += b.locked;
      cur.usdValue += usd;
      cur.bySource.push({ source: s.source, total: b.total, usd });
      map.set(b.asset, cur);
    }
  }
  return [...map.values()].sort((a, b) => b.usdValue - a.usdValue);
}

/**
 * PortfolioPanel — multi-source CEX holdings overview.
 *
 * - Big total at top
 * - Per-source share strip (BINANCE / BYBIT / OKX)
 * - Top-N holdings as horizontal bars (length = USD share, qty across all sources)
 */
export function PortfolioPanel() {
  const { data, loading } = useFlow<ApiResp>("/api/portfolio");

  if (loading && !data) {
    return <SkeletonRows rows={5} />;
  }

  if (data && !data.configured) {
    return (
      <EmptyState
        icon="🔐"
        title="Portfolio not configured"
        body={
          <>
            Set CEX API keys in <code>.env.local</code>:
            <br />
            <code style={{ color: colors.accent }}>BINANCE_API_KEY</code> + <code>BINANCE_API_SECRET</code>
            <br />
            <code style={{ color: colors.accent }}>BYBIT_API_KEY</code> + <code>BYBIT_API_SECRET</code>
            <br />
            <code style={{ color: colors.accent }}>OKX_API_KEY</code> + <code>OKX_API_SECRET</code> + <code>OKX_API_PASSPHRASE</code>
            <br />
            <br />
            <strong style={{ color: colors.gold }}>Important:</strong> use <strong>read-only</strong> keys (disable
            Trading + Withdrawal in each console). See{" "}
            <a href="/SECURITY.md" style={{ color: colors.accent2 }}>
              SECURITY.md
            </a>
            .
          </>
        }
        action={<SignalPill tone="muted">OPT-IN FEATURE</SignalPill>}
      />
    );
  }

  if (!data?.configured || !data.sources) return null;

  const total = data.totalUsd ?? 0;
  const aggregated = aggregate(data.sources);
  const top = aggregated.slice(0, 8);
  const other = aggregated.slice(8);
  const otherUsd = other.reduce((s, b) => s + b.usdValue, 0);

  const sourceLabel = data.sources.map((s) => SOURCE_LABEL[s.source]).join(" · ");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, height: "100%" }}>
      {/* Total */}
      <div
        style={{
          padding: "14px 16px",
          background: colors.bg3,
          border: `1px solid ${colors.line2}`,
          borderRadius: 3,
          boxShadow: "0 1px 0 rgba(255,255,255,0.05) inset",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <span
          aria-hidden
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(135deg, rgba(65,255,139,0.06) 0%, transparent 60%)",
            pointerEvents: "none",
          }}
        />
        <div
          style={{
            position: "relative",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "baseline",
            marginBottom: 6,
          }}
        >
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.10em",
              color: colors.txt2,
              textTransform: "uppercase",
            }}
          >
            TOTAL EQUITY
          </span>
          <span style={{ fontFamily: fonts.mono, fontSize: 10, color: colors.txt3, letterSpacing: "0.06em" }}>
            {sourceLabel}
          </span>
        </div>
        <MonoNum
          value={total}
          size={34}
          weight={800}
          style={{ color: colors.txt1, letterSpacing: "-0.025em", lineHeight: 1.05 }}
        >
          {formatUSD(total, { compact: false, decimals: 2 })}
        </MonoNum>
        <div style={{ marginTop: 8, fontFamily: fonts.mono, fontSize: 11, color: colors.txt3, letterSpacing: "0.06em", fontWeight: 600 }}>
          {aggregated.length} ASSETS · {data.sources.length} SOURCE{data.sources.length === 1 ? "" : "S"}
        </div>

        {/* Per-source share strip */}
        {data.sources.length > 1 && (
          <div
            style={{
              position: "relative",
              marginTop: 10,
              display: "flex",
              height: 6,
              borderRadius: 1,
              overflow: "hidden",
              border: `1px solid ${colors.line}`,
            }}
          >
            {data.sources.map((s) => {
              const share = total > 0 ? (s.totalUsd / total) * 100 : 0;
              return (
                <div
                  key={s.source}
                  title={`${SOURCE_LABEL[s.source]} ${formatUSD(s.totalUsd, { compact: true })} (${share.toFixed(1)}%)`}
                  style={{
                    width: `${share}%`,
                    background: SOURCE_COLOR[s.source],
                    opacity: 0.85,
                  }}
                />
              );
            })}
          </div>
        )}
        {data.sources.length > 1 && (
          <div
            style={{
              position: "relative",
              marginTop: 6,
              display: "flex",
              gap: 12,
              fontFamily: fonts.mono,
              fontSize: 10,
              color: colors.txt3,
              letterSpacing: "0.06em",
              flexWrap: "wrap",
            }}
          >
            {data.sources.map((s) => {
              const share = total > 0 ? (s.totalUsd / total) * 100 : 0;
              return (
                <span key={s.source} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <span
                    aria-hidden
                    style={{
                      width: 8,
                      height: 8,
                      background: SOURCE_COLOR[s.source],
                      borderRadius: 1,
                    }}
                  />
                  <span style={{ color: colors.txt2, fontWeight: 700 }}>{SOURCE_LABEL[s.source]}</span>
                  <span>{formatUSD(s.totalUsd, { compact: true })}</span>
                  <span style={{ color: colors.txt4 }}>· {share.toFixed(1)}%</span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Holdings bars */}
      <div style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1, minHeight: 0, overflow: "auto" }}>
        {top.map((b) => {
          const pct = total > 0 ? (b.usdValue / total) * 100 : 0;
          return (
            <HoldingBar
              key={b.asset}
              asset={b.asset}
              usd={b.usdValue}
              pct={pct}
              qty={b.total}
              locked={b.locked}
              bySource={b.bySource}
            />
          );
        })}
        {otherUsd > 0 && (
          <HoldingBar
            asset="OTHER"
            usd={otherUsd}
            pct={(otherUsd / total) * 100}
            qty={null}
            locked={null}
            bySource={[]}
            muted
          />
        )}
      </div>
    </div>
  );
}

function HoldingBar({
  asset,
  usd,
  pct,
  qty,
  locked,
  bySource,
  muted,
}: {
  asset: string;
  usd: number;
  pct: number;
  qty: number | null;
  locked: number | null;
  bySource: Array<{ source: PortfolioSource; total: number; usd: number }>;
  muted?: boolean;
}) {
  const color = muted ? colors.txt4 : colorFor(asset);
  const hover = bySource.length > 1
    ? bySource.map((s) => `${SOURCE_LABEL[s.source]} ${formatUSD(s.usd, { compact: true })}`).join(" · ")
    : undefined;
  return (
    <div
      title={hover}
      style={{
        position: "relative",
        background: colors.bg2,
        border: `1px solid ${colors.line}`,
        borderRadius: 2,
        padding: "10px 12px",
        overflow: "hidden",
      }}
    >
      <span
        aria-hidden
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: `${pct}%`,
          background: muted
            ? "rgba(255,255,255,0.03)"
            : `linear-gradient(90deg, ${color}30 0%, ${color}12 100%)`,
          borderRight: `1px solid ${color}44`,
          transition: "width .35s ease",
        }}
      />
      <div
        style={{
          position: "relative",
          display: "grid",
          gridTemplateColumns: "auto 1fr auto auto",
          gap: 12,
          alignItems: "center",
          fontFamily: fonts.mono,
          fontSize: 12.5,
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 1,
            background: color,
            boxShadow: muted ? undefined : `0 0 8px ${color}88`,
          }}
        />
        <span style={{ fontWeight: 800, color: muted ? colors.txt3 : colors.txt1, letterSpacing: "0.02em" }}>
          {asset}
          {qty !== null && (
            <span style={{ marginLeft: 10, fontWeight: 500, color: colors.txt3, fontSize: 11 }}>
              {qty < 1 ? qty.toFixed(6) : qty.toFixed(qty < 100 ? 4 : 2)}
              {locked && locked > 0 && (
                <span style={{ marginLeft: 6, color: colors.gold }}>
                  · {locked.toFixed(qty < 100 ? 4 : 2)} locked
                </span>
              )}
              {bySource.length > 1 && (
                <span style={{ marginLeft: 6, color: colors.txt4 }}>
                  · {bySource.length} sources
                </span>
              )}
            </span>
          )}
        </span>
        <span style={{ color: colors.txt1, fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
          {formatUSD(usd, { compact: usd >= 100_000, decimals: usd >= 10_000 ? 0 : 2 })}
        </span>
        <span
          style={{
            color: colors.txt2,
            fontVariantNumeric: "tabular-nums",
            minWidth: 50,
            textAlign: "right",
            fontSize: 11.5,
            fontWeight: 600,
          }}
        >
          {pct.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}
