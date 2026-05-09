"use client";

import { useEffect, useMemo, useState } from "react";
import { PulseClient, type ServerMessage } from "./ws-client";

export type WsStatus = "connecting" | "open" | "closed" | "error";
export type HealthStatus = "checking" | "healthy" | "degraded" | "unhealthy" | "offline";

interface CheckResult {
  ok: boolean;
  ms: number;
  err?: string;
}

interface HealthResponse {
  status: "healthy" | "degraded" | "unhealthy";
  checks?: Record<string, CheckResult>;
}

interface AlertRecord {
  findings: Array<{ severity: "low" | "med" | "high" }>;
}

interface AlertsResponse {
  configured: boolean;
  count: number;
  records: AlertRecord[];
}

export interface TerminalTelemetry {
  healthStatus: HealthStatus;
  healthLatencyMs: number | null;
  hubOk: boolean | null;
  hubLatencyMs: number | null;
  wsStatus: WsStatus;
  wsMessages: number;
  wsLastTs: number | null;
  alertScans: number | null;
  alertEvents: number | null;
  alertHighEvents: number | null;
  alertsConfigured: boolean | null;
}

const WS_URL = process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8080";
const HEALTH_POLL_MS = 30_000;
const ALERT_POLL_MS = 60_000;

export function useTerminalTelemetry(): TerminalTelemetry {
  const [health, setHealth] = useState<{
    status: HealthStatus;
    latencyMs: number | null;
    hubOk: boolean | null;
    hubLatencyMs: number | null;
  }>({
    status: "checking",
    latencyMs: null,
    hubOk: null,
    hubLatencyMs: null,
  });
  const [alerts, setAlerts] = useState<{
    scans: number | null;
    events: number | null;
    highEvents: number | null;
    configured: boolean | null;
  }>({
    scans: null,
    events: null,
    highEvents: null,
    configured: null,
  });
  const [ws, setWs] = useState<{
    status: WsStatus;
    messages: number;
    lastTs: number | null;
  }>({
    status: "connecting",
    messages: 0,
    lastTs: null,
  });

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function pollHealth() {
      const started = performance.now();
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const latencyMs = Math.round(performance.now() - started);
        const data = (await res.json()) as HealthResponse;
        if (cancelled) return;

        const hub = data.checks?.hub;
        setHealth({
          status: res.ok ? data.status : "offline",
          latencyMs,
          hubOk: typeof hub?.ok === "boolean" ? hub.ok : null,
          hubLatencyMs: typeof hub?.ms === "number" ? hub.ms : null,
        });
      } catch {
        if (!cancelled) {
          setHealth({
            status: "offline",
            latencyMs: Math.round(performance.now() - started),
            hubOk: false,
            hubLatencyMs: null,
          });
        }
      }
    }

    void pollHealth();
    timer = setInterval(() => void pollHealth(), HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    async function pollAlerts() {
      try {
        const res = await fetch("/api/alerts/recent?limit=200", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as AlertsResponse;
        if (cancelled) return;

        const records = data.records ?? [];
        const events = records.reduce((sum, rec) => sum + (rec.findings?.length ?? 0), 0);
        const highEvents = records.reduce(
          (sum, rec) => sum + (rec.findings ?? []).filter((f) => f.severity === "high").length,
          0,
        );
        setAlerts({
          scans: data.count ?? records.length,
          events,
          highEvents,
          configured: data.configured,
        });
      } catch {
        if (!cancelled) {
          setAlerts({
            scans: null,
            events: null,
            highEvents: null,
            configured: false,
          });
        }
      }
    }

    void pollAlerts();
    timer = setInterval(() => void pollAlerts(), ALERT_POLL_MS);
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    const client = new PulseClient({
      url: WS_URL,
      onStatus: (status) => {
        setWs((prev) => ({ ...prev, status }));
      },
      onMessage: (msg: ServerMessage) => {
        const ts = "ts" in msg && typeof msg.ts === "number" ? msg.ts : Date.now();
        setWs((prev) => ({
          status: prev.status,
          messages: msg.type === "ack" ? prev.messages : prev.messages + 1,
          lastTs: ts,
        }));
      },
    });

    return () => client.close();
  }, []);

  return useMemo(
    () => ({
      healthStatus: health.status,
      healthLatencyMs: health.latencyMs,
      hubOk: health.hubOk,
      hubLatencyMs: health.hubLatencyMs,
      wsStatus: ws.status,
      wsMessages: ws.messages,
      wsLastTs: ws.lastTs,
      alertScans: alerts.scans,
      alertEvents: alerts.events,
      alertHighEvents: alerts.highEvents,
      alertsConfigured: alerts.configured,
    }),
    [alerts, health, ws],
  );
}
