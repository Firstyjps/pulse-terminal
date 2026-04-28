"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MonoNum, colors, fonts } from "@pulse/ui";
import { formatUSD, formatPercent } from "@pulse/sources";

interface TickerData {
  btc: { price: number; change24h: number } | null;
  eth: { price: number; change24h: number } | null;
  fearGreed: { value: number; classification: string } | null;
  marketCap: { total: number; change24h: number } | null;
  portfolio: { totalUsd: number } | null;
  ts: number;
}

const POLL_MS = 30_000;

const Cell = ({
  label,
  numeric,
  display,
  delta,
}: {
  label: string;
  numeric?: number | null;
  display: React.ReactNode;
  delta?: number;
}) => (
  <div
    style={{
      display: "inline-flex",
      alignItems: "baseline",
      gap: 10,
      padding: "0 16px",
      borderRight: `1px solid ${colors.line}`,
      whiteSpace: "nowrap",
      height: 36,
      lineHeight: "36px",
    }}
  >
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 11,
        letterSpacing: "0.10em",
        color: colors.txt2,
        textTransform: "uppercase",
        fontWeight: 700,
      }}
    >
      {label}
    </span>
    <MonoNum value={numeric ?? null} size={14} weight={700} style={{ color: colors.txt1, letterSpacing: "-0.01em" }}>
      {display}
    </MonoNum>
    {delta !== undefined && Number.isFinite(delta) && (
      <span
        style={{
          fontFamily: fonts.mono,
          fontSize: 12,
          fontWeight: 700,
          color: delta >= 0 ? colors.green : colors.red,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatPercent(delta)}
      </span>
    )}
  </div>
);

const fgTone = (v: number) => {
  if (v >= 75) return colors.green;
  if (v >= 55) return colors.gold;
  if (v >= 45) return colors.txt2;
  if (v >= 25) return colors.orange;
  return colors.red;
};

export function LiveTickerBar() {
  const pathname = usePathname();
  const [data, setData] = useState<TickerData | null>(null);
  const [age, setAge] = useState<number>(0);

  useEffect(() => {
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch("/api/ticker", { cache: "no-store" });
        if (!res.ok) return;
        const json = (await res.json()) as TickerData;
        if (!cancelled) setData(json);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = setInterval(poll, POLL_MS);
    const ageId = setInterval(() => {
      setAge((prev) => (data?.ts ? Math.floor((Date.now() - data.ts) / 1000) : prev + 1));
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(id);
      clearInterval(ageId);
    };
  }, [data?.ts]);

  if (pathname.startsWith("/settings") || pathname.startsWith("/design")) return null;

  const fgColor = data?.fearGreed ? fgTone(data.fearGreed.value) : colors.txt2;

  return (
    <div
      className="scanline"
      style={{
        position: "sticky",
        top: 70,
        zIndex: 90,
        background: colors.bg1,
        borderTop: `1px solid ${colors.line}`,
        borderBottom: `1px solid ${colors.line2}`,
      }}
    >
      <div
        style={{
          maxWidth: "100%",
          margin: 0,
          padding: "0 16px",
          display: "flex",
          alignItems: "center",
          gap: 0,
          fontSize: 13,
          minHeight: 40,
        }}
      >
        {/* live dot */}
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            paddingRight: 14,
            borderRight: `1px solid ${colors.line}`,
            height: 36,
          }}
        >
          <span className="live-dot" />
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 11,
              letterSpacing: "0.14em",
              color: colors.green,
              fontWeight: 800,
            }}
          >
            LIVE
          </span>
        </span>

        {!data && (
          <span style={{ color: colors.txt3, fontSize: 12, padding: "0 16px", fontFamily: fonts.mono }}>
            connecting…
          </span>
        )}

        {data && (
          <>
            <Cell
              label="BTC"
              numeric={data.btc?.price}
              display={data.btc ? `$${data.btc.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
              delta={data.btc?.change24h}
            />
            <Cell
              label="ETH"
              numeric={data.eth?.price}
              display={data.eth ? `$${data.eth.price.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : "—"}
              delta={data.eth?.change24h}
            />
            <Cell
              label="MCAP"
              numeric={data.marketCap?.total}
              display={data.marketCap ? formatUSD(data.marketCap.total) : "—"}
              delta={data.marketCap?.change24h}
            />
            <div
              style={{
                display: "inline-flex",
                alignItems: "baseline",
                gap: 10,
                padding: "0 16px",
                borderRight: `1px solid ${colors.line}`,
                whiteSpace: "nowrap",
                height: 36,
                lineHeight: "36px",
              }}
            >
              <span
                style={{
                  fontFamily: fonts.mono,
                  fontSize: 11,
                  letterSpacing: "0.10em",
                  color: colors.txt2,
                  textTransform: "uppercase",
                  fontWeight: 700,
                }}
              >
                F&G
              </span>
              {data.fearGreed ? (
                <span
                  className="mono-num"
                  style={{ color: fgColor, fontSize: 14, fontWeight: 800 }}
                >
                  {data.fearGreed.value}{" "}
                  <span style={{ fontSize: 11, color: colors.txt3, letterSpacing: "0.08em", fontWeight: 700 }}>
                    {data.fearGreed.classification.toUpperCase()}
                  </span>
                </span>
              ) : (
                <span style={{ color: colors.txt3, fontSize: 13 }}>—</span>
              )}
            </div>
            {data.portfolio && (
              <Cell
                label="MY"
                numeric={data.portfolio.totalUsd}
                display={
                  <span style={{ color: colors.accent }}>
                    {formatUSD(data.portfolio.totalUsd)}
                  </span>
                }
              />
            )}
            <span
              style={{
                marginLeft: "auto",
                paddingLeft: 16,
                fontFamily: fonts.mono,
                fontSize: 11,
                color: colors.txt3,
                letterSpacing: "0.10em",
                fontVariantNumeric: "tabular-nums",
                fontWeight: 600,
              }}
            >
              SYNC {age < 60 ? `${age}s` : `${Math.floor(age / 60)}m`} AGO
            </span>
          </>
        )}
      </div>
    </div>
  );
}
