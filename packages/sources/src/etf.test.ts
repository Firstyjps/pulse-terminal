import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./farside.js", () => ({ fetchFarsideEtf: vi.fn() }));
import { getETFFlows, pickFinalizedLast } from "./etf.js";
import { fetchFarsideEtf } from "./farside.js";
import type { ETFFlow } from "./types.js";

const mockFarside = vi.mocked(fetchFarsideEtf);

function farsideRow(date: string, btc: number, eth: number, btcCum: number, ethCum: number): ETFFlow {
  return { date, btc, eth, btcCumulative: btcCum, ethCumulative: ethCum };
}

const FARSIDE_FIXTURE: ETFFlow[] = [
  farsideRow("2026-04-21", 100_000_000,  20_000_000, 57_900_000_000, 11_700_000_000),
  farsideRow("2026-04-22",  50_000_000,  10_000_000, 57_950_000_000, 11_710_000_000),
  farsideRow("2026-04-23",  -5_000_000,   2_000_000, 57_945_000_000, 11_712_000_000),
  farsideRow("2026-04-24",  14_400_000,  23_400_000, 57_959_400_000, 11_735_400_000),
  farsideRow("2026-04-27", -263_200_000, -50_400_000, 57_696_200_000, 11_685_000_000),
  farsideRow("2026-04-28",  -89_700_000, -21_800_000, 57_606_500_000, 11_663_200_000),
  farsideRow("2026-04-29", -137_600_000, -87_800_000, 57_468_900_000, 11_575_400_000),
  farsideRow("2026-04-30",  23_500_000,  -23_700_000, 57_492_400_000, 11_551_700_000),
];

beforeEach(() => {
  mockFarside.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("getETFFlows — Farside happy path (primary source)", () => {
  beforeEach(() => {
    mockFarside.mockResolvedValue(FARSIDE_FIXTURE);
  });

  it("returns _source 'farside' with no _fallbackReason", async () => {
    const r = await getETFFlows();
    expect(r._source).toBe("farside");
    expect(r._isProxy).toBe(false);
    expect(r._fallbackReason).toBeUndefined();
  });

  it("passes Farside flows through verbatim (cumulative is precomputed by farside.ts)", async () => {
    const r = await getETFFlows();
    expect(r.flows).toEqual(FARSIDE_FIXTURE);
  });

  it("derives summary from the last row", async () => {
    const r = await getETFFlows();
    expect(r.summary.btcLast).toBe(23_500_000);
    expect(r.summary.ethLast).toBe(-23_700_000);
    expect(r.summary.btcCumulative).toBe(57_492_400_000);
    expect(r.summary.ethCumulative).toBe(11_551_700_000);
  });

  it("computes 7d sum across the last 7 rows (regardless of trading-day gaps)", async () => {
    const r = await getETFFlows();
    // last 7: 22,23,24,27,28,29,30 → btc sum
    const expected7 =
      50_000_000 + -5_000_000 + 14_400_000 + -263_200_000 +
      -89_700_000 + -137_600_000 + 23_500_000;
    expect(r.summary.btc7dSum).toBe(expected7);
  });

  it("computes 30d sum from up to last 30 rows", async () => {
    const r = await getETFFlows();
    const expected30 = FARSIDE_FIXTURE.reduce((s, f) => s + f.btc, 0);
    expect(r.summary.btc30dSum).toBe(expected30);
  });
});

describe("getETFFlows — Farside fallback to synthesized proxy", () => {
  it("falls back to proxy with _fallbackReason 'farside_threw' when scrape throws", async () => {
    mockFarside.mockRejectedValue(new Error("Cloudflare 403"));
    const r = await getETFFlows();
    expect(r._source).toBe("proxy");
    expect(r._isProxy).toBe(true);
    expect(r._fallbackReason).toBe("farside_threw");
    expect(r.flows.length).toBeGreaterThan(0); // proxy still emits a synthetic series
  });

  it("falls back to proxy with _fallbackReason 'farside_empty' when scrape returns null", async () => {
    mockFarside.mockResolvedValue(null);
    const r = await getETFFlows();
    expect(r._source).toBe("proxy");
    expect(r._isProxy).toBe(true);
    expect(r._fallbackReason).toBe("farside_empty");
  });

  it("falls back to proxy when Farside returns an empty array", async () => {
    mockFarside.mockResolvedValue([]);
    const r = await getETFFlows();
    expect(r._source).toBe("proxy");
    expect(r._fallbackReason).toBe("farside_empty");
  });

  it("treats a Farside response of exactly 5 rows as too thin → proxy fallback", async () => {
    // Boundary: the gate is `length > 5`. 5 rows is rejected as suspiciously
    // short (likely the /btc/ short-window page instead of the full archive).
    mockFarside.mockResolvedValue(FARSIDE_FIXTURE.slice(0, 5));
    const r = await getETFFlows();
    expect(r._source).toBe("proxy");
    expect(r._fallbackReason).toBe("farside_empty");
  });

  it("accepts a Farside response of 6 rows as healthy", async () => {
    mockFarside.mockResolvedValue(FARSIDE_FIXTURE.slice(0, 6));
    const r = await getETFFlows();
    expect(r._source).toBe("farside");
    expect(r._fallbackReason).toBeUndefined();
  });
});

describe("getETFFlows — response shape", () => {
  it("omits _fallbackReason when source === 'farside'", async () => {
    mockFarside.mockResolvedValue(FARSIDE_FIXTURE);
    const r = await getETFFlows();
    expect(Object.prototype.hasOwnProperty.call(r, "_fallbackReason")).toBe(false);
  });

  it("includes _fallbackReason when source === 'proxy'", async () => {
    mockFarside.mockResolvedValue(null);
    const r = await getETFFlows();
    expect(Object.prototype.hasOwnProperty.call(r, "_fallbackReason")).toBe(true);
  });

  it("never references Coinglass anywhere in the public response", async () => {
    mockFarside.mockResolvedValue(FARSIDE_FIXTURE);
    const r = await getETFFlows();
    expect(r._source).not.toBe("coinglass" as never);
    expect(JSON.stringify(r)).not.toMatch(/coinglass/i);
  });

  it("omits _todayPending when the tail row has real flow data", async () => {
    mockFarside.mockResolvedValue(FARSIDE_FIXTURE);
    const r = await getETFFlows();
    expect(r._todayPending).toBeUndefined();
  });
});

describe("pickFinalizedLast — pure helper", () => {
  it("returns the actual tail when it is not today + zero", () => {
    const r = pickFinalizedLast(FARSIDE_FIXTURE, "2026-05-04");
    expect(r.last?.date).toBe("2026-04-30");
    expect(r.pending).toBe(false);
  });

  it("shifts to previous row when tail is today AND btc=0 AND eth=0", () => {
    const flows: ETFFlow[] = [
      ...FARSIDE_FIXTURE,
      farsideRow("2026-05-01", 0, 0, 57_492_400_000, 11_551_700_000),
    ];
    const r = pickFinalizedLast(flows, "2026-05-01");
    expect(r.last?.date).toBe("2026-04-30");
    expect(r.pending).toBe(true);
  });

  it("does NOT shift when tail is today but has nonzero btc", () => {
    const flows: ETFFlow[] = [
      ...FARSIDE_FIXTURE,
      farsideRow("2026-05-01", 100_000, 0, 57_492_500_000, 11_551_700_000),
    ];
    const r = pickFinalizedLast(flows, "2026-05-01");
    expect(r.last?.date).toBe("2026-05-01");
    expect(r.pending).toBe(false);
  });

  it("does NOT shift when tail is yesterday with zeros (legitimate $0 day)", () => {
    const flows: ETFFlow[] = [
      ...FARSIDE_FIXTURE,
      farsideRow("2026-05-01", 0, 0, 57_492_400_000, 11_551_700_000),
    ];
    const r = pickFinalizedLast(flows, "2026-05-04"); // today is later
    expect(r.last?.date).toBe("2026-05-01");
    expect(r.pending).toBe(false);
  });

  it("returns undefined + pending=false on empty array", () => {
    const r = pickFinalizedLast([], "2026-05-01");
    expect(r.last).toBeUndefined();
    expect(r.pending).toBe(false);
  });

  it("does NOT shift when only one row exists (can't go back further)", () => {
    const flows: ETFFlow[] = [farsideRow("2026-05-01", 0, 0, 1, 1)];
    const r = pickFinalizedLast(flows, "2026-05-01");
    expect(r.last?.date).toBe("2026-05-01");
    expect(r.pending).toBe(false);
  });
});

describe("getETFFlows — today-pending shift (US trading day)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shifts btcLast/ethLast to previous row when today is stubbed at 0", async () => {
    // Pin "now" to 2026-05-01 14:00 UTC (US still trading until 20:00 UTC)
    vi.setSystemTime(new Date("2026-05-01T14:00:00.000Z"));

    const flows: ETFFlow[] = [
      ...FARSIDE_FIXTURE,
      // Farside stubs today's row before US close — both flows zero
      farsideRow("2026-05-01", 0, 0, 57_492_400_000, 11_551_700_000),
    ];
    mockFarside.mockResolvedValue(flows);

    const r = await getETFFlows();
    expect(r._todayPending).toBe(true);
    // btcLast comes from 2026-04-30 (the last finalized day), not today's zero
    expect(r.summary.btcLast).toBe(23_500_000);
    expect(r.summary.ethLast).toBe(-23_700_000);
  });

  it("leaves summary untouched when today's row already has real data", async () => {
    vi.setSystemTime(new Date("2026-05-01T22:00:00.000Z")); // after US close
    const flows: ETFFlow[] = [
      ...FARSIDE_FIXTURE,
      farsideRow("2026-05-01", 180_000_000, 12_000_000, 57_672_400_000, 11_563_700_000),
    ];
    mockFarside.mockResolvedValue(flows);

    const r = await getETFFlows();
    expect(r._todayPending).toBeUndefined();
    expect(r.summary.btcLast).toBe(180_000_000);
  });
});
