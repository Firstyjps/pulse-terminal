"use client";

import { useEffect, useRef } from "react";
import { useToast } from "./ToastProvider";

interface ScanRecord {
  ts: string;
  scan_id: string;
  symbol: string;
  findings: Array<{ category: string; severity: "low" | "med" | "high"; signal: string }>;
}

interface ApiResp {
  configured: boolean;
  records?: ScanRecord[];
}

const POLL_MS = 60_000;            // poll every minute
const SEEN_KEY = "pulse.lastSeenScanId";

/**
 * Background watcher: polls /api/alerts/recent every 60s and fires a toast for any
 * new scan_id that contains med/high findings. Mounted once in AppShell.
 *
 * Persists "last seen" scan_id in localStorage so toasts don't replay on refresh.
 */
export function AlertWatcher() {
  const toast = useToast();
  const seenRef = useRef<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      seenRef.current = window.localStorage.getItem(SEEN_KEY);
    }

    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/alerts/recent?limit=10", { cache: "no-store" });
        if (!res.ok) return;
        const data = (await res.json()) as ApiResp;
        if (!data.configured || !data.records?.length) return;

        // records[0] is newest. Walk newest→oldest, stop at last-seen.
        const newOnes: ScanRecord[] = [];
        for (const r of data.records) {
          if (r.scan_id === seenRef.current) break;
          newOnes.push(r);
        }
        if (!newOnes.length) return;

        for (const rec of newOnes.reverse()) {
          const interesting = rec.findings.filter((f) => f.severity !== "low");
          if (!interesting.length) continue;

          const top = interesting[0];
          const tone = top.severity === "high" ? "error" : "warning";
          const more = interesting.length > 1 ? ` · +${interesting.length - 1} more` : "";

          toast.push({
            tone,
            title: `${top.severity.toUpperCase()} · ${top.category} · ${rec.symbol}${more}`,
            body: top.signal,
            ttlMs: 10_000,
          });
        }

        // Update last-seen
        if (data.records[0]?.scan_id) {
          seenRef.current = data.records[0].scan_id;
          window.localStorage.setItem(SEEN_KEY, data.records[0].scan_id);
        }
      } catch {
        /* network blip — try again next tick */
      }
    }

    // First fire after a short delay so the page settles
    const initial = setTimeout(() => { if (!cancelled) void tick(); }, 3000);
    const id = setInterval(() => { if (!cancelled) void tick(); }, POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(initial);
      clearInterval(id);
    };
  }, [toast]);

  return null;
}
