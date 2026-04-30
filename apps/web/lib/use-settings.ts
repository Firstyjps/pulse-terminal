"use client";

import { useCallback, useEffect, useState } from "react";

export interface Settings {
  /** Polling interval for `useFlow` data (ms). Default 60s. */
  refreshIntervalMs: number;
  /** Auto-rescan anomaly feed every N seconds (0 = manual only). */
  alertScanSec: number;
  /** Mute toast notifications */
  notificationsMuted: boolean;
  /** Whale-alerts USD threshold (used by /intel WhaleAlerts panel). */
  whaleThresholdUsd: number;
}

const KEY = "pulse.settings";

const DEFAULTS: Settings = {
  refreshIntervalMs: 60_000,
  alertScanSec: 60,
  notificationsMuted: false,
  whaleThresholdUsd: 1_000_000,
};

function read(): Settings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function write(next: Settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("pulse:settings", { detail: next }));
  } catch {
    /* ignore */
  }
}

export function useSettings() {
  const [settings, setLocal] = useState<Settings>(DEFAULTS);

  useEffect(() => {
    setLocal(read());
    const onChange = (ev: Event) => {
      const detail = (ev as CustomEvent<Settings>).detail;
      if (detail) setLocal(detail);
    };
    const onStorage = (ev: StorageEvent) => {
      if (ev.key === KEY) setLocal(read());
    };
    window.addEventListener("pulse:settings", onChange);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("pulse:settings", onChange);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    const next = { ...read(), ...patch };
    write(next);
    setLocal(next);
  }, []);

  const reset = useCallback(() => {
    write(DEFAULTS);
    setLocal(DEFAULTS);
  }, []);

  return { settings, update, reset };
}
