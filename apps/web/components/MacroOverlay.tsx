"use client";

import { Card, Pill } from "@pulse/ui";
import { Sparkline } from "@pulse/charts";
import { formatPercent } from "@pulse/sources";
import type { MacroResponse, MacroSeries } from "@pulse/sources";
import { useFlow } from "../lib/use-flow";

function MacroCard({ s, color }: { s: MacroSeries | null; color: string }) {
  if (!s) {
    return (
      <Card>
        <p style={{ color: "#6b7280", fontSize: 12 }}>Macro feed unavailable.</p>
      </Card>
    );
  }
  return (
    <Card>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
        <span style={{ fontSize: 11, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
          {s.label}
        </span>
        <span style={{ fontSize: 11, color: "#6b7280", fontFamily: "JetBrains Mono, monospace" }}>{s.symbol}</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
        <span style={{ fontSize: 22, fontWeight: 700, fontFamily: "JetBrains Mono, monospace" }}>
          {s.current.toLocaleString(undefined, { maximumFractionDigits: 2 })}
        </span>
        <Pill tone={s.change24h >= 0 ? "up" : "down"}>{formatPercent(s.change24h)}</Pill>
      </div>
      <div style={{ marginTop: 12 }}>
        <Sparkline
          data={s.history.map((p) => p.value)}
          positive={s.change24h >= 0}
          color={color}
          width={240}
          height={40}
        />
      </div>
    </Card>
  );
}

export function MacroOverlay() {
  const { data } = useFlow<MacroResponse>("/api/macro");
  return (
    <section style={{ marginTop: 32 }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 14, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
          Macro Overlay
        </h3>
        <span style={{ fontSize: 11, color: "#6b7280" }}>DXY · SPX · Gold (Yahoo, 6mo daily)</span>
      </div>
      <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))" }}>
        <MacroCard s={data?.dxy ?? null} color="#34d399" />
        <MacroCard s={data?.spx ?? null} color="#22d3ee" />
        <MacroCard s={data?.gold ?? null} color="#fbbf24" />
      </div>
    </section>
  );
}
