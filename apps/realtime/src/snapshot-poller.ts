import { getFullSnapshot } from "@pulse/sources/server";
import type { HubCache } from "./cache.js";

const SNAPSHOT_INTERVAL_MS = Number(process.env.SNAPSHOT_INTERVAL_MS ?? 90_000);

/**
 * Refresh the in-memory snapshot every `SNAPSHOT_INTERVAL_MS` (default 90s).
 * `getFullSnapshot()` already uses Promise.allSettled so a single source
 * failure leaves the rest fresh.
 */
export function startSnapshotPoller(cache: HubCache): () => void {
  let stopped = false;

  const tick = async () => {
    const t0 = Date.now();
    try {
      const snap = await getFullSnapshot();
      cache.setSnapshot(snap);
      cache.health.snapshot = { ok: true, ms: Date.now() - t0, ts: Date.now() };
      const ageS = (cache.snapshotAgeMs() / 1000).toFixed(1);
      console.log(`[snapshot] refreshed in ${Date.now() - t0}ms · age ${ageS}s`);
    } catch (err) {
      cache.health.snapshot = {
        ok: false,
        ms: Date.now() - t0,
        err: (err as Error).message.slice(0, 120),
        ts: Date.now(),
      };
      console.warn("[snapshot] refresh failed:", (err as Error).message);
    }
    if (!stopped) setTimeout(tick, SNAPSHOT_INTERVAL_MS);
  };

  // Kick off immediately
  void tick();

  return () => {
    stopped = true;
  };
}
