// APR store reader for hub /health v2.
//
// Calls @pulse/sources/server's `getStoreStats()` (Code's contract per the
// 2026-04-28 STATUS.md resolution) and maps the result into the AprBlock
// shape the hub-health builder expects. No SQLite touching at this layer —
// the dual-assets store owns the connection lifecycle. This means the
// realtime app no longer needs `better-sqlite3` as a direct dep.

import { getStoreStats, type StoreStats } from "@pulse/sources/server";
import type { AprBlock, AprReader } from "./hub-health.js";

/** Adapter: StoreStats → AprBlock (the v2 hub-health contract). */
export function toAprBlock(stats: StoreStats): AprBlock {
  const block: AprBlock = {
    storeOk: stats.available,
    lastWriteMs: stats.lastWriteAgeMs,
    pairs: stats.pairs.length,
    samplesLast24h: stats.samplesLast24h,
  };
  if (stats.error) block.error = stats.error;
  return block;
}

/** Production AprReader — sync getStoreStats() call, < 1ms at this scale. */
export function createAprReader(): AprReader {
  return {
    read() {
      try {
        return toAprBlock(getStoreStats());
      } catch (err) {
        // Defensive: getStoreStats already swallows DB errors, but if a
        // dependency-load error escapes, surface it as an unhealthy block
        // rather than crashing /health.
        return {
          storeOk: false,
          lastWriteMs: null,
          pairs: 0,
          samplesLast24h: 0,
          error: (err as Error).message.slice(0, 120),
        };
      }
    },
  };
}

/**
 * No-op kept for API compatibility with the previous dynamic-import design.
 * `getStoreStats()` is sync + lazy in @pulse/sources, so there's nothing to
 * preload. Safe to remove once `index.ts` stops calling it.
 */
export async function preloadAprDriver(): Promise<void> {
  /* no-op */
}
