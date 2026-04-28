# Hub `/health` v2 — contract for Phase 5A signals

**Status:** spec · 2026-04-28
**Owner:** Role 7 (Realtime Agent) · this doc owned by orchestrator
**Implements:** [ADR-004](./ADR-004-sqlite-bybit-apr.md) observability requirements
**Supersedes:** v1 hub-health shape currently documented inline in [AGENTS.md](../AGENTS.md#phase-3--mcp-first-refactor-active)

## Why a v2

Phase 5A introduces two new data domains the hub will cache and the status
script + MCP tool surface need to reason about:

- **Options chain** — multi-exchange (Deribit / Binance / Bybit / OKX),
  multi-asset (SOL / BTC / ETH), multi-expiry. Many channels, freshness
  varies by exchange, partial outages are routine.
- **Bybit dual-asset APR** — single SQLite store written by `pulse-alerts`,
  read by web + MCP. The hub doesn't write it but should report whether
  reads succeed and how recent the last write is, so a degraded writer
  surfaces in `pnpm pulse:status`.

The v1 shape only covers funding + OI. Adding options + APR fields requires
a clear contract so consumers (`scripts/pulse-status.mjs`, web `/api/health`,
the future "alerts on alerts" cron) don't break each time.

## Compatibility rule

**v2 is a strict superset of v1.** Every existing field stays. New fields
are optional from a consumer's perspective — old consumers continue to work.
Servers running v1 still pass v2 validation if they ship `_version: 1`.

## Versioning

```ts
{
  _version: 2,        // bumped from absent (v1) → 2 (this spec)
  status: "...",
  ...
}
```

Consumers MAY check `_version` and degrade UI when older. Servers MUST
emit `_version: 2` once they implement any v2 field.

## Full v2 shape

```ts
GET /health
→ 200 (always — pm2 uses TCP probe, body is for humans)
{
  _version: 2,
  status: "healthy" | "degraded" | "unhealthy",
  ts: number,                          // unix ms

  // ── v1 fields (unchanged) ────────────────────────────────────────
  snapshotAgeSec: number,              // seconds since fundflow snapshot last refreshed
  fundingChannelsFresh: number,        // funding entries with ts < 5min ago
  oiChannels: number,                  // count of OI entries cached (any age)

  // ── v2 — options chain ───────────────────────────────────────────
  options?: {
    channelsFresh: number,             // option chains updated < 5min ago, summed across exchanges
    byExchange: {
      [exchange in OptionExchange]?: {
        channelsFresh: number,         // chains for this exchange < 5min old
        lastUpdateMs: number | null,   // ms since most-recent update; null if never
        error?: string,                // last error string, if adapter is failing
      }
    },
    assets: OptionAsset[],             // distinct assets currently cached
    expiriesTracked: number,           // distinct (asset, expiry) tuples
  },

  // ── v2 — Bybit APR store ─────────────────────────────────────────
  apr?: {
    storeOk: boolean,                  // SQLite open + readable
    lastWriteMs: number | null,        // ms since last successful saveSnapshot; null if no writes
    pairs: number,                     // distinct coin_pair values seen in apr_snapshots
    samplesLast24h: number,            // COUNT(*) WHERE timestamp_utc >= now - 24h
    error?: string,                    // last open/read error, if any
  },

  // ── v1 checks block (unchanged) ──────────────────────────────────
  checks?: {
    [name: string]: { ok: boolean; ms: number; err?: string }
  }
}
```

Where `OptionExchange` = `"Deribit" | "Binance" | "Bybit" | "OKX"` and
`OptionAsset` = `"SOL" | "BTC" | "ETH"` per `packages/sources/src/options/types.ts`.

## Status derivation

The top-level `status` field rolls up all signals:

| Bucket | `healthy` | `degraded` | `unhealthy` |
|--------|-----------|------------|-------------|
| Snapshot | age < 180s | 180s ≤ age < 600s | age ≥ 600s |
| Funding | ≥ 6 fresh channels | 1-5 fresh | 0 fresh |
| OI | ≥ 4 entries cached | 1-3 | 0 |
| **Options** (v2) | ≥ 1 exchange fresh per requested asset | some fresh, others stale | no exchange fresh for a requested asset |
| **APR store** (v2) | `storeOk` + `lastWriteMs` < 30min | `storeOk` + lastWrite > 30min | `storeOk: false` |

The overall status is the **worst** of any bucket. v1 buckets stay decisive;
v2 buckets only degrade — they never elevate a `healthy` v1 result, so an
options outage does not page someone if funding + OI are working.

## Examples

### Healthy, full v2

```json
{
  "_version": 2,
  "status": "healthy",
  "ts": 1745842200000,
  "snapshotAgeSec": 42,
  "fundingChannelsFresh": 18,
  "oiChannels": 12,
  "options": {
    "channelsFresh": 87,
    "byExchange": {
      "Deribit": { "channelsFresh": 52, "lastUpdateMs": 18000 },
      "Binance": { "channelsFresh": 14, "lastUpdateMs": 22000 },
      "Bybit":   { "channelsFresh": 12, "lastUpdateMs": 31000 },
      "OKX":     { "channelsFresh": 9,  "lastUpdateMs": 45000 }
    },
    "assets": ["BTC", "ETH", "SOL"],
    "expiriesTracked": 24
  },
  "apr": {
    "storeOk": true,
    "lastWriteMs": 42000,
    "pairs": 1,
    "samplesLast24h": 96
  }
}
```

### Degraded — APR worker is down

```json
{
  "_version": 2,
  "status": "degraded",
  "snapshotAgeSec": 65,
  "fundingChannelsFresh": 18,
  "oiChannels": 12,
  "apr": {
    "storeOk": true,
    "lastWriteMs": 5_400_000,
    "pairs": 1,
    "samplesLast24h": 80
  }
}
```

### Unhealthy — SQLite store missing

```json
{
  "_version": 2,
  "status": "unhealthy",
  "apr": {
    "storeOk": false,
    "lastWriteMs": null,
    "pairs": 0,
    "samplesLast24h": 0,
    "error": "SQLITE_CANTOPEN: unable to open database file"
  }
}
```

## Implementation notes for Role 7 (Realtime Agent)

1. **Hub does NOT write to `bybit-apr.sqlite`** — only `pulse-alerts` writes (per ADR-004). Hub opens read-only on demand to compute `apr.*` fields.
2. **Open mode:** `new Database(path, { readonly: true, fileMustExist: false })`. If the file does not exist yet, return `{ storeOk: false, error: "store not initialized" }` — this is the normal pre-first-write state, NOT an error to alert on.
3. **Caching:** the hub's existing in-memory cache (per [Phase 3B](../AGENTS.md#phase-b--hub-http-cache-v0-only-30-min)) holds options data already; `options.*` reads it directly with no extra I/O. APR queries must be fast — index `(timestamp_utc)` already exists per ADR-004 schema, so `MAX(timestamp_utc)` and `COUNT(*) WHERE ts >= ?` are O(log n).
4. **Cost ceiling:** the entire `/health` response must compute in < 50ms cold. If APR queries grow expensive, add a 10s in-memory cache for the `apr` block specifically.
5. **No auth** — hub binds to `127.0.0.1` only. Same threat model as v1.

## Consumer migration plan

| Consumer | Action |
|----------|--------|
| `scripts/pulse-status.mjs` | Add a `v2 ?` block that prints `options.channelsFresh` per exchange + `apr.lastWriteMs` formatted (e.g. "42s ago"). Render nothing if `_version` < 2. |
| `apps/web/app/api/health/route.ts` | Already proxies hub `/health` into its `hub:` block. Pass-through — no changes needed. |
| MCP tool `get_pulse_status` (future) | New tool reads `/health` and renders a one-paragraph summary suited for Claude Desktop. Out of scope for this ADR. |

## Out of scope (v3 candidates)

- Per-strike OI freshness (would balloon response size — 100s of strikes × 4 exchanges × 3 assets)
- Historical health series (move to a metrics endpoint, not `/health`)
- Auth — when hub is exposed beyond localhost
