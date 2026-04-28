"use client";

import { useState } from "react";
import { Card, Pill } from "@pulse/ui";
import { useLocale } from "@pulse/i18n";
import { useSettings } from "../../lib/use-settings";
import { useWatchlist } from "../../lib/use-watchlist";
import { useToast } from "../../components/ToastProvider";

function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <Card style={{ marginBottom: 16 }}>
      <div style={{ marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 14, letterSpacing: "0.12em", color: "#9ca3af", textTransform: "uppercase" }}>
          {title}
        </h3>
        {sub && <p style={{ margin: "6px 0 0", fontSize: 12, color: "#6b7280" }}>{sub}</p>}
      </div>
      {children}
    </Card>
  );
}

const ROW = { display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 0", borderBottom: "1px dashed rgba(255,255,255,0.06)", gap: 16 } as const;
const LABEL = { fontSize: 13, color: "#f2f4f8" } as const;
const HINT = { fontSize: 11, color: "#6b7280", marginTop: 2 } as const;
const INPUT = {
  background: "rgba(255,255,255,0.04)",
  border: "1px solid rgba(255,255,255,0.1)",
  color: "#f2f4f8",
  padding: "6px 10px",
  borderRadius: 8,
  fontSize: 13,
  fontFamily: "JetBrains Mono, monospace",
  width: 100,
} as const;

const REFRESH_PRESETS = [30_000, 60_000, 120_000, 300_000];

export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { list: watchlist, set: setWatchlist, clear: clearWatchlist, toggle } = useWatchlist();
  const [locale, setLocale] = useLocale();
  const [draftSymbol, setDraftSymbol] = useState("");
  const toast = useToast();

  return (
    <section style={{ paddingTop: 40, paddingBottom: 80, maxWidth: 760, margin: "0 auto" }}>
      <h2 style={{ fontSize: 28, marginBottom: 24, letterSpacing: "-0.01em" }}>Settings</h2>

      <Section title="Locale" sub="Affects label rendering across the app (Bilingual / nav)">
        <div style={ROW}>
          <div>
            <div style={LABEL}>Language</div>
            <div style={HINT}>ไทย ↔ English (also toggleable from the LIVE pill in the nav)</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {(["th", "en"] as const).map((l) => (
              <button
                key={l}
                onClick={() => setLocale(l)}
                style={{
                  background: locale === l ? "rgba(124,92,255,0.18)" : "transparent",
                  border: `1px solid ${locale === l ? "rgba(124,92,255,0.5)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 8,
                  color: locale === l ? "#a78bfa" : "#9ca3af",
                  padding: "6px 14px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
      </Section>

      <Section
        title="Data refresh"
        sub="How often the dashboard re-polls /api/* endpoints. Faster = more API quota burned upstream."
      >
        <div style={ROW}>
          <div>
            <div style={LABEL}>Refresh interval</div>
            <div style={HINT}>Currently {(settings.refreshIntervalMs / 1000).toFixed(0)}s</div>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            {REFRESH_PRESETS.map((ms) => (
              <button
                key={ms}
                onClick={() => update({ refreshIntervalMs: ms })}
                style={{
                  background: settings.refreshIntervalMs === ms ? "rgba(124,92,255,0.18)" : "transparent",
                  border: `1px solid ${settings.refreshIntervalMs === ms ? "rgba(124,92,255,0.5)" : "rgba(255,255,255,0.1)"}`,
                  borderRadius: 8,
                  color: settings.refreshIntervalMs === ms ? "#a78bfa" : "#9ca3af",
                  padding: "6px 12px",
                  fontFamily: "JetBrains Mono, monospace",
                  fontSize: 12,
                  cursor: "pointer",
                }}
              >
                {ms / 1000}s
              </button>
            ))}
          </div>
        </div>
        <div style={{ ...ROW, borderBottom: "none" }}>
          <div>
            <div style={LABEL}>Alerts auto-rescan</div>
            <div style={HINT}>Live anomaly feed re-scans every N seconds (0 = manual only)</div>
          </div>
          <input
            type="number"
            min={0}
            max={3600}
            value={settings.alertScanSec}
            onChange={(e) => update({ alertScanSec: Math.max(0, Math.min(3600, Number(e.target.value))) })}
            style={INPUT}
          />
        </div>
      </Section>

      <Section
        title="Notifications"
        sub="Toast popups when alerts cron fires med/high findings"
      >
        <div style={{ ...ROW, borderBottom: "none" }}>
          <div>
            <div style={LABEL}>Notifications</div>
            <div style={HINT}>{settings.notificationsMuted ? "Muted — no toasts will appear" : "Enabled — toasts auto-dismiss after ~10s"}</div>
          </div>
          <button
            onClick={() => {
              const next = !settings.notificationsMuted;
              update({ notificationsMuted: next });
              if (!next) {
                toast.push({ tone: "success", title: "Notifications enabled", body: "ลอง trigger ดูได้จาก /derivatives หรือรอ alerts cron tick ถัดไป" });
              }
            }}
            style={{
              background: settings.notificationsMuted ? "rgba(248,113,113,0.18)" : "rgba(52,211,153,0.18)",
              border: `1px solid ${settings.notificationsMuted ? "rgba(248,113,113,0.5)" : "rgba(52,211,153,0.5)"}`,
              borderRadius: 999,
              color: settings.notificationsMuted ? "#f87171" : "#34d399",
              padding: "6px 14px",
              fontFamily: "JetBrains Mono, monospace",
              fontSize: 12,
              cursor: "pointer",
            }}
          >
            {settings.notificationsMuted ? "MUTED" : "ENABLED"}
          </button>
        </div>
      </Section>

      <Section
        title="Watchlist"
        sub="Pinned coins float to the top of the Markets table. Click ⭐ in any row to toggle."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
          {watchlist.length === 0 && (
            <p style={{ fontSize: 12, color: "#6b7280", margin: 0 }}>Empty — click ⭐ in Markets table or add below.</p>
          )}
          {watchlist.map((s) => (
            <Pill key={s} tone={s === "BTC" ? "btc" : s === "ETH" ? "eth" : "purple"}>
              <span style={{ marginRight: 6 }}>{s}</span>
              <button
                onClick={() => toggle(s)}
                aria-label={`Remove ${s}`}
                style={{ background: "transparent", border: "none", color: "inherit", cursor: "pointer", fontSize: 12, padding: 0 }}
              >
                ✕
              </button>
            </Pill>
          ))}
        </div>
        <form
          style={{ display: "flex", gap: 8 }}
          onSubmit={(e) => {
            e.preventDefault();
            const sym = draftSymbol.trim().toUpperCase();
            if (!sym) return;
            if (!watchlist.includes(sym)) toggle(sym);
            setDraftSymbol("");
          }}
        >
          <input
            value={draftSymbol}
            onChange={(e) => setDraftSymbol(e.target.value)}
            placeholder="e.g. SOL"
            style={{ ...INPUT, width: 140 }}
          />
          <button type="submit" style={{ ...INPUT, width: 80, cursor: "pointer", color: "#a78bfa", borderColor: "rgba(124,92,255,0.5)" }}>
            ADD
          </button>
          {watchlist.length > 0 && (
            <button
              type="button"
              onClick={() => clearWatchlist()}
              style={{ ...INPUT, width: 90, cursor: "pointer", color: "#f87171", borderColor: "rgba(248,113,113,0.4)" }}
            >
              CLEAR
            </button>
          )}
        </form>
        <p style={{ marginTop: 12, fontSize: 11, color: "#6b7280" }}>
          Quick reset: <button onClick={() => setWatchlist(["BTC", "ETH"])} style={{ background: "transparent", border: "none", color: "#22d3ee", cursor: "pointer", padding: 0, fontSize: 11, textDecoration: "underline" }}>BTC + ETH</button>
        </p>
      </Section>

      <Section title="Reset" sub="Clears settings + watchlist + last-seen alert markers">
        <button
          onClick={() => {
            reset();
            clearWatchlist();
            try { window.localStorage.removeItem("pulse.lastSeenScanId"); } catch { /* ignore */ }
            toast.push({ tone: "info", title: "Reset complete", body: "ทุกอย่างกลับเป็น default แล้ว" });
          }}
          style={{
            background: "rgba(248,113,113,0.12)",
            border: "1px solid rgba(248,113,113,0.4)",
            borderRadius: 8,
            color: "#f87171",
            padding: "8px 16px",
            fontFamily: "JetBrains Mono, monospace",
            fontSize: 12,
            cursor: "pointer",
          }}
        >
          RESET ALL LOCAL STATE
        </button>
      </Section>
    </section>
  );
}
