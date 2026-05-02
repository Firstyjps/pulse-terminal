import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./binance.js", () => ({ getPortfolio: vi.fn() }));
vi.mock("./bybit.js", () => ({ getBybitPortfolio: vi.fn() }));
vi.mock("./okx.js", () => ({ getOkxPortfolio: vi.fn() }));

import { getMultiPortfolio } from "./multi.js";
import { getPortfolio } from "./binance.js";
import { getBybitPortfolio } from "./bybit.js";
import { getOkxPortfolio } from "./okx.js";

const mockBinance = vi.mocked(getPortfolio);
const mockBybit = vi.mocked(getBybitPortfolio);
const mockOkx = vi.mocked(getOkxPortfolio);

beforeEach(() => {
  mockBinance.mockReset();
  mockBybit.mockReset();
  mockOkx.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getMultiPortfolio — aggregation", () => {
  it("sums totalUsd across configured sources", async () => {
    mockBinance.mockResolvedValue({ source: "binance", totalUsd: 50_000, balances: [], ts: 1 });
    mockBybit.mockResolvedValue({ source: "bybit", totalUsd: 30_000, balances: [], ts: 2 });
    mockOkx.mockResolvedValue({ source: "okx", totalUsd: 20_000, balances: [], ts: 3 });

    const snap = await getMultiPortfolio();
    expect(snap.totalUsd).toBe(100_000);
    expect(snap.sources).toHaveLength(3);
    expect(snap.status.every((s) => s.configured && !s.error)).toBe(true);
  });

  it("includes only sources that returned a snapshot in `sources`", async () => {
    mockBinance.mockResolvedValue({ source: "binance", totalUsd: 50_000, balances: [], ts: 1 });
    mockBybit.mockResolvedValue(null);
    mockOkx.mockResolvedValue({ source: "okx", totalUsd: 20_000, balances: [], ts: 3 });

    const snap = await getMultiPortfolio();
    expect(snap.sources.map((s) => s.source).sort()).toEqual(["binance", "okx"]);
    expect(snap.totalUsd).toBe(70_000);
  });

  it("marks unconfigured sources with `configured: false` and no error", async () => {
    mockBinance.mockResolvedValue(null);
    mockBybit.mockResolvedValue(null);
    mockOkx.mockResolvedValue(null);

    const snap = await getMultiPortfolio();
    expect(snap.status).toEqual([
      { source: "binance", configured: false },
      { source: "bybit",   configured: false },
      { source: "okx",     configured: false },
    ]);
    expect(snap.sources).toEqual([]);
    expect(snap.totalUsd).toBe(0);
  });

  it("preserves source order in status (binance, bybit, okx)", async () => {
    mockBinance.mockResolvedValue({ source: "binance", totalUsd: 1, balances: [], ts: 1 });
    mockBybit.mockResolvedValue({ source: "bybit", totalUsd: 2, balances: [], ts: 2 });
    mockOkx.mockResolvedValue({ source: "okx", totalUsd: 3, balances: [], ts: 3 });

    const snap = await getMultiPortfolio();
    expect(snap.status.map((s) => s.source)).toEqual(["binance", "bybit", "okx"]);
  });
});

describe("getMultiPortfolio — failure isolation", () => {
  it("does not let one source's error kill the others", async () => {
    mockBinance.mockRejectedValue(new Error("Binance 401"));
    mockBybit.mockResolvedValue({ source: "bybit", totalUsd: 30_000, balances: [], ts: 2 });
    mockOkx.mockResolvedValue({ source: "okx", totalUsd: 20_000, balances: [], ts: 3 });

    const snap = await getMultiPortfolio();
    expect(snap.totalUsd).toBe(50_000);
    expect(snap.sources.map((s) => s.source).sort()).toEqual(["bybit", "okx"]);
    expect(snap.status.find((s) => s.source === "binance")).toEqual({
      source: "binance",
      configured: true,
      error: "Binance 401",
    });
  });

  it("captures non-Error rejections via String(reason)", async () => {
    mockBinance.mockRejectedValue("network refused");
    mockBybit.mockResolvedValue(null);
    mockOkx.mockResolvedValue(null);

    const snap = await getMultiPortfolio();
    const status = snap.status.find((s) => s.source === "binance");
    expect(status?.error).toBe("network refused");
    expect(status?.configured).toBe(true);
  });

  it("returns valid snapshot even when ALL sources error", async () => {
    mockBinance.mockRejectedValue(new Error("a"));
    mockBybit.mockRejectedValue(new Error("b"));
    mockOkx.mockRejectedValue(new Error("c"));

    const snap = await getMultiPortfolio();
    expect(snap.totalUsd).toBe(0);
    expect(snap.sources).toEqual([]);
    expect(snap.status.map((s) => s.error)).toEqual(["a", "b", "c"]);
    expect(snap.status.every((s) => s.configured)).toBe(true);
  });
});

describe("getMultiPortfolio — concurrency", () => {
  it("runs all 3 fetchers in parallel via Promise.allSettled", async () => {
    const order: string[] = [];
    const delay = 30;
    mockBinance.mockImplementation(async () => {
      order.push("binance-start");
      await new Promise((r) => setTimeout(r, delay));
      order.push("binance-end");
      return { source: "binance", totalUsd: 1, balances: [], ts: 1 };
    });
    mockBybit.mockImplementation(async () => {
      order.push("bybit-start");
      await new Promise((r) => setTimeout(r, delay));
      order.push("bybit-end");
      return { source: "bybit", totalUsd: 2, balances: [], ts: 2 };
    });
    mockOkx.mockImplementation(async () => {
      order.push("okx-start");
      await new Promise((r) => setTimeout(r, delay));
      order.push("okx-end");
      return { source: "okx", totalUsd: 3, balances: [], ts: 3 };
    });

    await getMultiPortfolio();

    const lastStartIdx = Math.max(
      order.indexOf("binance-start"),
      order.indexOf("bybit-start"),
      order.indexOf("okx-start"),
    );
    const firstEndIdx = Math.min(
      order.indexOf("binance-end"),
      order.indexOf("bybit-end"),
      order.indexOf("okx-end"),
    );
    expect(lastStartIdx).toBeLessThan(firstEndIdx);
  });

  it("calls each fetcher exactly once per call", async () => {
    mockBinance.mockResolvedValue(null);
    mockBybit.mockResolvedValue(null);
    mockOkx.mockResolvedValue(null);

    await getMultiPortfolio();

    expect(mockBinance).toHaveBeenCalledTimes(1);
    expect(mockBybit).toHaveBeenCalledTimes(1);
    expect(mockOkx).toHaveBeenCalledTimes(1);
  });
});

describe("getMultiPortfolio — timestamp", () => {
  it("sets snapshot ts to call time, not source ts", async () => {
    mockBinance.mockResolvedValue({ source: "binance", totalUsd: 1, balances: [], ts: 999 });
    mockBybit.mockResolvedValue(null);
    mockOkx.mockResolvedValue(null);

    const before = Date.now();
    const snap = await getMultiPortfolio();
    const after = Date.now();

    expect(snap.ts).toBeGreaterThanOrEqual(before);
    expect(snap.ts).toBeLessThanOrEqual(after);
    expect(snap.ts).not.toBe(999);
  });
});
