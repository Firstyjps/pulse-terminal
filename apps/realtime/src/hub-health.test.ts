import { beforeEach, describe, expect, it } from "vitest";
import { HubCache } from "./cache.js";
import {
  aprStatus,
  buildHealthV2,
  fundingStatus,
  oiStatus,
  optionsStatus,
  snapshotStatus,
  type AprBlock,
  type AprReader,
  type OptionsBlock,
  type OptionsReader,
} from "./hub-health.js";
import type { FundingRate, OpenInterest } from "@pulse/sources";

const NOW = 1_745_842_200_000; // fixed reference time
const FRESH = NOW - 60_000;
const STALE = NOW - 10 * 60_000;

function makeCache(opts: {
  snapshotAgeMs?: number;
  funding?: Array<{ exchange: FundingRate["exchange"]; symbol: string; ts: number }>;
  oi?: Array<{ exchange: OpenInterest["exchange"]; symbol: string }>;
}): HubCache {
  const c = new HubCache();
  if (opts.snapshotAgeMs !== undefined) {
    c.snapshot = { generatedAt: new Date(NOW - opts.snapshotAgeMs).toISOString() } as never;
    c.snapshotTs = NOW - opts.snapshotAgeMs;
  }
  for (const f of opts.funding ?? []) {
    c.setFunding({
      exchange: f.exchange,
      symbol: f.symbol,
      rate: 0.0001,
      ratePercent: 0.01,
      nextFundingTime: NOW + 3_600_000,
      ts: f.ts,
    });
  }
  for (const o of opts.oi ?? []) {
    c.setOi({
      exchange: o.exchange,
      symbol: o.symbol,
      oi: 1000,
      oiUsd: 1_000_000,
      ts: NOW,
    });
  }
  return c;
}

const fixedNow = () => NOW;

const aprReaderReturning = (block: AprBlock | null): AprReader => ({ read: () => block });

const optionsReaderFrom = (block: OptionsBlock | null): OptionsReader => ({
  channelsFresh: () => block?.channelsFresh ?? 0,
  byExchange: () => block?.byExchange ?? {},
  assets: () => block?.assets ?? [],
  expiriesTracked: () => block?.expiriesTracked ?? 0,
  hasData: () => block !== null,
});

// ────────────────────────────────────────────────────────────────────────
// Pure status-derivation matrix
// ────────────────────────────────────────────────────────────────────────

describe("snapshotStatus", () => {
  it("null age → unhealthy", () => expect(snapshotStatus(null)).toBe("unhealthy"));
  it("< 180s → healthy", () => expect(snapshotStatus(60)).toBe("healthy"));
  it("180-600s → degraded", () => expect(snapshotStatus(300)).toBe("degraded"));
  it(">= 600s → unhealthy", () => expect(snapshotStatus(900)).toBe("unhealthy"));
});

describe("fundingStatus", () => {
  it("0 fresh → unhealthy", () => expect(fundingStatus(0)).toBe("unhealthy"));
  it("1-5 fresh → degraded", () => {
    expect(fundingStatus(1)).toBe("degraded");
    expect(fundingStatus(5)).toBe("degraded");
  });
  it(">= 6 fresh → healthy", () => expect(fundingStatus(6)).toBe("healthy"));
});

describe("oiStatus", () => {
  it("0 → unhealthy", () => expect(oiStatus(0)).toBe("unhealthy"));
  it("1-3 → degraded", () => expect(oiStatus(2)).toBe("degraded"));
  it(">= 4 → healthy", () => expect(oiStatus(4)).toBe("healthy"));
});

describe("aprStatus", () => {
  it("undefined block → healthy (omitted blocks don't degrade)", () => {
    expect(aprStatus(undefined)).toBe("healthy");
    expect(aprStatus(null)).toBe("healthy");
  });
  it("storeOk:false → unhealthy", () => {
    expect(aprStatus({ storeOk: false, lastWriteMs: null, pairs: 0, samplesLast24h: 0 })).toBe("unhealthy");
  });
  it("storeOk + null lastWrite → degraded (no writes yet)", () => {
    expect(aprStatus({ storeOk: true, lastWriteMs: null, pairs: 0, samplesLast24h: 0 })).toBe("degraded");
  });
  it("storeOk + lastWrite < 30min → healthy", () => {
    expect(aprStatus({ storeOk: true, lastWriteMs: 60_000, pairs: 1, samplesLast24h: 4 })).toBe("healthy");
  });
  it("storeOk + lastWrite > 30min → degraded", () => {
    expect(aprStatus({ storeOk: true, lastWriteMs: 60 * 60_000, pairs: 1, samplesLast24h: 4 })).toBe("degraded");
  });
});

describe("optionsStatus", () => {
  const block: OptionsBlock = {
    channelsFresh: 50,
    byExchange: { Deribit: { channelsFresh: 50, lastUpdateMs: 30_000 } },
    assets: ["BTC", "ETH", "SOL"],
    expiriesTracked: 6,
  };

  it("undefined block → healthy", () => {
    expect(optionsStatus(undefined, ["BTC"])).toBe("healthy");
  });
  it("no required assets → healthy", () => {
    expect(optionsStatus(block, [])).toBe("healthy");
  });
  it("all required assets cached + fresh → healthy", () => {
    expect(optionsStatus(block, ["BTC", "ETH"])).toBe("healthy");
  });
  it("some required missing → degraded", () => {
    expect(optionsStatus({ ...block, assets: ["BTC"] }, ["BTC", "SOL"])).toBe("degraded");
  });
  it("all required missing → unhealthy", () => {
    expect(optionsStatus({ ...block, assets: [] }, ["BTC"])).toBe("unhealthy");
  });
  it("required cached but channelsFresh=0 → degraded", () => {
    expect(optionsStatus({ ...block, channelsFresh: 0 }, ["BTC"])).toBe("degraded");
  });
});

// ────────────────────────────────────────────────────────────────────────
// buildHealthV2 — integration
// ────────────────────────────────────────────────────────────────────────

describe("buildHealthV2 — v1 back-compat", () => {
  it("emits _version:2 with all v1 fields, no options/apr blocks when readers absent", () => {
    const cache = makeCache({
      snapshotAgeMs: 60_000,
      funding: Array.from({ length: 8 }, (_, i) => ({
        exchange: "binance" as const,
        symbol: `SYM${i}`,
        ts: FRESH,
      })),
      oi: Array.from({ length: 5 }, (_, i) => ({
        exchange: "binance" as const,
        symbol: `SYM${i}`,
      })),
    });
    const body = buildHealthV2({ cache, now: fixedNow });
    expect(body._version).toBe(2);
    expect(body.status).toBe("healthy");
    expect(body.snapshotAgeSec).toBe(60);
    expect(body.fundingChannelsFresh).toBe(8);
    expect(body.oiChannels).toBe(5);
    expect(body.options).toBeUndefined();
    expect(body.apr).toBeUndefined();
  });

  it("counts only fresh funding (< 5min)", () => {
    const cache = makeCache({
      snapshotAgeMs: 60_000,
      funding: [
        { exchange: "binance", symbol: "BTCUSDT", ts: FRESH },
        { exchange: "bybit", symbol: "BTCUSDT", ts: STALE }, // > 5min — not counted
      ],
    });
    const body = buildHealthV2({ cache, now: fixedNow });
    expect(body.fundingChannelsFresh).toBe(1);
  });

  it("snapshotAgeSec is null when no snapshot has been seen", () => {
    const cache = makeCache({});
    const body = buildHealthV2({ cache, now: fixedNow });
    expect(body.snapshotAgeSec).toBeNull();
    expect(body.status).toBe("unhealthy");
  });
});

describe("buildHealthV2 — APR block", () => {
  const healthyCacheArgs = {
    snapshotAgeMs: 60_000,
    funding: Array.from({ length: 8 }, (_, i) => ({
      exchange: "binance" as const,
      symbol: `SYM${i}`,
      ts: FRESH,
    })),
    oi: Array.from({ length: 5 }, (_, i) => ({
      exchange: "binance" as const,
      symbol: `SYM${i}`,
    })),
  };

  it("includes apr block when reader returns a value", () => {
    const cache = makeCache(healthyCacheArgs);
    const apr: AprBlock = { storeOk: true, lastWriteMs: 30_000, pairs: 1, samplesLast24h: 96 };
    const body = buildHealthV2({ cache, apr: aprReaderReturning(apr), now: fixedNow });
    expect(body.apr).toEqual(apr);
    expect(body.status).toBe("healthy");
  });

  it("storeOk:false drops overall status to unhealthy even when v1 healthy", () => {
    const cache = makeCache(healthyCacheArgs);
    const apr: AprBlock = {
      storeOk: false,
      lastWriteMs: null,
      pairs: 0,
      samplesLast24h: 0,
      error: "store not initialized",
    };
    const body = buildHealthV2({ cache, apr: aprReaderReturning(apr), now: fixedNow });
    expect(body.status).toBe("unhealthy");
    expect(body.apr?.error).toBe("store not initialized");
  });

  it("lastWriteMs > 30min drops overall status to degraded", () => {
    const cache = makeCache(healthyCacheArgs);
    const apr: AprBlock = { storeOk: true, lastWriteMs: 60 * 60_000, pairs: 1, samplesLast24h: 80 };
    const body = buildHealthV2({ cache, apr: aprReaderReturning(apr), now: fixedNow });
    expect(body.status).toBe("degraded");
  });

  it("apr block omitted when reader returns null", () => {
    const cache = makeCache(healthyCacheArgs);
    const body = buildHealthV2({ cache, apr: aprReaderReturning(null), now: fixedNow });
    expect(body.apr).toBeUndefined();
  });
});

describe("buildHealthV2 — options block", () => {
  it("omits options block when reader has no data", () => {
    const cache = makeCache({ snapshotAgeMs: 60_000 });
    const body = buildHealthV2({ cache, options: optionsReaderFrom(null), now: fixedNow });
    expect(body.options).toBeUndefined();
  });

  it("emits options block when reader has data", () => {
    const cache = makeCache({
      snapshotAgeMs: 60_000,
      funding: Array.from({ length: 8 }, (_, i) => ({ exchange: "binance" as const, symbol: `S${i}`, ts: FRESH })),
      oi: [{ exchange: "binance" as const, symbol: "BTCUSDT" }, { exchange: "bybit" as const, symbol: "BTCUSDT" }, { exchange: "okx" as const, symbol: "BTC-USDT-SWAP" }, { exchange: "deribit" as const, symbol: "BTC-PERP" }],
    });
    const block: OptionsBlock = {
      channelsFresh: 80,
      byExchange: {
        Deribit: { channelsFresh: 50, lastUpdateMs: 18_000 },
        Binance: { channelsFresh: 30, lastUpdateMs: 22_000 },
      },
      assets: ["BTC", "ETH"],
      expiriesTracked: 8,
    };
    const body = buildHealthV2({
      cache,
      options: optionsReaderFrom(block),
      now: fixedNow,
    });
    expect(body.options).toEqual(block);
    expect(body.status).toBe("healthy");
  });

  it("does NOT elevate v1 unhealthy status when options is healthy", () => {
    const cache = makeCache({}); // no snapshot → v1 unhealthy
    const block: OptionsBlock = {
      channelsFresh: 80,
      byExchange: { Deribit: { channelsFresh: 80, lastUpdateMs: 18_000 } },
      assets: ["BTC", "ETH", "SOL"],
      expiriesTracked: 8,
    };
    const body = buildHealthV2({ cache, options: optionsReaderFrom(block), now: fixedNow });
    expect(body.status).toBe("unhealthy");
  });

  it("missing required asset drops a healthy v1 to degraded", () => {
    const cache = makeCache({
      snapshotAgeMs: 60_000,
      funding: Array.from({ length: 8 }, (_, i) => ({ exchange: "binance" as const, symbol: `S${i}`, ts: FRESH })),
      oi: Array.from({ length: 5 }, (_, i) => ({ exchange: "binance" as const, symbol: `S${i}` })),
    });
    const block: OptionsBlock = {
      channelsFresh: 30,
      byExchange: { Deribit: { channelsFresh: 30, lastUpdateMs: 18_000 } },
      assets: ["BTC"],
      expiriesTracked: 2,
    };
    const body = buildHealthV2({
      cache,
      options: optionsReaderFrom(block),
      requiredOptionAssets: ["BTC", "SOL"],
      now: fixedNow,
    });
    expect(body.status).toBe("degraded");
  });
});

describe("buildHealthV2 — checks block", () => {
  it("forwards cache.health into checks shape", () => {
    const cache = makeCache({ snapshotAgeMs: 60_000 });
    cache.health = {
      coingecko: { ok: true, ms: 312, ts: NOW },
      binance: { ok: false, ms: 2000, err: "timeout", ts: NOW },
    };
    const body = buildHealthV2({ cache, now: fixedNow });
    expect(body.checks).toEqual({
      coingecko: { ok: true, ms: 312 },
      binance: { ok: false, ms: 2000, err: "timeout" },
    });
  });

  it("override via deps.checks takes precedence", () => {
    const cache = makeCache({ snapshotAgeMs: 60_000 });
    const body = buildHealthV2({
      cache,
      checks: { custom: { ok: true, ms: 5 } },
      now: fixedNow,
    });
    expect(body.checks).toEqual({ custom: { ok: true, ms: 5 } });
  });

  it("omits checks block when empty", () => {
    const cache = makeCache({ snapshotAgeMs: 60_000 });
    const body = buildHealthV2({ cache, now: fixedNow });
    expect(body.checks).toBeUndefined();
  });
});

describe("buildHealthV2 — ts field", () => {
  let cache: HubCache;
  beforeEach(() => {
    cache = makeCache({ snapshotAgeMs: 60_000 });
  });

  it("uses provided now() callback", () => {
    const body = buildHealthV2({ cache, now: () => 12345 });
    expect(body.ts).toBe(12345);
  });

  it("falls back to Date.now() when not provided", () => {
    const before = Date.now();
    const body = buildHealthV2({ cache });
    const after = Date.now();
    expect(body.ts).toBeGreaterThanOrEqual(before);
    expect(body.ts).toBeLessThanOrEqual(after);
  });
});
