// Macro Regime Indicator — rules v1 (per ROADMAP.md decision Q3, Action 1 Week 2-3).
//
// Hybrid plan in roadmap is rules-base + LLM override on edge cases. v1 is
// rules-only and pure: an LLM layer can wrap this later by inspecting `signals`
// + `score` and overriding `regime` when the rules straddle a threshold.
//
// Output target: a single regime chip + reason string for the morning brief
// (acceptance criterion in ROADMAP.md L49).
//
// 2026-05-02: added disk persistence. The store atomically writes the latest
// snapshot to `data/last-regime.json` on every successful tick and hydrates
// from that file on construction. After `pm2 restart pulse-realtime`, the
// hub serves the last known reading with `_isStale: true` until the first
// fresh tick lands — replaces the previous 503 cold-start window.

import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Public types
// ─────────────────────────────────────────────────────────────────────────────

export type Regime = "Risk-On" | "Risk-Off" | "Range";

export interface RegimeReading {
  /** BTC dominance, percent (e.g. 56.4). */
  dominance: number;
  /** US Dollar Index level (e.g. 105.7). */
  dxy: number;
  /** Binance perp 8h funding rate %, BTCUSDT. */
  btcFunding: number;
  /** Binance perp 8h funding rate %, ETHUSDT. */
  ethFunding: number;
  /** Binance perp 8h funding rate %, SOLUSDT. */
  solFunding: number;
  /** Optional Deribit BTC volatility index. */
  btcVix?: number;
}

export interface RegimeSignals {
  btcDomRising: boolean;
  btcDomFalling: boolean;
  btcDomHigh: boolean;
  dxyRising: boolean;
  dxyFalling: boolean;
  dxyHigh: boolean;
  dxyWeak: boolean;
  fundingNegativeCluster: boolean;
  fundingPositiveCluster: boolean;
  riskOffCount: 0 | 1 | 2 | 3;
  riskOnCount: 0 | 1 | 2 | 3;
  hasPrior: boolean;
}

export interface RegimeSnapshot {
  regime: Regime;
  /** Composite intensity in [-1, 1]. -1 = max bearish; +1 = max bullish. */
  score: number;
  /** Human-readable reason string for the chip tooltip. */
  reason: string;
  /** Snapshot generation time (ms since epoch). */
  ts: number;
  /** Inputs used for the verdict — echoed back for debug + UI display. */
  reading: RegimeReading;
  signals: RegimeSignals;
}

export interface ComputeRegimeOpts {
  current: RegimeReading;
  /** Reading from ~24h ago. Omit on first run; trend signals collapse to false. */
  prior?: RegimeReading;
  /** Override now() for deterministic tests. */
  now?: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Thresholds — tuned from common desk heuristics; adjust here, not at call sites
// ─────────────────────────────────────────────────────────────────────────────

const HIGH_DOM = 55;          // BTC dominance ceiling for the "alts bleeding" reading
const HIGH_DXY = 106;         // DXY firming → USD strong
const WEAK_DXY = 104;         // DXY < 104 → USD soft, risk-on tailwind
const FUNDING_POS = 0.01;     // > +0.01% counts as positive cluster member
const TREND_EPS_DOM = 0.1;    // movement < 0.1pp on dom is noise
const TREND_EPS_DXY = 0.05;   // movement < 0.05 DXY pts is noise
const VIX_PANIC = 70;         // BTC vol index spike → score nudge
const VIX_NUDGE = 0.2;

// Store window: a "prior" reading must be at least 6h old (otherwise trend is
// just intra-cycle noise) and no more than 30h old (else stale).
const MIN_PRIOR_AGE_MS = 6 * 60 * 60_000;
const MAX_PRIOR_AGE_MS = 30 * 60 * 60_000;
const HISTORY_RETAIN_MS = 30 * 60 * 60_000;
const TARGET_PRIOR_AGE_MS = 24 * 60 * 60_000;

// ─────────────────────────────────────────────────────────────────────────────
// Pure compute — testable, no I/O, no time
// ─────────────────────────────────────────────────────────────────────────────

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n));
const round3 = (n: number) => Math.round(n * 1000) / 1000;

export function computeRegime(opts: ComputeRegimeOpts): RegimeSnapshot {
  const c = opts.current;
  const p = opts.prior;
  const now = opts.now ?? Date.now();

  const domDelta = p ? c.dominance - p.dominance : 0;
  const dxyDelta = p ? c.dxy - p.dxy : 0;

  const btcDomRising = domDelta > TREND_EPS_DOM;
  const btcDomFalling = domDelta < -TREND_EPS_DOM;
  const dxyRising = dxyDelta > TREND_EPS_DXY;
  const dxyFalling = dxyDelta < -TREND_EPS_DXY;

  const btcDomHigh = c.dominance > HIGH_DOM;
  const dxyHigh = c.dxy > HIGH_DXY;
  const dxyWeak = c.dxy < WEAK_DXY;

  const fundings = [c.btcFunding, c.ethFunding, c.solFunding];
  const negCount = fundings.filter((f) => f < 0).length;
  const posCount = fundings.filter((f) => f > FUNDING_POS).length;
  const fundingNegativeCluster = negCount >= 2;
  const fundingPositiveCluster = posCount >= 2;

  // Risk-Off: 2+ of three triggers
  const riskOffTriggers = [
    btcDomRising && btcDomHigh,
    dxyRising && dxyHigh,
    fundingNegativeCluster,
  ];
  const riskOffCount = riskOffTriggers.filter(Boolean).length as 0 | 1 | 2 | 3;

  // Risk-On: ALL THREE triggers (per task spec — conservative gate)
  const riskOnTriggers = [btcDomFalling, fundingPositiveCluster, dxyWeak];
  const riskOnCount = riskOnTriggers.filter(Boolean).length as 0 | 1 | 2 | 3;

  let regime: Regime;
  const reasonParts: string[] = [];

  if (riskOffCount >= 2) {
    regime = "Risk-Off";
    if (btcDomRising && btcDomHigh) {
      reasonParts.push(`BTC dom ${c.dominance.toFixed(1)}% rising`);
    }
    if (dxyRising && dxyHigh) {
      reasonParts.push(`DXY ${c.dxy.toFixed(1)} firming`);
    }
    if (fundingNegativeCluster) {
      reasonParts.push(`funding negative on ${negCount}/3 majors`);
    }
  } else if (riskOnCount === 3) {
    regime = "Risk-On";
    reasonParts.push(`BTC dom falling to ${c.dominance.toFixed(1)}%`);
    reasonParts.push(`funding positive on ${posCount}/3 majors`);
    reasonParts.push(`DXY soft at ${c.dxy.toFixed(1)}`);
  } else {
    regime = "Range";
    if (riskOffCount === 1) reasonParts.push("one risk-off trigger (need 2+)");
    if (riskOnCount > 0 && riskOnCount < 3) {
      reasonParts.push(`${riskOnCount}/3 risk-on triggers (need 3)`);
    }
    if (riskOffCount === 0 && riskOnCount === 0) {
      reasonParts.push("no decisive macro signal");
    }
    if (!p) reasonParts.push("no prior reading — trend signals neutral");
  }

  // Score: signed by net trigger count, intensity scales with net.
  let score = (riskOnCount - riskOffCount) / 3;
  if (c.btcVix !== undefined && c.btcVix > VIX_PANIC) {
    score = clamp(score - VIX_NUDGE, -1, 1);
  }

  return {
    regime,
    score: round3(clamp(score, -1, 1)),
    reason: reasonParts.join("; ") || "neutral",
    ts: now,
    reading: c,
    signals: {
      btcDomRising,
      btcDomFalling,
      btcDomHigh,
      dxyRising,
      dxyFalling,
      dxyHigh,
      dxyWeak,
      fundingNegativeCluster,
      fundingPositiveCluster,
      riskOffCount,
      riskOnCount,
      hasPrior: !!p,
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Stateful store — records readings, finds 24h-prior, exposes latest snapshot
// ─────────────────────────────────────────────────────────────────────────────

interface HistoryEntry {
  ts: number;
  reading: RegimeReading;
}

export interface RegimeStoreOpts {
  /**
   * Disk path for the persisted-snapshot file. Pass an explicit string to
   * override; pass `null` to disable persistence; omit to use the default
   * (off in vitest, `./data/last-regime.json` otherwise — env var
   * `REGIME_PERSIST_PATH` overrides). History is NOT persisted — only the
   * latest snapshot. `findPrior` computes against in-memory history only;
   * after a restart the next tick computes with `prior: undefined` until
   * fresh history accumulates (same as today's first-ever-boot path).
   */
  persistPath?: string | null;
}

function defaultPersistPath(): string | undefined {
  // vitest sets VITEST=true; keep tests in-memory unless they pass a tmp path.
  if (process.env.VITEST) return undefined;
  return process.env.REGIME_PERSIST_PATH || "./data/last-regime.json";
}

export class RegimeStore {
  private latest: RegimeSnapshot | null = null;
  private history: HistoryEntry[] = [];
  private persistPath: string | undefined;
  /** True when `latest` came from disk (not from a tick this process ran). */
  private hydrated = false;

  constructor(opts: RegimeStoreOpts = {}) {
    // null → explicit off; undefined → fall through to default.
    if (opts.persistPath === null) {
      this.persistPath = undefined;
    } else if (typeof opts.persistPath === "string" && opts.persistPath.length) {
      this.persistPath = opts.persistPath;
    } else {
      this.persistPath = defaultPersistPath();
    }
    if (this.persistPath) this.tryHydrate();
  }

  /** Record a new reading and recompute. Returns the resulting snapshot. */
  record(reading: RegimeReading, now: number = Date.now()): RegimeSnapshot {
    const prior = this.findPrior(now);
    const snap = computeRegime({ current: reading, prior, now });
    this.latest = snap;
    this.hydrated = false;
    this.history.push({ ts: now, reading });
    this.prune(now);
    this.tryPersist(snap);
    return snap;
  }

  /** Latest computed snapshot, or null if `record()` has never been called. */
  get(): RegimeSnapshot | null {
    return this.latest;
  }

  /** True iff `latest` was loaded from disk and no fresh tick has succeeded yet this process. */
  isHydrated(): boolean {
    return this.hydrated;
  }

  /** Number of readings retained (for tests / `/health` debug). */
  size(): number {
    return this.history.length;
  }

  /** Find the history entry closest to `now - 24h`, within [6h, 30h] window. */
  private findPrior(now: number): RegimeReading | undefined {
    if (!this.history.length) return undefined;
    const target = now - TARGET_PRIOR_AGE_MS;
    let best: HistoryEntry | undefined;
    let bestDelta = Infinity;
    for (const h of this.history) {
      const age = now - h.ts;
      if (age < MIN_PRIOR_AGE_MS || age > MAX_PRIOR_AGE_MS) continue;
      const d = Math.abs(h.ts - target);
      if (d < bestDelta) {
        best = h;
        bestDelta = d;
      }
    }
    return best?.reading;
  }

  private prune(now: number) {
    const cutoff = now - HISTORY_RETAIN_MS;
    this.history = this.history.filter((h) => h.ts >= cutoff);
  }

  private tryHydrate(): void {
    if (!this.persistPath) return;
    try {
      const raw = readFileSync(this.persistPath, "utf-8");
      const parsed = JSON.parse(raw) as RegimeSnapshot;
      if (
        parsed &&
        typeof parsed.regime === "string" &&
        typeof parsed.score === "number" &&
        typeof parsed.ts === "number"
      ) {
        this.latest = parsed;
        this.hydrated = true;
        const ageMin = Math.round((Date.now() - parsed.ts) / 60_000);
        console.log(
          `[regime] hydrated from disk: regime=${parsed.regime} score=${parsed.score} age=${ageMin}min`,
        );
      }
    } catch (err) {
      // ENOENT on first-ever boot is normal — log only on parse / IO errors.
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn("[regime] hydrate failed:", (err as Error).message);
      }
    }
  }

  private tryPersist(snap: RegimeSnapshot): void {
    if (!this.persistPath) return;
    try {
      mkdirSync(dirname(this.persistPath), { recursive: true });
      const tmp = `${this.persistPath}.tmp`;
      writeFileSync(tmp, JSON.stringify(snap), "utf-8");
      // Atomic on POSIX. On Windows MoveFileEx replaces the existing file.
      renameSync(tmp, this.persistPath);
    } catch (err) {
      // Persistence is best-effort; loop keeps running.
      console.warn("[regime] persist failed:", (err as Error).message);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Scheduler — periodic reader → store, returns stop fn
// ─────────────────────────────────────────────────────────────────────────────

export interface RegimeLoopOpts {
  store: RegimeStore;
  /** Fetch the current reading. Return `null` to skip this tick (data not ready). */
  read: () => Promise<RegimeReading | null>;
  /** Tick interval. Default 5 min per task spec. */
  intervalMs?: number;
  /** Run immediately on start. Default true. */
  runImmediately?: boolean;
}

export function startRegimeLoop(opts: RegimeLoopOpts): () => void {
  const interval = opts.intervalMs ?? 5 * 60_000;
  let stopped = false;

  const tick = async () => {
    if (stopped) return;
    try {
      const reading = await opts.read();
      if (!reading) {
        // Reader is responsible for logging *which* inputs were missing —
        // we just record that the tick fired and produced nothing.
        console.log("[regime] tick skipped reason=missing_data");
        return;
      }
      const snap = opts.store.record(reading);
      console.log(
        `[regime] tick computed regime=${snap.regime} score=${snap.score.toFixed(2)} reason="${snap.reason}"`,
      );
    } catch (err) {
      console.warn("[regime] tick failed:", (err as Error).message);
    }
  };

  if (opts.runImmediately !== false) void tick();
  const handle = setInterval(tick, interval);

  return () => {
    stopped = true;
    clearInterval(handle);
  };
}

// Re-exported thresholds for tests / docs / future tuning.
export const REGIME_THRESHOLDS = {
  HIGH_DOM,
  HIGH_DXY,
  WEAK_DXY,
  FUNDING_POS,
  TREND_EPS_DOM,
  TREND_EPS_DXY,
  VIX_PANIC,
  VIX_NUDGE,
  MIN_PRIOR_AGE_MS,
  MAX_PRIOR_AGE_MS,
  TARGET_PRIOR_AGE_MS,
} as const;
