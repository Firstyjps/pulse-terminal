"use client";

import { useState } from "react";
import { Panel, WsRow, Workspace, SignalPill, colors, fonts } from "@pulse/ui";
import { useSettings } from "../../lib/use-settings";
import { useWatchlist } from "../../lib/use-watchlist";
import { useToast } from "../../components/ToastProvider";

const REFRESH_PRESETS = [30_000, 60_000, 120_000, 300_000];

const ROW: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "10px 12px",
  borderBottom: `1px dashed ${colors.line}`,
  gap: 16,
};
const LABEL: React.CSSProperties = { fontSize: 12, color: colors.txt1, fontFamily: fonts.mono };
const HINT: React.CSSProperties = { fontSize: 10, color: colors.txt3, marginTop: 2, fontFamily: fonts.mono };

const INPUT: React.CSSProperties = {
  background: colors.bg2,
  border: `1px solid ${colors.line2}`,
  color: colors.txt1,
  padding: "5px 8px",
  fontSize: 11,
  fontFamily: fonts.mono,
  width: 100,
  outline: "none",
};

function segButton(active: boolean): React.CSSProperties {
  return {
    background: active ? colors.bg2 : colors.bg1,
    border: `1px solid ${active ? colors.amberDim : colors.line2}`,
    color: active ? colors.amber : colors.txt3,
    padding: "5px 12px",
    fontFamily: fonts.mono,
    fontSize: 10,
    letterSpacing: "0.08em",
    cursor: "pointer",
    textTransform: "uppercase",
    minHeight: 32,
  };
}

/**
 * Settings — Bloomberg shell.
 *
 *   Row 1 (auto): DATA REFRESH c-12
 *   Row 2 (auto): NOTIFICATIONS c-6 + WATCHLIST c-6
 *   Row 3 (auto): RESET c-12
 */
export default function SettingsPage() {
  const { settings, update, reset } = useSettings();
  const { list: watchlist, set: setWatchlist, clear: clearWatchlist, toggle } = useWatchlist();
  const [draftSymbol, setDraftSymbol] = useState("");
  const toast = useToast();

  return (
    <Workspace>
      <WsRow height="auto">
        <Panel span={12} title="DATA REFRESH" badge="POLLING">
          <div style={ROW}>
            <div>
              <div style={LABEL}>Refresh interval</div>
              <div style={HINT}>Currently {(settings.refreshIntervalMs / 1000).toFixed(0)}s</div>
            </div>
            <div style={{ display: "flex", gap: 1, background: colors.line }}>
              {REFRESH_PRESETS.map((ms) => (
                <button
                  key={ms}
                  onClick={() => update({ refreshIntervalMs: ms })}
                  style={segButton(settings.refreshIntervalMs === ms)}
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
          <div style={{ ...ROW, borderBottom: "none" }}>
            <div>
              <div style={LABEL}>Whale alert threshold (USD)</div>
              <div style={HINT}>Min BTC mempool tx size shown on /intel · default $1,000,000</div>
            </div>
            <input
              type="number"
              min={100_000}
              max={1_000_000_000}
              step={100_000}
              value={settings.whaleThresholdUsd}
              onChange={(e) =>
                update({
                  whaleThresholdUsd: Math.max(100_000, Math.min(1_000_000_000, Number(e.target.value) || 1_000_000)),
                })
              }
              style={{ ...INPUT, width: 140 }}
            />
          </div>
        </Panel>
      </WsRow>

      <WsRow height="auto">
        <Panel span={6} title="NOTIFICATIONS" badge="TOASTS">
          <div style={{ ...ROW, borderBottom: "none" }}>
            <div>
              <div style={LABEL}>Toast notifications</div>
              <div style={HINT}>
                {settings.notificationsMuted
                  ? "Muted — no toasts will appear"
                  : "Enabled — toasts auto-dismiss after ~10s"}
              </div>
            </div>
            <button
              onClick={() => {
                const next = !settings.notificationsMuted;
                update({ notificationsMuted: next });
                if (!next) {
                  toast.push({
                    tone: "success",
                    title: "Notifications enabled",
                    body: "Trigger from /derivatives or wait for the next alerts cron tick.",
                  });
                }
              }}
              style={{
                ...segButton(!settings.notificationsMuted),
                color: settings.notificationsMuted ? colors.red : colors.green,
                borderColor: settings.notificationsMuted ? colors.red2 : colors.green2,
                minWidth: 110,
              }}
            >
              {settings.notificationsMuted ? "MUTED" : "ENABLED"}
            </button>
          </div>
        </Panel>

        <Panel span={6} title="WATCHLIST" badge={`${watchlist.length} PINNED`}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, padding: "10px 12px" }}>
            {watchlist.length === 0 && (
              <p style={{ fontSize: 11, color: colors.txt3, margin: 0, fontFamily: fonts.mono }}>
                Empty — click ⭐ in Markets table or add below.
              </p>
            )}
            {watchlist.map((s) => (
              <SignalPill
                key={s}
                tone={s === "BTC" ? "FLOW" : s === "ETH" ? "OI" : "FLOW"}
                size="sm"
              >
                <span style={{ marginRight: 6 }}>{s}</span>
                <button
                  onClick={() => toggle(s)}
                  aria-label={`Remove ${s}`}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "inherit",
                    cursor: "pointer",
                    fontSize: 11,
                    padding: 0,
                  }}
                >
                  ✕
                </button>
              </SignalPill>
            ))}
          </div>
          <form
            style={{ display: "flex", gap: 6, padding: "0 12px 10px" }}
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
              style={{ ...INPUT, width: 130, flex: 1 }}
            />
            <button type="submit" style={segButton(false)}>
              ADD
            </button>
            {watchlist.length > 0 && (
              <button
                type="button"
                onClick={() => clearWatchlist()}
                style={{ ...segButton(false), color: colors.red, borderColor: colors.red2 }}
              >
                CLEAR
              </button>
            )}
          </form>
          <div style={{ padding: "0 12px 10px", fontSize: 10, color: colors.txt3, fontFamily: fonts.mono }}>
            Quick reset:{" "}
            <button
              onClick={() => setWatchlist(["BTC", "ETH"])}
              style={{
                background: "transparent",
                border: "none",
                color: colors.cyan,
                cursor: "pointer",
                padding: 0,
                fontSize: 10,
                textDecoration: "underline",
                fontFamily: fonts.mono,
              }}
            >
              BTC + ETH
            </button>
          </div>
        </Panel>
      </WsRow>

      <WsRow height="auto">
        <Panel span={12} title="RESET" badge="DESTRUCTIVE">
          <div style={{ ...ROW, borderBottom: "none" }}>
            <div>
              <div style={LABEL}>Reset all local state</div>
              <div style={HINT}>Clears settings + watchlist + last-seen alert markers</div>
            </div>
            <button
              onClick={() => {
                reset();
                clearWatchlist();
                try {
                  window.localStorage.removeItem("pulse.lastSeenScanId");
                } catch {
                  /* ignore */
                }
                toast.push({ tone: "info", title: "Reset complete", body: "All local state restored to defaults." });
              }}
              style={{ ...segButton(false), color: colors.red, borderColor: colors.red2 }}
            >
              RESET ALL LOCAL STATE
            </button>
          </div>
        </Panel>
      </WsRow>
    </Workspace>
  );
}
