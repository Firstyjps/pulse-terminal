// Daily market snapshot history — SQLite store with 90-day rolling window.
// Server-only (better-sqlite3 native binding).
//
// Schema:
//   market_snapshots(
//     date         TEXT PRIMARY KEY,    -- YYYY-MM-DD UTC
//     ts           INTEGER NOT NULL,    -- ms epoch when row was inserted
//     total_mcap   REAL,
//     total_volume REAL,
//     btc_dom      REAL,
//     eth_dom      REAL,
//     fg_value     INTEGER,
//     fg_label     TEXT,
//     top10        TEXT                 -- JSON: [{id,symbol,price,mcap,change24h}]
//   )
//
// Stored at apps/alerts/data/snapshot-history.sqlite (alongside dual-assets).

import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";

export interface MarketSnapshotTop10 {
  id: string;
  symbol: string;
  price: number;
  mcap: number;
  change24h: number;
}

export interface MarketSnapshot {
  date: string;
  ts: number;
  totalMcap: number;
  totalVolume: number;
  btcDominance: number;
  ethDominance: number;
  fgValue: number | null;
  fgLabel: string | null;
  top10: MarketSnapshotTop10[];
}

function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    if (existsSync(resolve(dir, "pnpm-workspace.yaml"))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

function resolveDbPath(): string {
  const fromEnv = process.env.SNAPSHOT_HISTORY_DB_PATH;
  if (fromEnv && isAbsolute(fromEnv)) return fromEnv;
  if (fromEnv) return resolve(process.cwd(), fromEnv);
  const root = findRepoRoot(process.cwd());
  return resolve(root, "apps/alerts/data/snapshot-history.sqlite");
}

let _db: DB | null = null;
function getDb(): DB {
  if (_db) return _db;
  const path = resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });
  _db = new Database(path);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS market_snapshots (
      date         TEXT PRIMARY KEY,
      ts           INTEGER NOT NULL,
      total_mcap   REAL,
      total_volume REAL,
      btc_dom      REAL,
      eth_dom      REAL,
      fg_value     INTEGER,
      fg_label     TEXT,
      top10        TEXT
    )
  `);
  return _db;
}

/**
 * Insert (or replace) today's snapshot. `date` is the UTC YYYY-MM-DD key.
 * Also prunes rows older than `retentionDays` (default 90).
 */
export function saveDailySnapshot(s: MarketSnapshot, retentionDays = 90): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO market_snapshots
      (date, ts, total_mcap, total_volume, btc_dom, eth_dom, fg_value, fg_label, top10)
    VALUES (@date, @ts, @totalMcap, @totalVolume, @btcDom, @ethDom, @fgValue, @fgLabel, @top10)
    ON CONFLICT(date) DO UPDATE SET
      ts           = excluded.ts,
      total_mcap   = excluded.total_mcap,
      total_volume = excluded.total_volume,
      btc_dom      = excluded.btc_dom,
      eth_dom      = excluded.eth_dom,
      fg_value     = excluded.fg_value,
      fg_label     = excluded.fg_label,
      top10        = excluded.top10
  `);
  stmt.run({
    date: s.date,
    ts: s.ts,
    totalMcap: s.totalMcap,
    totalVolume: s.totalVolume,
    btcDom: s.btcDominance,
    ethDom: s.ethDominance,
    fgValue: s.fgValue,
    fgLabel: s.fgLabel,
    top10: JSON.stringify(s.top10),
  });

  // Prune
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000)
    .toISOString()
    .slice(0, 10);
  db.prepare(`DELETE FROM market_snapshots WHERE date < ?`).run(cutoff);
}

interface RawRow {
  date: string;
  ts: number;
  total_mcap: number | null;
  total_volume: number | null;
  btc_dom: number | null;
  eth_dom: number | null;
  fg_value: number | null;
  fg_label: string | null;
  top10: string | null;
}

function rowToSnapshot(r: RawRow): MarketSnapshot {
  let top10: MarketSnapshotTop10[] = [];
  try {
    if (r.top10) top10 = JSON.parse(r.top10) as MarketSnapshotTop10[];
  } catch { /* ignore malformed JSON */ }
  return {
    date: r.date,
    ts: r.ts,
    totalMcap: r.total_mcap ?? 0,
    totalVolume: r.total_volume ?? 0,
    btcDominance: r.btc_dom ?? 0,
    ethDominance: r.eth_dom ?? 0,
    fgValue: r.fg_value,
    fgLabel: r.fg_label,
    top10,
  };
}

/** Read snapshots for the last `days` days, oldest → newest. */
export function getSnapshotHistory(days = 30): MarketSnapshot[] {
  const db = getDb();
  const cutoff = new Date(Date.now() - days * 86_400_000)
    .toISOString()
    .slice(0, 10);
  const rows = db
    .prepare(`SELECT * FROM market_snapshots WHERE date >= ? ORDER BY date ASC`)
    .all(cutoff) as RawRow[];
  return rows.map(rowToSnapshot);
}

/** All snapshots (for export). Newest first. */
export function getAllSnapshots(): MarketSnapshot[] {
  const db = getDb();
  const rows = db.prepare(`SELECT * FROM market_snapshots ORDER BY date DESC`).all() as RawRow[];
  return rows.map(rowToSnapshot);
}

/** Truncate the entire history table. */
export function clearSnapshots(): void {
  const db = getDb();
  db.prepare(`DELETE FROM market_snapshots`).run();
}

/** Stats for the /history page header. */
export function getSnapshotStats(): {
  count: number;
  earliest: string | null;
  latest: string | null;
} {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT COUNT(*) AS count, MIN(date) AS earliest, MAX(date) AS latest FROM market_snapshots`,
    )
    .get() as { count: number; earliest: string | null; latest: string | null };
  return row;
}
