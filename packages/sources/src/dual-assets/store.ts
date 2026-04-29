// SQLite store for Bybit Dual Assets APR snapshots.
// Server-only (better-sqlite3 native binding).
//
// Schema:
//   - apr_snapshots: per-tick rows, dedup by (timestamp_ict, coin_pair, target_price, duration, direction)
//   - daily_summary: aggregated rollups (avg/max/min/best_hour/worst_hour) per (date, coin_pair, target_price)
//
// Time-series queries (GROUP BY hour_ict) are why this earned a real DB
// vs the JSONL pattern alerts uses — see docs/ADR-003-jsonl-alerts.md
// "Migration triggers" #2: "Need joins/aggregations beyond findings.filter()."

import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import type {
  AprIvCorrelation,
  DualAssetSnapshot,
  HourlyAprStat,
} from "./types.js";

// Walk up from cwd looking for the monorepo root (pnpm-workspace.yaml).
// Falls back to cwd if not found.
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
  const fromEnv = process.env.DUAL_ASSETS_DB_PATH;
  if (fromEnv && isAbsolute(fromEnv)) return fromEnv;
  if (fromEnv) return resolve(process.cwd(), fromEnv);
  const root = findRepoRoot(process.cwd());
  return resolve(root, "apps/alerts/data/dual-assets.sqlite");
}

let _db: DB | null = null;
let _openFailed = false;

/** Returns null if the DB cannot be opened (read paths use this). */
function tryGetDb(): DB | null {
  if (_db) return _db;
  if (_openFailed) return null;
  try {
    return getDb();
  } catch (err) {
    _openFailed = true;
    console.warn("[dual-assets] DB open failed:", (err as Error).message);
    return null;
  }
}

function getDb(): DB {
  if (_db) return _db;
  const path = resolveDbPath();
  mkdirSync(dirname(path), { recursive: true });
  _db = new Database(path);
  _db.pragma("journal_mode = WAL");
  _db.pragma("synchronous = NORMAL");
  initSchema(_db);
  return _db;
}

function initSchema(db: DB) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS apr_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_utc TEXT NOT NULL,
      timestamp_ict TEXT NOT NULL,
      hour_ict INTEGER NOT NULL,
      coin_pair TEXT NOT NULL DEFAULT 'SOL-USDT',
      direction TEXT NOT NULL DEFAULT 'BuyLow',
      target_price REAL NOT NULL,
      apr_pct REAL NOT NULL,
      duration TEXT NOT NULL,
      settlement_utc TEXT,
      index_price REAL,
      is_vip_only INTEGER DEFAULT 0,
      sol_iv_pct REAL,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(timestamp_ict, coin_pair, target_price, duration, direction)
    );
    CREATE INDEX IF NOT EXISTS idx_apr_hour       ON apr_snapshots(hour_ict);
    CREATE INDEX IF NOT EXISTS idx_apr_pair_target ON apr_snapshots(coin_pair, target_price);
    CREATE INDEX IF NOT EXISTS idx_apr_timestamp  ON apr_snapshots(timestamp_utc);

    CREATE TABLE IF NOT EXISTS daily_summary (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      coin_pair TEXT NOT NULL DEFAULT 'SOL-USDT',
      target_price REAL NOT NULL,
      avg_apr REAL,
      max_apr REAL,
      min_apr REAL,
      best_hour_ict INTEGER,
      worst_hour_ict INTEGER,
      avg_index_price REAL,
      sample_count INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, coin_pair, target_price)
    );
  `);
}

/** Insert a snapshot. Returns true if saved, false if duplicate. */
export function saveSnapshot(snap: DualAssetSnapshot): boolean {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO apr_snapshots
      (timestamp_utc, timestamp_ict, hour_ict, coin_pair, direction,
       target_price, apr_pct, duration, settlement_utc, index_price,
       is_vip_only, sol_iv_pct)
      VALUES
      (@timestamp_utc, @timestamp_ict, @hour_ict, @coin_pair, @direction,
       @target_price, @apr_pct, @duration, @settlement_utc, @index_price,
       @is_vip_only, @sol_iv_pct)
    `).run(snap);
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) return false;
    throw err;
  }
}

export function updateDailySummary(dateStr: string, coinPair = "SOL-USDT"): void {
  const db = tryGetDb();
  if (!db) return;
  const aggregates = db.prepare(`
    SELECT target_price,
           ROUND(AVG(apr_pct), 2)     AS avg_apr,
           ROUND(MAX(apr_pct), 2)     AS max_apr,
           ROUND(MIN(apr_pct), 2)     AS min_apr,
           ROUND(AVG(index_price), 2) AS avg_index_price,
           COUNT(*)                    AS sample_count
    FROM apr_snapshots
    WHERE coin_pair = ? AND DATE(timestamp_utc) = ?
    GROUP BY target_price
  `).all(coinPair, dateStr) as {
    target_price: number;
    avg_apr: number;
    max_apr: number;
    min_apr: number;
    avg_index_price: number | null;
    sample_count: number;
  }[];

  const upsert = db.prepare(`
    INSERT INTO daily_summary
      (date, coin_pair, target_price, avg_apr, max_apr, min_apr,
       best_hour_ict, worst_hour_ict, avg_index_price, sample_count)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(date, coin_pair, target_price) DO UPDATE SET
      avg_apr = excluded.avg_apr,
      max_apr = excluded.max_apr,
      min_apr = excluded.min_apr,
      best_hour_ict = excluded.best_hour_ict,
      worst_hour_ict = excluded.worst_hour_ict,
      avg_index_price = excluded.avg_index_price,
      sample_count = excluded.sample_count
  `);

  const bestHourQ = db.prepare(`
    SELECT hour_ict FROM apr_snapshots
    WHERE coin_pair = ? AND DATE(timestamp_utc) = ? AND target_price = ?
    GROUP BY hour_ict ORDER BY AVG(apr_pct) DESC LIMIT 1
  `);
  const worstHourQ = db.prepare(`
    SELECT hour_ict FROM apr_snapshots
    WHERE coin_pair = ? AND DATE(timestamp_utc) = ? AND target_price = ?
    GROUP BY hour_ict ORDER BY AVG(apr_pct) ASC LIMIT 1
  `);

  for (const a of aggregates) {
    const best = bestHourQ.get(coinPair, dateStr, a.target_price) as { hour_ict: number } | undefined;
    const worst = worstHourQ.get(coinPair, dateStr, a.target_price) as { hour_ict: number } | undefined;
    upsert.run(
      dateStr, coinPair, a.target_price,
      a.avg_apr, a.max_apr, a.min_apr,
      best?.hour_ict ?? null,
      worst?.hour_ict ?? null,
      a.avg_index_price, a.sample_count,
    );
  }
}

/** Hourly average APR over the last N days for a (coin_pair, target_price). */
export function getHourlyAvg(opts: { coinPair?: string; targetPrice?: number; days?: number } = {}): HourlyAprStat[] {
  const { coinPair = "SOL-USDT", targetPrice = 78, days = 7 } = opts;
  const db = tryGetDb();
  if (!db) return [];
  return db.prepare(`
    SELECT hour_ict,
           ROUND(AVG(apr_pct), 2)     AS avg_apr,
           ROUND(MAX(apr_pct), 2)     AS max_apr,
           ROUND(MIN(apr_pct), 2)     AS min_apr,
           ROUND(AVG(index_price), 2) AS avg_price,
           ROUND(AVG(sol_iv_pct), 2)  AS avg_iv,
           COUNT(*)                    AS samples
    FROM apr_snapshots
    WHERE coin_pair = ? AND target_price = ?
      AND timestamp_utc >= datetime('now', ?)
    GROUP BY hour_ict
    ORDER BY hour_ict
  `).all(coinPair, targetPrice, `-${days} days`) as HourlyAprStat[];
}

export function getBestHours(opts: { coinPair?: string; targetPrice?: number; days?: number; topN?: number } = {}): HourlyAprStat[] {
  const { topN = 3, ...rest } = opts;
  return getHourlyAvg(rest)
    .slice()
    .sort((a, b) => b.avg_apr - a.avg_apr)
    .slice(0, topN);
}

export function getAprIvCorrelation(days = 7): AprIvCorrelation {
  const db = tryGetDb();
  if (!db) {
    return { correlation: null, interpretation: null, samples: 0, message: "Database unavailable" };
  }
  const rows = db.prepare(`
    SELECT apr_pct, sol_iv_pct
    FROM apr_snapshots
    WHERE sol_iv_pct IS NOT NULL
      AND timestamp_utc >= datetime('now', ?)
  `).all(`-${days} days`) as { apr_pct: number; sol_iv_pct: number }[];

  if (rows.length < 10) {
    return { correlation: null, interpretation: null, samples: rows.length, message: "Not enough data points" };
  }

  const aprs = rows.map((r) => r.apr_pct);
  const ivs = rows.map((r) => r.sol_iv_pct);
  const n = rows.length;
  const meanApr = aprs.reduce((s, x) => s + x, 0) / n;
  const meanIv = ivs.reduce((s, x) => s + x, 0) / n;
  const cov = aprs.reduce((s, _, i) => s + (aprs[i] - meanApr) * (ivs[i] - meanIv), 0);
  const stdApr = Math.sqrt(aprs.reduce((s, x) => s + (x - meanApr) ** 2, 0));
  const stdIv = Math.sqrt(ivs.reduce((s, x) => s + (x - meanIv) ** 2, 0));

  if (stdApr === 0 || stdIv === 0) {
    return { correlation: 0, interpretation: "no variance", samples: n, message: "No variance in data" };
  }
  const corr = +(cov / (stdApr * stdIv)).toFixed(4);
  const interp =
    corr > 0.7 ? "Strong positive" :
    corr > 0.4 ? "Moderate positive" :
    corr > -0.4 ? "Weak" :
    corr > -0.7 ? "Moderate negative" :
    "Strong negative";

  return { correlation: corr, interpretation: interp, samples: n, message: `APR vs IV: ${corr} (${n} samples)` };
}

/** Daily summaries — reads aggregated rows for a (coin_pair, target_price). */
export interface DailySummary {
  date: string;
  coin_pair: string;
  target_price: number;
  avg_apr: number | null;
  max_apr: number | null;
  min_apr: number | null;
  best_hour_ict: number | null;
  worst_hour_ict: number | null;
  avg_index_price: number | null;
  sample_count: number;
}

export function getDailySummaries(opts: {
  coinPair?: string;
  targetPrice?: number;
  days?: number;
} = {}): DailySummary[] {
  const { coinPair = "SOL-USDT", targetPrice, days = 30 } = opts;
  const db = tryGetDb();
  if (!db) return [];
  if (targetPrice !== undefined) {
    return db.prepare(`
      SELECT date, coin_pair, target_price, avg_apr, max_apr, min_apr,
             best_hour_ict, worst_hour_ict, avg_index_price, sample_count
      FROM daily_summary
      WHERE coin_pair = ? AND target_price = ?
        AND date >= DATE('now', ?)
      ORDER BY date DESC
    `).all(coinPair, targetPrice, `-${days} days`) as DailySummary[];
  }
  return db.prepare(`
    SELECT date, coin_pair, target_price, avg_apr, max_apr, min_apr,
           best_hour_ict, worst_hour_ict, avg_index_price, sample_count
    FROM daily_summary
    WHERE coin_pair = ?
      AND date >= DATE('now', ?)
    ORDER BY date DESC, target_price ASC
  `).all(coinPair, `-${days} days`) as DailySummary[];
}

/** Recent N raw snapshots — useful for /api/dual-assets/snapshots */
export function getRecentSnapshots(limit = 100): DualAssetSnapshot[] {
  const db = tryGetDb();
  if (!db) return [];
  return db.prepare(`
    SELECT timestamp_utc, timestamp_ict, hour_ict, coin_pair, direction,
           target_price, apr_pct, duration, settlement_utc, index_price,
           is_vip_only, sol_iv_pct
    FROM apr_snapshots
    ORDER BY timestamp_utc DESC
    LIMIT ?
  `).all(limit) as DualAssetSnapshot[];
}

/** Lightweight health stats for hub `/health v2` and other monitors.
 * Always returns a result; if the DB cannot be opened the `error` field is set
 * and counters are zero. No native-binding gymnastics required at the call site. */
export interface StoreStats {
  available: boolean;
  pairs: string[];
  totalSnapshots: number;
  samplesLast24h: number;
  lastWriteUtc: string | null;
  lastWriteAgeMs: number | null;
  error?: string;
}

export function getStoreStats(): StoreStats {
  const db = tryGetDb();
  if (!db) {
    return {
      available: false,
      pairs: [],
      totalSnapshots: 0,
      samplesLast24h: 0,
      lastWriteUtc: null,
      lastWriteAgeMs: null,
      error: "DB unavailable",
    };
  }
  try {
    const total = db.prepare("SELECT COUNT(*) AS n FROM apr_snapshots").get() as { n: number };
    const last = db.prepare("SELECT timestamp_utc FROM apr_snapshots ORDER BY timestamp_utc DESC LIMIT 1").get() as
      | { timestamp_utc: string }
      | undefined;
    const recent = db
      .prepare("SELECT COUNT(*) AS n FROM apr_snapshots WHERE timestamp_utc >= datetime('now', '-1 day')")
      .get() as { n: number };
    const pairs = (db.prepare("SELECT DISTINCT coin_pair FROM apr_snapshots").all() as { coin_pair: string }[])
      .map((r) => r.coin_pair);
    const lastUtc = last?.timestamp_utc ?? null;
    const ageMs = lastUtc ? Date.now() - new Date(lastUtc).getTime() : null;
    return {
      available: true,
      pairs,
      totalSnapshots: total.n,
      samplesLast24h: recent.n,
      lastWriteUtc: lastUtc,
      lastWriteAgeMs: ageMs,
    };
  } catch (err) {
    return {
      available: false,
      pairs: [],
      totalSnapshots: 0,
      samplesLast24h: 0,
      lastWriteUtc: null,
      lastWriteAgeMs: null,
      error: (err as Error).message,
    };
  }
}

/** Optional: close the connection (used in tests/shutdown). */
export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
  }
}
