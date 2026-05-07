import Database from "better-sqlite3";
import type { Database as DB } from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { getDualAssetsSettings } from "./config.js";
import type {
  AlertEvent,
  AprIvCorrelation,
  DailySummary,
  DualAssetDirection,
  DualAssetDuration,
  DualAssetSnapshot,
  DualAssetSnapshotQuery,
  HourlyAprStat,
} from "./types.js";

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

export function resolveDbPath(): string {
  const fromEnv = process.env.DUAL_ASSETS_DB_PATH;
  if (fromEnv && isAbsolute(fromEnv)) return fromEnv;
  if (fromEnv) return resolve(process.cwd(), fromEnv);
  const root = findRepoRoot(process.cwd());
  return resolve(root, "apps/alerts/data/dual-assets.sqlite");
}

let _db: DB | null = null;
let _openFailed = false;

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

function tableSql(db: DB, table: string): string {
  const row = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = ?").get(table) as
    | { sql: string }
    | undefined;
  return row?.sql ?? "";
}

function columnSet(db: DB, table: string): Set<string> {
  return new Set((db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[]).map((row) => row.name));
}

function createSnapshotTable(db: DB, table = "apr_snapshots"): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_utc TEXT NOT NULL,
      timestamp_ict TEXT NOT NULL,
      hour_ict INTEGER NOT NULL,
      product_id TEXT NOT NULL DEFAULT '',
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
      UNIQUE(timestamp_ict, coin_pair, target_price, duration, direction, product_id, is_vip_only)
    );
  `);
}

function createDailySummaryTable(db: DB, table = "daily_summary"): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ${table} (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      coin_pair TEXT NOT NULL DEFAULT 'SOL-USDT',
      direction TEXT NOT NULL DEFAULT 'all',
      duration TEXT NOT NULL DEFAULT 'all',
      target_price REAL NOT NULL,
      avg_apr REAL,
      max_apr REAL,
      min_apr REAL,
      best_hour_ict INTEGER,
      worst_hour_ict INTEGER,
      avg_index_price REAL,
      sample_count INTEGER,
      created_at TEXT DEFAULT (datetime('now')),
      UNIQUE(date, coin_pair, direction, duration, target_price)
    );
  `);
}

function migrateSnapshotTable(db: DB): void {
  const sql = tableSql(db, "apr_snapshots");
  if (!sql) {
    createSnapshotTable(db);
    return;
  }
  const needsRebuild =
    !sql.includes("product_id TEXT NOT NULL") ||
    !sql.includes("UNIQUE(timestamp_ict, coin_pair, target_price, duration, direction, product_id, is_vip_only)");
  if (!needsRebuild) return;

  const cols = columnSet(db, "apr_snapshots");
  db.exec("ALTER TABLE apr_snapshots RENAME TO apr_snapshots_old;");
  createSnapshotTable(db);
  const productExpr = cols.has("product_id") ? "COALESCE(product_id, '')" : "''";
  const idExpr = cols.has("id") ? "id" : "NULL";
  const createdAtExpr = cols.has("created_at") ? "created_at" : "datetime('now')";
  db.exec(`
    INSERT OR IGNORE INTO apr_snapshots
      (id, timestamp_utc, timestamp_ict, hour_ict, product_id, coin_pair, direction,
       target_price, apr_pct, duration, settlement_utc, index_price, is_vip_only,
       sol_iv_pct, created_at)
    SELECT
      ${idExpr}, timestamp_utc, timestamp_ict, hour_ict, ${productExpr}, coin_pair, direction,
      target_price, apr_pct, lower(duration), settlement_utc, index_price, COALESCE(is_vip_only, 0),
      sol_iv_pct, ${createdAtExpr}
    FROM apr_snapshots_old;
    DROP TABLE apr_snapshots_old;
  `);
}

function migrateDailySummaryTable(db: DB): void {
  const sql = tableSql(db, "daily_summary");
  if (!sql) {
    createDailySummaryTable(db);
    return;
  }
  const needsRebuild =
    !sql.includes("direction TEXT NOT NULL") ||
    !sql.includes("duration TEXT NOT NULL") ||
    !sql.includes("UNIQUE(date, coin_pair, direction, duration, target_price)");
  if (!needsRebuild) return;

  const cols = columnSet(db, "daily_summary");
  db.exec("ALTER TABLE daily_summary RENAME TO daily_summary_old;");
  createDailySummaryTable(db);
  const directionExpr = cols.has("direction") ? "COALESCE(direction, 'all')" : "'all'";
  const durationExpr = cols.has("duration") ? "COALESCE(lower(duration), 'all')" : "'all'";
  const createdAtExpr = cols.has("created_at") ? "created_at" : "datetime('now')";
  db.exec(`
    INSERT OR IGNORE INTO daily_summary
      (date, coin_pair, direction, duration, target_price, avg_apr, max_apr, min_apr,
       best_hour_ict, worst_hour_ict, avg_index_price, sample_count, created_at)
    SELECT
      date, coin_pair, ${directionExpr}, ${durationExpr}, target_price, avg_apr, max_apr, min_apr,
      best_hour_ict, worst_hour_ict, avg_index_price, sample_count, ${createdAtExpr}
    FROM daily_summary_old;
    DROP TABLE daily_summary_old;
  `);
}

function initSchema(db: DB): void {
  createSnapshotTable(db);
  createDailySummaryTable(db);
  migrateSnapshotTable(db);
  migrateDailySummaryTable(db);
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_apr_hour ON apr_snapshots(hour_ict);
    CREATE INDEX IF NOT EXISTS idx_apr_pair_target ON apr_snapshots(coin_pair, target_price);
    CREATE INDEX IF NOT EXISTS idx_apr_timestamp ON apr_snapshots(timestamp_utc);
    CREATE INDEX IF NOT EXISTS idx_apr_visible ON apr_snapshots(coin_pair, duration, direction, apr_pct, timestamp_utc);

    CREATE TABLE IF NOT EXISTS tick_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_utc TEXT NOT NULL,
      saved INTEGER NOT NULL,
      skipped INTEGER NOT NULL,
      db_skipped INTEGER NOT NULL DEFAULT 0,
      track_skipped INTEGER NOT NULL DEFAULT 0,
      raw_rows INTEGER NOT NULL DEFAULT 0,
      hot INTEGER NOT NULL DEFAULT 0,
      api_latency_ms INTEGER,
      status TEXT NOT NULL DEFAULT 'ok',
      error TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp_utc TEXT NOT NULL,
      coin_pair TEXT NOT NULL,
      direction TEXT NOT NULL,
      duration TEXT NOT NULL,
      target_price REAL NOT NULL,
      apr_pct REAL NOT NULL,
      threshold_pct REAL NOT NULL,
      product_id TEXT NOT NULL DEFAULT '',
      created_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_alert_recent
      ON alert_events(coin_pair, direction, duration, target_price, product_id, timestamp_utc);
  `);
}

function bindSnapshot(snap: DualAssetSnapshot): DualAssetSnapshot {
  return {
    ...snap,
    product_id: snap.product_id ?? "",
    duration: snap.duration.toLowerCase() as DualAssetDuration,
    is_vip_only: snap.is_vip_only ? 1 : 0,
  };
}

export function saveSnapshot(snap: DualAssetSnapshot): boolean {
  const db = getDb();
  try {
    db.prepare(`
      INSERT INTO apr_snapshots
      (timestamp_utc, timestamp_ict, hour_ict, product_id, coin_pair, direction,
       target_price, apr_pct, duration, settlement_utc, index_price,
       is_vip_only, sol_iv_pct)
      VALUES
      (@timestamp_utc, @timestamp_ict, @hour_ict, @product_id, @coin_pair, @direction,
       @target_price, @apr_pct, @duration, @settlement_utc, @index_price,
       @is_vip_only, @sol_iv_pct)
    `).run(bindSnapshot(snap));
    return true;
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes("UNIQUE")) return false;
    throw err;
  }
}

export function saveSnapshots(snaps: DualAssetSnapshot[]): { saved: number; skipped: number } {
  const db = getDb();
  const insert = db.prepare(`
    INSERT INTO apr_snapshots
    (timestamp_utc, timestamp_ict, hour_ict, product_id, coin_pair, direction,
     target_price, apr_pct, duration, settlement_utc, index_price,
     is_vip_only, sol_iv_pct)
    VALUES
    (@timestamp_utc, @timestamp_ict, @hour_ict, @product_id, @coin_pair, @direction,
     @target_price, @apr_pct, @duration, @settlement_utc, @index_price,
     @is_vip_only, @sol_iv_pct)
  `);
  let saved = 0;
  let skipped = 0;
  const tx = db.transaction((items: DualAssetSnapshot[]) => {
    for (const item of items) {
      try {
        insert.run(bindSnapshot(item));
        saved += 1;
      } catch (err) {
        if (err instanceof Error && err.message.includes("UNIQUE")) skipped += 1;
        else throw err;
      }
    }
  });
  tx(snaps);
  return { saved, skipped };
}

function appendFilter(
  where: string[],
  params: Record<string, unknown>,
  opts: {
    coinPair?: string;
    targetPrice?: number;
    directions?: DualAssetDirection[];
    durations?: DualAssetDuration[];
    minAprPct?: number;
    days?: number;
  },
): void {
  if (opts.coinPair) {
    where.push("coin_pair = @coinPair");
    params.coinPair = opts.coinPair;
  }
  if (opts.targetPrice !== undefined && Number.isFinite(opts.targetPrice) && opts.targetPrice > 0) {
    where.push("target_price = @targetPrice");
    params.targetPrice = opts.targetPrice;
  }
  if (opts.directions) {
    if (opts.directions.length === 0) {
      where.push("1 = 0");
    } else {
      where.push(`direction IN (${opts.directions.map((_, i) => `@direction${i}`).join(", ")})`);
      opts.directions.forEach((direction, i) => {
        params[`direction${i}`] = direction;
      });
    }
  }
  if (opts.durations) {
    if (opts.durations.length === 0) {
      where.push("1 = 0");
    } else {
      where.push(`lower(duration) IN (${opts.durations.map((_, i) => `@duration${i}`).join(", ")})`);
      opts.durations.forEach((duration, i) => {
        params[`duration${i}`] = duration;
      });
    }
  }
  if (opts.minAprPct !== undefined) {
    where.push("apr_pct >= @minAprPct");
    params.minAprPct = opts.minAprPct;
  }
  if (opts.days !== undefined) {
    where.push("timestamp_utc >= datetime('now', @daysWindow)");
    params.daysWindow = `-${opts.days} days`;
  }
}

function dedupeSnapshots(rows: DualAssetSnapshot[], limit: number): DualAssetSnapshot[] {
  const chosen = new Map<string, DualAssetSnapshot>();
  for (const row of rows) {
    const key = [
      row.timestamp_utc,
      row.coin_pair,
      row.direction,
      row.target_price,
      row.duration.toLowerCase(),
    ].join("|");
    const prev = chosen.get(key);
    if (
      !prev ||
      row.apr_pct > prev.apr_pct ||
      (row.apr_pct === prev.apr_pct && row.is_vip_only > prev.is_vip_only) ||
      (row.apr_pct === prev.apr_pct && row.is_vip_only === prev.is_vip_only && (row.id ?? 0) > (prev.id ?? 0))
    ) {
      chosen.set(key, row);
    }
  }
  return [...chosen.values()]
    .sort((a, b) => b.timestamp_utc.localeCompare(a.timestamp_utc) || b.apr_pct - a.apr_pct)
    .slice(0, limit);
}

export function getRecentSnapshots(limit?: number): DualAssetSnapshot[];
export function getRecentSnapshots(query?: DualAssetSnapshotQuery): DualAssetSnapshot[];
export function getRecentSnapshots(input: number | DualAssetSnapshotQuery = 100): DualAssetSnapshot[] {
  const db = tryGetDb();
  if (!db) return [];
  const query: DualAssetSnapshotQuery = typeof input === "number" ? { limit: input, dedupe: false } : input;
  const limit = Math.max(1, Math.min(1000, query.limit ?? 100));
  const where: string[] = [];
  const params: Record<string, unknown> = { limit: query.dedupe === false ? limit : Math.min(5000, limit * 8) };
  appendFilter(where, params, {
    coinPair: query.coinPair,
    targetPrice: query.targetPrice,
    directions: query.directions,
    durations: query.durations,
    minAprPct: query.minAprPct,
  });
  const rows = db.prepare(`
    SELECT id, timestamp_utc, timestamp_ict, hour_ict, product_id, coin_pair, direction,
           target_price, apr_pct, lower(duration) AS duration, settlement_utc, index_price,
           is_vip_only, sol_iv_pct, created_at
    FROM apr_snapshots
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY timestamp_utc DESC, apr_pct DESC, id DESC
    LIMIT @limit
  `).all(params) as DualAssetSnapshot[];
  return query.dedupe === false ? rows.slice(0, limit) : dedupeSnapshots(rows, limit);
}

export function getHourlyAvg(opts: {
  coinPair?: string;
  targetPrice?: number;
  days?: number;
  duration?: string;
  durations?: DualAssetDuration[];
  directions?: DualAssetDirection[];
  minAprPct?: number;
} = {}): HourlyAprStat[] {
  const db = tryGetDb();
  if (!db) return [];
  const days = Math.max(1, Math.min(365, opts.days ?? 7));
  const durations = opts.durations ?? (opts.duration ? [opts.duration.toLowerCase() as DualAssetDuration] : undefined);
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  appendFilter(where, params, {
    coinPair: opts.coinPair ?? "SOL-USDT",
    targetPrice: opts.targetPrice,
    directions: opts.directions,
    durations,
    minAprPct: opts.minAprPct,
    days,
  });
  return db.prepare(`
    SELECT hour_ict,
           ROUND(AVG(apr_pct), 2)     AS avg_apr,
           ROUND(MAX(apr_pct), 2)     AS max_apr,
           ROUND(MIN(apr_pct), 2)     AS min_apr,
           ROUND(AVG(index_price), 2) AS avg_price,
           ROUND(AVG(sol_iv_pct), 2)  AS avg_iv,
           COUNT(*)                   AS samples
    FROM apr_snapshots
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY hour_ict
    ORDER BY hour_ict
  `).all(params) as HourlyAprStat[];
}

export function getBestHours(opts: Parameters<typeof getHourlyAvg>[0] & { topN?: number } = {}): HourlyAprStat[] {
  const { topN = 3, ...rest } = opts;
  return getHourlyAvg(rest)
    .slice()
    .sort((a, b) => b.avg_apr - a.avg_apr)
    .slice(0, topN);
}

export function updateDailySummary(
  dateStr: string,
  coinPair = "SOL-USDT",
  opts: {
    durations?: DualAssetDuration[];
    directions?: DualAssetDirection[];
    minAprPct?: number;
  } = {},
): void {
  const db = tryGetDb();
  if (!db) return;
  const where = ["coin_pair = @coinPair", "DATE(timestamp_utc) = @dateStr"];
  const params: Record<string, unknown> = { coinPair, dateStr };
  appendFilter(where, params, {
    durations: opts.durations,
    directions: opts.directions,
    minAprPct: opts.minAprPct,
  });

  const rows = db.prepare(`
    SELECT coin_pair, direction, lower(duration) AS duration, target_price,
           ROUND(AVG(apr_pct), 2)     AS avg_apr,
           ROUND(MAX(apr_pct), 2)     AS max_apr,
           ROUND(MIN(apr_pct), 2)     AS min_apr,
           ROUND(AVG(index_price), 2) AS avg_index_price,
           COUNT(*)                   AS sample_count
    FROM apr_snapshots
    WHERE ${where.join(" AND ")}
    GROUP BY coin_pair, direction, lower(duration), target_price
  `).all(params) as Omit<DailySummary, "date" | "best_hour_ict" | "worst_hour_ict">[];

  const bestHourQ = db.prepare(`
    SELECT hour_ict
    FROM apr_snapshots
    WHERE coin_pair = @coinPair
      AND DATE(timestamp_utc) = @dateStr
      AND direction = @direction
      AND lower(duration) = @duration
      AND target_price = @targetPrice
      ${opts.minAprPct !== undefined ? "AND apr_pct >= @minAprPct" : ""}
    GROUP BY hour_ict
    ORDER BY AVG(apr_pct) DESC
    LIMIT 1
  `);
  const worstHourQ = db.prepare(`
    SELECT hour_ict
    FROM apr_snapshots
    WHERE coin_pair = @coinPair
      AND DATE(timestamp_utc) = @dateStr
      AND direction = @direction
      AND lower(duration) = @duration
      AND target_price = @targetPrice
      ${opts.minAprPct !== undefined ? "AND apr_pct >= @minAprPct" : ""}
    GROUP BY hour_ict
    ORDER BY AVG(apr_pct) ASC
    LIMIT 1
  `);
  const upsert = db.prepare(`
    INSERT INTO daily_summary
      (date, coin_pair, direction, duration, target_price, avg_apr, max_apr, min_apr,
       best_hour_ict, worst_hour_ict, avg_index_price, sample_count)
    VALUES
      (@date, @coin_pair, @direction, @duration, @target_price, @avg_apr, @max_apr, @min_apr,
       @best_hour_ict, @worst_hour_ict, @avg_index_price, @sample_count)
    ON CONFLICT(date, coin_pair, direction, duration, target_price) DO UPDATE SET
      avg_apr = excluded.avg_apr,
      max_apr = excluded.max_apr,
      min_apr = excluded.min_apr,
      best_hour_ict = excluded.best_hour_ict,
      worst_hour_ict = excluded.worst_hour_ict,
      avg_index_price = excluded.avg_index_price,
      sample_count = excluded.sample_count
  `);

  const tx = db.transaction((items: typeof rows) => {
    for (const row of items) {
      const q = {
        coinPair: row.coin_pair,
        dateStr,
        direction: row.direction,
        duration: row.duration,
        targetPrice: row.target_price,
        minAprPct: opts.minAprPct,
      };
      const best = bestHourQ.get(q) as { hour_ict: number } | undefined;
      const worst = worstHourQ.get(q) as { hour_ict: number } | undefined;
      upsert.run({
        date: dateStr,
        ...row,
        best_hour_ict: best?.hour_ict ?? null,
        worst_hour_ict: worst?.hour_ict ?? null,
      });
    }
  });
  tx(rows);
}

export function getDailySummaries(opts: {
  coinPair?: string;
  targetPrice?: number;
  days?: number;
  durations?: DualAssetDuration[];
  directions?: DualAssetDirection[];
  minAprPct?: number;
} = {}): DailySummary[] {
  const db = tryGetDb();
  if (!db) return [];
  const days = Math.max(1, Math.min(365, opts.days ?? 30));
  const where: string[] = [];
  const params: Record<string, unknown> = {};
  appendFilter(where, params, {
    coinPair: opts.coinPair ?? "SOL-USDT",
    targetPrice: opts.targetPrice,
    directions: opts.directions,
    durations: opts.durations,
    minAprPct: opts.minAprPct,
    days,
  });
  return db.prepare(`
    SELECT DATE(timestamp_utc) AS date,
           coin_pair,
           direction,
           lower(duration) AS duration,
           target_price,
           ROUND(AVG(apr_pct), 2) AS avg_apr,
           ROUND(MAX(apr_pct), 2) AS max_apr,
           ROUND(MIN(apr_pct), 2) AS min_apr,
           (
             SELECT hour_ict
             FROM apr_snapshots h
             WHERE h.coin_pair = apr_snapshots.coin_pair
               AND h.direction = apr_snapshots.direction
               AND lower(h.duration) = lower(apr_snapshots.duration)
               AND h.target_price = apr_snapshots.target_price
               AND DATE(h.timestamp_utc) = DATE(apr_snapshots.timestamp_utc)
             GROUP BY hour_ict
             ORDER BY AVG(apr_pct) DESC
             LIMIT 1
           ) AS best_hour_ict,
           (
             SELECT hour_ict
             FROM apr_snapshots h
             WHERE h.coin_pair = apr_snapshots.coin_pair
               AND h.direction = apr_snapshots.direction
               AND lower(h.duration) = lower(apr_snapshots.duration)
               AND h.target_price = apr_snapshots.target_price
               AND DATE(h.timestamp_utc) = DATE(apr_snapshots.timestamp_utc)
             GROUP BY hour_ict
             ORDER BY AVG(apr_pct) ASC
             LIMIT 1
           ) AS worst_hour_ict,
           ROUND(AVG(index_price), 2) AS avg_index_price,
           COUNT(*) AS sample_count
    FROM apr_snapshots
    ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
    GROUP BY date, coin_pair, direction, lower(duration), target_price
    ORDER BY date DESC, target_price ASC, direction ASC, duration ASC
  `).all(params) as DailySummary[];
}

export function getAprIvCorrelation(days = 7): AprIvCorrelation {
  const db = tryGetDb();
  if (!db) return { correlation: null, interpretation: null, samples: 0, message: "Database unavailable" };
  const rows = db.prepare(`
    SELECT apr_pct, sol_iv_pct
    FROM apr_snapshots
    WHERE sol_iv_pct IS NOT NULL
      AND timestamp_utc >= datetime('now', ?)
  `).all(`-${days} days`) as { apr_pct: number; sol_iv_pct: number }[];
  if (rows.length < 10) {
    return { correlation: null, interpretation: null, samples: rows.length, message: "Not enough data points" };
  }
  const aprs = rows.map((row) => row.apr_pct);
  const ivs = rows.map((row) => row.sol_iv_pct);
  const n = rows.length;
  const meanApr = aprs.reduce((sum, x) => sum + x, 0) / n;
  const meanIv = ivs.reduce((sum, x) => sum + x, 0) / n;
  const cov = aprs.reduce((sum, _, i) => sum + (aprs[i] - meanApr) * (ivs[i] - meanIv), 0);
  const stdApr = Math.sqrt(aprs.reduce((sum, x) => sum + (x - meanApr) ** 2, 0));
  const stdIv = Math.sqrt(ivs.reduce((sum, x) => sum + (x - meanIv) ** 2, 0));
  if (stdApr === 0 || stdIv === 0) {
    return { correlation: 0, interpretation: "no variance", samples: n, message: "No variance in data" };
  }
  const corr = +(cov / (stdApr * stdIv)).toFixed(4);
  const interpretation =
    corr > 0.7 ? "Strong positive" :
    corr > 0.4 ? "Moderate positive" :
    corr > -0.4 ? "Weak" :
    corr > -0.7 ? "Moderate negative" :
    "Strong negative";
  return { correlation: corr, interpretation, samples: n, message: `APR vs IV: ${corr} (${n} samples)` };
}

export interface StoreStats {
  available: boolean;
  pairs: string[];
  totalSnapshots: number;
  visibleSnapshots: number;
  samplesLast24h: number;
  lastWriteUtc: string | null;
  lastWriteAgeMs: number | null;
  lastTickUtc: string | null;
  lastTickStatus: string | null;
  lastTickSaved: number | null;
  lastTickRawRows: number | null;
  error?: string;
}

export function getStoreStats(): StoreStats {
  const db = tryGetDb();
  if (!db) {
    return {
      available: false,
      pairs: [],
      totalSnapshots: 0,
      visibleSnapshots: 0,
      samplesLast24h: 0,
      lastWriteUtc: null,
      lastWriteAgeMs: null,
      lastTickUtc: null,
      lastTickStatus: null,
      lastTickSaved: null,
      lastTickRawRows: null,
      error: "DB unavailable",
    };
  }
  try {
    const settings = getDualAssetsSettings(resolveDbPath());
    const total = db.prepare("SELECT COUNT(*) AS n FROM apr_snapshots").get() as { n: number };
    const visible = db.prepare("SELECT COUNT(*) AS n FROM apr_snapshots WHERE apr_pct >= ?").get(settings.minTrackAprPct) as { n: number };
    const last = db.prepare("SELECT timestamp_utc FROM apr_snapshots ORDER BY timestamp_utc DESC LIMIT 1").get() as
      | { timestamp_utc: string }
      | undefined;
    const recent = db
      .prepare("SELECT COUNT(*) AS n FROM apr_snapshots WHERE timestamp_utc >= datetime('now', '-1 day')")
      .get() as { n: number };
    const pairs = (db.prepare("SELECT DISTINCT coin_pair FROM apr_snapshots").all() as { coin_pair: string }[])
      .map((row) => row.coin_pair);
    const tick = db.prepare(`
      SELECT timestamp_utc, status, saved, raw_rows
      FROM tick_runs
      ORDER BY id DESC
      LIMIT 1
    `).get() as { timestamp_utc: string; status: string; saved: number; raw_rows: number } | undefined;
    const lastUtc = last?.timestamp_utc ?? null;
    return {
      available: true,
      pairs,
      totalSnapshots: total.n,
      visibleSnapshots: visible.n,
      samplesLast24h: recent.n,
      lastWriteUtc: lastUtc,
      lastWriteAgeMs: lastUtc ? Date.now() - new Date(lastUtc).getTime() : null,
      lastTickUtc: tick?.timestamp_utc ?? null,
      lastTickStatus: tick?.status ?? null,
      lastTickSaved: tick?.saved ?? null,
      lastTickRawRows: tick?.raw_rows ?? null,
    };
  } catch (err) {
    return {
      available: false,
      pairs: [],
      totalSnapshots: 0,
      visibleSnapshots: 0,
      samplesLast24h: 0,
      lastWriteUtc: null,
      lastWriteAgeMs: null,
      lastTickUtc: null,
      lastTickStatus: null,
      lastTickSaved: null,
      lastTickRawRows: null,
      error: (err as Error).message,
    };
  }
}

export function recordTickRun(row: {
  timestamp_utc?: string;
  saved: number;
  skipped: number;
  dbSkipped?: number;
  trackSkipped?: number;
  rawRows?: number;
  hot?: number;
  apiLatencyMs?: number;
  status?: "ok" | "error";
  error?: string | null;
}): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO tick_runs
      (timestamp_utc, saved, skipped, db_skipped, track_skipped, raw_rows, hot, api_latency_ms, status, error)
    VALUES
      (@timestamp_utc, @saved, @skipped, @db_skipped, @track_skipped, @raw_rows, @hot, @api_latency_ms, @status, @error)
  `).run({
    timestamp_utc: row.timestamp_utc ?? new Date().toISOString(),
    saved: row.saved,
    skipped: row.skipped,
    db_skipped: row.dbSkipped ?? 0,
    track_skipped: row.trackSkipped ?? 0,
    raw_rows: row.rawRows ?? 0,
    hot: row.hot ?? 0,
    api_latency_ms: row.apiLatencyMs ?? null,
    status: row.status ?? "ok",
    error: row.error ?? null,
  });
}

export function hasRecentAlert(snapshot: DualAssetSnapshot, cooldownMs = 6 * 60 * 60 * 1000): boolean {
  const db = tryGetDb();
  if (!db) return false;
  const since = new Date(Date.now() - cooldownMs).toISOString();
  const row = db.prepare(`
    SELECT id
    FROM alert_events
    WHERE coin_pair = @coinPair
      AND direction = @direction
      AND lower(duration) = @duration
      AND target_price = @targetPrice
      AND product_id = @productId
      AND timestamp_utc >= @since
    LIMIT 1
  `).get({
    coinPair: snapshot.coin_pair,
    direction: snapshot.direction,
    duration: snapshot.duration.toLowerCase(),
    targetPrice: snapshot.target_price,
    productId: snapshot.product_id ?? "",
    since,
  });
  return Boolean(row);
}

export function recordAlert(snapshot: DualAssetSnapshot, thresholdPct: number): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO alert_events
      (timestamp_utc, coin_pair, direction, duration, target_price, apr_pct, threshold_pct, product_id)
    VALUES
      (@timestamp_utc, @coin_pair, @direction, @duration, @target_price, @apr_pct, @threshold_pct, @product_id)
  `).run({
    timestamp_utc: snapshot.timestamp_utc,
    coin_pair: snapshot.coin_pair,
    direction: snapshot.direction,
    duration: snapshot.duration.toLowerCase(),
    target_price: snapshot.target_price,
    apr_pct: snapshot.apr_pct,
    threshold_pct: thresholdPct,
    product_id: snapshot.product_id ?? "",
  });
}

export function getAlertEvents(limit = 50): AlertEvent[] {
  const db = tryGetDb();
  if (!db) return [];
  return db.prepare(`
    SELECT id, timestamp_utc, coin_pair, direction, lower(duration) AS duration, target_price,
           apr_pct, threshold_pct, product_id, created_at
    FROM alert_events
    ORDER BY timestamp_utc DESC, id DESC
    LIMIT ?
  `).all(Math.max(1, Math.min(500, limit))) as AlertEvent[];
}

export function closeDb(): void {
  if (_db) {
    _db.close();
    _db = null;
    _openFailed = false;
  }
}
