import { describe, expect, it } from "vitest";
import type { StoreStats } from "@pulse/sources/server";
import { toAprBlock } from "./apr-reader.js";

describe("toAprBlock — StoreStats → AprBlock mapping", () => {
  it("maps the happy path fields one-to-one", () => {
    const stats: StoreStats = {
      available: true,
      pairs: ["SOL-USDT", "BTC-USDT"],
      totalSnapshots: 1234,
      samplesLast24h: 96,
      lastWriteUtc: "2026-04-28T17:30:00Z",
      lastWriteAgeMs: 42_000,
    };
    expect(toAprBlock(stats)).toEqual({
      storeOk: true,
      lastWriteMs: 42_000,
      pairs: 2,
      samplesLast24h: 96,
    });
  });

  it("collapses pairs[] to a count (length)", () => {
    const stats: StoreStats = {
      available: true,
      pairs: ["A", "B", "C", "D"],
      totalSnapshots: 0,
      samplesLast24h: 0,
      lastWriteUtc: null,
      lastWriteAgeMs: null,
    };
    expect(toAprBlock(stats).pairs).toBe(4);
  });

  it("preserves null lastWriteMs when no writes yet", () => {
    const stats: StoreStats = {
      available: true,
      pairs: [],
      totalSnapshots: 0,
      samplesLast24h: 0,
      lastWriteUtc: null,
      lastWriteAgeMs: null,
    };
    expect(toAprBlock(stats).lastWriteMs).toBeNull();
  });

  it("forwards available:false as storeOk:false + error", () => {
    const stats: StoreStats = {
      available: false,
      pairs: [],
      totalSnapshots: 0,
      samplesLast24h: 0,
      lastWriteUtc: null,
      lastWriteAgeMs: null,
      error: "DB unavailable",
    };
    expect(toAprBlock(stats)).toEqual({
      storeOk: false,
      lastWriteMs: null,
      pairs: 0,
      samplesLast24h: 0,
      error: "DB unavailable",
    });
  });

  it("omits error field when StoreStats has no error", () => {
    const stats: StoreStats = {
      available: true,
      pairs: ["SOL-USDT"],
      totalSnapshots: 5,
      samplesLast24h: 5,
      lastWriteUtc: "2026-04-28T00:00:00Z",
      lastWriteAgeMs: 10_000,
    };
    const block = toAprBlock(stats);
    expect("error" in block).toBe(false);
  });
});
