// Today's-catalysts loader.
//
// v2 source: hand-curated JSON keyed by BKK date (`YYYY-MM-DD`). Updated by
// the user weekly from a free upstream calendar (see README). Reading is
// synchronous + fast — file is ~1KB, refreshed only on daemon restart.
//
// Live calendar API integration is intentionally deferred to v3 — keeps
// scope contained and avoids upstream rate-limit / parsing fragility.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));

export interface CatalystsLoadOpts {
  /** Override file path for tests. */
  filePath?: string;
  /** Override "now" for tests. Defaults to Date.now(). */
  now?: number;
}

/** Returns catalyst strings for today (BKK timezone). Empty array = no entries. */
export function loadCatalystsForToday(opts: CatalystsLoadOpts = {}): string[] {
  const now = opts.now ?? Date.now();
  const path = opts.filePath ?? resolve(HERE, "catalysts.json");
  const dateStr = bkkDateStr(now);

  let raw: string;
  try {
    raw = readFileSync(path, "utf-8");
  } catch {
    return [];
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return [];
  }

  const entry = parsed[dateStr];
  if (!Array.isArray(entry)) return [];
  return entry.filter((s): s is string => typeof s === "string");
}

function bkkDateStr(epochMs: number): string {
  const bkk = new Date(epochMs + 7 * 60 * 60_000);
  return bkk.toISOString().slice(0, 10);
}
