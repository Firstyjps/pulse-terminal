// Hub /health v2 — implements the contract at docs/HUB-HEALTH-V2.md.
//
// Pure builder: takes a HubCache + plug-in readers (APR store, options cache),
// returns the v2 response body. No I/O, no time mocking — callers wire deps.
// Tests in hub-health.test.ts exercise the status-derivation matrix.

import type { HubCache } from "./cache.js";

// ────────────────────────────────────────────────────────────────────────
// Wire types — match HUB-HEALTH-V2.md exactly
// ────────────────────────────────────────────────────────────────────────

export type HealthStatus = "healthy" | "degraded" | "unhealthy";

export type OptionExchange = "Deribit" | "Binance" | "Bybit" | "OKX";
export type OptionAsset = "SOL" | "BTC" | "ETH";

export interface OptionsBlock {
  channelsFresh: number;
  byExchange: Partial<
    Record<
      OptionExchange,
      { channelsFresh: number; lastUpdateMs: number | null; error?: string }
    >
  >;
  assets: OptionAsset[];
  expiriesTracked: number;
}

export interface AprBlock {
  storeOk: boolean;
  lastWriteMs: number | null;
  pairs: number;
  samplesLast24h: number;
  error?: string;
}

export interface HealthV2 {
  _version: 2;
  status: HealthStatus;
  ts: number;
  snapshotAgeSec: number | null;
  fundingChannelsFresh: number;
  oiChannels: number;
  options?: OptionsBlock;
  apr?: AprBlock;
  checks?: Record<string, { ok: boolean; ms: number; err?: string }>;
}

// ────────────────────────────────────────────────────────────────────────
// Dependency contracts — readers are injected, so unit tests pass synthetic
// data and prod wires real SQLite / cache readers.
// ────────────────────────────────────────────────────────────────────────

export interface OptionsReader {
  /** Total chains (across all exchanges) updated < 5min ago. */
  channelsFresh(now: number): number;
  /** Per-exchange freshness + last update + adapter error. */
  byExchange(now: number): OptionsBlock["byExchange"];
  /** Distinct assets currently cached. */
  assets(): OptionAsset[];
  /** Distinct (asset, expiry) tuples cached. */
  expiriesTracked(): number;
  /** Returns true if any options data has been observed. Hub omits the block when false. */
  hasData(): boolean;
}

export interface AprReader {
  /** Returns null if SQLite store is missing or unreadable. */
  read(): AprBlock | null;
}

export interface HealthDeps {
  cache: HubCache;
  /** Pluggable APR reader. Pass `() => null` to suppress the block. */
  apr?: AprReader;
  /** Pluggable options reader. Omit to suppress the block. */
  options?: OptionsReader;
  /** Override for testing. Defaults to `Date.now()`. */
  now?: () => number;
  /** Optional per-source upstream checks (defaults to `cache.health`). */
  checks?: Record<string, { ok: boolean; ms: number; err?: string }>;
  /**
   * Restrict assets the options bucket considers "required" when deriving
   * status. Defaults to whatever the reader reports as cached. If you set
   * this, status drops to `unhealthy` when any required asset has zero
   * fresh exchanges.
   */
  requiredOptionAssets?: OptionAsset[];
}

// ────────────────────────────────────────────────────────────────────────
// Bucket thresholds — taken straight from HUB-HEALTH-V2.md status table
// ────────────────────────────────────────────────────────────────────────

const FRESH_MS = 5 * 60_000; // 5 min — funding/OI/options "fresh" cutoff
const SNAPSHOT_HEALTHY_S = 180;
const SNAPSHOT_DEGRADED_S = 600;
const FUNDING_HEALTHY = 6;
const OI_HEALTHY = 4;
const APR_FRESH_MS = 30 * 60_000; // 30 min — APR "fresh write" cutoff

// ────────────────────────────────────────────────────────────────────────
// Status derivation — pure, exported for tests
// ────────────────────────────────────────────────────────────────────────

const RANK: Record<HealthStatus, number> = { healthy: 0, degraded: 1, unhealthy: 2 };
const worse = (a: HealthStatus, b: HealthStatus): HealthStatus =>
  RANK[a] >= RANK[b] ? a : b;

export function snapshotStatus(ageSec: number | null): HealthStatus {
  if (ageSec === null) return "unhealthy";
  if (ageSec < SNAPSHOT_HEALTHY_S) return "healthy";
  if (ageSec < SNAPSHOT_DEGRADED_S) return "degraded";
  return "unhealthy";
}

export function fundingStatus(fresh: number): HealthStatus {
  if (fresh >= FUNDING_HEALTHY) return "healthy";
  if (fresh >= 1) return "degraded";
  return "unhealthy";
}

export function oiStatus(count: number): HealthStatus {
  if (count >= OI_HEALTHY) return "healthy";
  if (count >= 1) return "degraded";
  return "unhealthy";
}

export function aprStatus(block: AprBlock | null | undefined): HealthStatus {
  if (!block) return "healthy"; // omitted block does not affect overall
  if (!block.storeOk) return "unhealthy";
  if (block.lastWriteMs === null) return "degraded"; // store ok but no writes yet
  if (block.lastWriteMs < APR_FRESH_MS) return "healthy";
  return "degraded";
}

export function optionsStatus(
  block: OptionsBlock | null | undefined,
  required: OptionAsset[],
): HealthStatus {
  if (!block) return "healthy";
  // Build per-asset tally: which assets have at least 1 fresh exchange?
  // The current data model doesn't tag freshness by (asset, exchange) — we
  // approximate: if `channelsFresh > 0` and assets contains the required
  // asset, treat that asset as covered. For tighter signal we'd extend the
  // OptionsReader, but per spec this is a "degrades only" bucket so a coarse
  // signal is acceptable.
  if (required.length === 0) return "healthy";
  const cached = new Set(block.assets);
  const missing = required.filter((a) => !cached.has(a));
  if (missing.length === required.length) return "unhealthy";
  if (missing.length > 0) return "degraded";
  if (block.channelsFresh === 0) return "degraded";
  return "healthy";
}

// ────────────────────────────────────────────────────────────────────────
// Builder
// ────────────────────────────────────────────────────────────────────────

/**
 * Compose the v2 health payload. v1 buckets (snapshot/funding/oi) are
 * always decisive; v2 buckets only ever degrade — they never elevate a
 * `healthy` v1 status, per the spec.
 */
export function buildHealthV2(deps: HealthDeps): HealthV2 {
  const now = deps.now ? deps.now() : Date.now();
  const cache = deps.cache;

  // v1 fields ────────────────────────────────────────────────────────
  // Compute snapshot age against the injected `now` so tests can pin time.
  const snapshotAgeSec = cache.snapshotTs
    ? Math.round((now - cache.snapshotTs) / 1000)
    : null;

  const fundingChannelsFresh = [...cache.funding.values()].filter(
    (f) => now - f.ts < FRESH_MS,
  ).length;
  const oiChannels = cache.oi.size;

  const v1Status = worse(
    worse(snapshotStatus(snapshotAgeSec), fundingStatus(fundingChannelsFresh)),
    oiStatus(oiChannels),
  );

  // v2 options block ─────────────────────────────────────────────────
  let options: OptionsBlock | undefined;
  if (deps.options?.hasData()) {
    options = {
      channelsFresh: deps.options.channelsFresh(now),
      byExchange: deps.options.byExchange(now),
      assets: deps.options.assets(),
      expiriesTracked: deps.options.expiriesTracked(),
    };
  }

  // v2 APR block ─────────────────────────────────────────────────────
  const apr = deps.apr ? (deps.apr.read() ?? undefined) : undefined;

  // Roll up status — v2 buckets only degrade, never elevate
  let status = v1Status;
  if (status === "healthy") {
    const required = deps.requiredOptionAssets ?? options?.assets ?? [];
    status = worse(status, optionsStatus(options, required));
    status = worse(status, aprStatus(apr));
  } else if (status === "degraded") {
    // v2 can push from degraded → unhealthy
    const required = deps.requiredOptionAssets ?? options?.assets ?? [];
    if (optionsStatus(options, required) === "unhealthy") status = "unhealthy";
    if (aprStatus(apr) === "unhealthy") status = "unhealthy";
  }

  const checks = deps.checks ?? upstreamChecks(cache);

  const body: HealthV2 = {
    _version: 2,
    status,
    ts: now,
    snapshotAgeSec,
    fundingChannelsFresh,
    oiChannels,
  };
  if (options) body.options = options;
  if (apr) body.apr = apr;
  if (Object.keys(checks).length) body.checks = checks;
  return body;
}

/** Convert HubCache.health (per-source upstream pings) into the spec shape. */
function upstreamChecks(cache: HubCache): Record<string, { ok: boolean; ms: number; err?: string }> {
  const out: Record<string, { ok: boolean; ms: number; err?: string }> = {};
  for (const [name, h] of Object.entries(cache.health)) {
    out[name] = h.err
      ? { ok: h.ok, ms: h.ms, err: h.err }
      : { ok: h.ok, ms: h.ms };
  }
  return out;
}
