# ADR-004: SQLite (better-sqlite3) for Bybit APR time-series

**Status:** accepted · 2026-04-28
**Decision-makers:** project owner · orchestrator session
**Relates to:** [ADR-003](./ADR-003-jsonl-alerts.md) — alerts stay on JSONL; this ADR is scoped to the Bybit Dual-Asset APR domain only

## Context

Phase 5A introduces a Bybit Dual-Asset APR tracker. The schema captures two tables:

- **`apr_snapshots`** — 1 row per (timestamp, coin_pair, target_price, duration, direction). Cadence: every 5 min × ~6 target prices × 2 durations = **~144 rows/hour, ~3.5k/day**.
- **`daily_summary`** — pre-aggregated per (date, coin_pair, target_price). Refreshed once per day from `apr_snapshots`.

Reads are dominated by aggregations:

```sql
-- get_hourly_avg() — drives the "best hour to enter" UI
SELECT hour_ict, AVG(apr_pct), MAX(apr_pct), MIN(apr_pct), COUNT(*)
FROM apr_snapshots
WHERE coin_pair = ? AND target_price = ? AND timestamp_utc >= ?
GROUP BY hour_ict ORDER BY hour_ict;
```

This is exactly the access pattern ADR-003 calls out as a JSONL migration trigger (#2 "joins/aggregations" + #4 "indexed range queries"). JSONL would scan the entire log on every read.

## Decision

**Introduce `better-sqlite3` as a workspace dependency, but scope its use to the Bybit APR domain.**

- New file: `apps/alerts/data/bybit-apr.sqlite` (gitignored, alongside existing `alerts.jsonl`)
- New module: `packages/sources/src/bybit/apr-store.ts` — server-only, exported from `@pulse/sources/server`
- Cron worker `apps/alerts/src/bybit-apr-worker.ts` writes; web `/api/bybit/apr/*` and MCP `get_bybit_apr_summary` read
- **`apps/alerts/data/alerts.jsonl` stays on JSONL** — its access pattern (read-all-then-filter, ~33KB/day) does not justify the migration cost. ADR-003 stands.

### Why not Postgres / DuckDB / Parquet?

| Option | Pro | Con |
|--------|-----|-----|
| **SQLite (better-sqlite3)** ✅ | embedded, sync API, ACID, WAL, zero ops, queries < 1ms at this scale | native binary per platform |
| Postgres | concurrent writes, network access | needs ops, overkill for 1.2k rows/day |
| DuckDB | vectorized OLAP | overkill, larger binary |
| Parquet + arrow | columnar | no in-place writes, app must re-write on append |

At current cadence (1.2k–2.4k rows/day → ~440k rows/year, ~30MB/year) SQLite is the right size. WAL mode handles single writer + many readers cleanly. `better-sqlite3` is sync (no async overhead in hot path) and used widely in Node/Electron.

## Schema

TypeScript-friendly column names:

```sql
CREATE TABLE IF NOT EXISTS apr_snapshots (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  ts_utc          TEXT NOT NULL,            -- ISO 8601 UTC, e.g. "2026-04-28T15:00:00Z"
  ts_ict          TEXT NOT NULL,            -- ISO 8601 ICT (Bangkok, UTC+7)
  hour_ict        INTEGER NOT NULL,         -- 0..23, denormalized for GROUP BY
  coin_pair       TEXT NOT NULL DEFAULT 'SOL-USDT',
  direction       TEXT NOT NULL DEFAULT 'BuyLow',  -- 'BuyLow' | 'SellHigh'
  target_price    REAL NOT NULL,
  apr_pct         REAL NOT NULL,
  duration        TEXT NOT NULL,            -- e.g. "16h", "1d", "7d"
  settlement_utc  TEXT,
  index_price     REAL,
  is_vip_only     INTEGER DEFAULT 0,        -- 0/1, SQLite has no bool
  iv_pct          REAL,                     -- spot IV at snapshot time, optional
  created_at      TEXT DEFAULT (datetime('now')),

  UNIQUE(ts_ict, coin_pair, target_price, duration, direction)
);

CREATE INDEX IF NOT EXISTS idx_apr_hour ON apr_snapshots(hour_ict);
CREATE INDEX IF NOT EXISTS idx_apr_pair_target ON apr_snapshots(coin_pair, target_price);
CREATE INDEX IF NOT EXISTS idx_apr_ts ON apr_snapshots(ts_utc);

CREATE TABLE IF NOT EXISTS daily_summary (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  date             TEXT NOT NULL,           -- YYYY-MM-DD (UTC)
  coin_pair        TEXT NOT NULL DEFAULT 'SOL-USDT',
  target_price     REAL NOT NULL,
  avg_apr          REAL,
  max_apr          REAL,
  min_apr          REAL,
  best_hour_ict    INTEGER,
  worst_hour_ict   INTEGER,
  avg_index_price  REAL,
  sample_count     INTEGER,
  created_at       TEXT DEFAULT (datetime('now')),

  UNIQUE(date, coin_pair, target_price)
);
```

**WAL mode** must be enabled at open: `db.pragma('journal_mode = WAL')`.

## Module shape

```ts
// packages/sources/src/bybit/apr-store.ts (server-only)
import Database from "better-sqlite3";

export interface AprSnapshot {
  tsUtc: string;
  tsIct: string;
  hourIct: number;
  coinPair: string;
  direction: "BuyLow" | "SellHigh";
  targetPrice: number;
  aprPct: number;
  duration: string;
  settlementUtc?: string;
  indexPrice?: number;
  isVipOnly?: boolean;
  ivPct?: number;
}

export interface HourlyAvg {
  hourIct: number;
  avgApr: number;
  maxApr: number;
  minApr: number;
  avgPrice: number;
  avgIv: number;
  samples: number;
}

export function openAprStore(dbPath: string): AprStore;

export interface AprStore {
  saveSnapshot(s: AprSnapshot): boolean;     // false on UNIQUE conflict
  getHourlyAvg(opts: { coinPair?: string; targetPrice?: number; days?: number }): HourlyAvg[];
  getBestHours(opts: { coinPair?: string; targetPrice?: number; days?: number; topN?: number }): HourlyAvg[];
  refreshDailySummary(date: string, coinPair?: string): void;
  close(): void;
}
```

Single instance per process. Cron worker holds it for the worker's lifetime; web API routes reopen on each request (cheap with WAL — re-read maps the same file).

## Write path

`apps/alerts/src/bybit-apr-worker.ts` (new pm2 service `pulse-bybit-apr` OR added as a second cron inside existing `pulse-alerts` — TBD by Cursor based on failure-isolation needs):

1. Every 15 min: pull current dual-asset APRs from Bybit public API (no auth required for product list)
2. For each (target_price, duration) tuple → build `AprSnapshot`
3. `store.saveSnapshot()` — `false` return = duplicate, drop silently
4. Once per day at 00:30 UTC → `store.refreshDailySummary(yesterday)`

## Read path

- **Web:** `apps/web/app/api/bybit/apr/hourly/route.ts` → `store.getHourlyAvg(...)`
- **MCP:** new tool `get_bybit_apr_summary({ coin_pair?, target_price?, days? })` in `apps/mcp/src/index.ts` → same `store.getHourlyAvg(...)` via `@pulse/sources/server`
- **Hub cache:** NOT required initially — SQLite reads at this scale (< 1ms) are faster than HTTP round-trip to hub

## Failure modes

| Failure | Behavior |
|---------|----------|
| `better-sqlite3` native build fails on install | `pnpm rebuild better-sqlite3` documented in QUICKSTART; falls back to read-only stub if module fails to load |
| DB file corrupt | WAL checkpoint truncate at startup; if still bad, rename to `.corrupt-<ts>` and start fresh — APR data is recoverable from Bybit |
| Disk full | Worker logs error, skips write, continues. Next snapshot retries. |
| Concurrent writers (future) | WAL mode handles it; but design assumes single writer (one cron worker). |

## Migration from existing data

N/A — no historical data to migrate. APR history accrues from the live cron tick; for manual seeding before the tick has run, use `node --import tsx scripts/dual-assets-tick.mjs --rollup` (see [docs/DUAL-ASSETS.md](./DUAL-ASSETS.md)).

## Dependency cost

- `better-sqlite3` ≈ 5MB native binary per platform (Win x64, macOS arm64, Linux x64 prebuilt by package)
- Single workspace dep, added to `packages/sources/package.json` (server-only consumers)
- Build time impact: prebuilt binaries → no compile step required for supported platforms

## Out of scope (deferred)

- Migrating `alerts.jsonl` → SQLite (ADR-003 still holds; revisit only if its triggers fire)
- Options OI history storage (will be addressed by a future ADR if/when the options pipeline needs persistence beyond hub cache)
- Cross-table joins between alerts and APR (no current need)

## Consequences

### Positive
- Aggregation queries (GROUP BY hour, MAX, AVG) run in < 1ms at this scale — no full-scan cost
- ACID guarantees on writes — no partial-row corruption
- Schema enforces shape (UNIQUE constraint dedupes naturally)
- `daily_summary` pre-aggregation is a single SQL statement, not a JS reduce loop

### Negative
- New native dep — first `pnpm install` on a platform without prebuilt binary will compile (~30s)
- Binary file: not hand-editable, not greppable. Mitigated by `sqlite3 bybit-apr.sqlite` CLI being widely available.
- Slightly more complex backup story than `cp alerts.jsonl` — must `sqlite3 .backup` for a consistent snapshot

### Neutral
- Two storage technologies in the repo (JSONL for alerts + SQLite for Bybit APR). Acceptable: each is sized to its access pattern. Promotes ADR-003 trigger discipline rather than premature unification.
