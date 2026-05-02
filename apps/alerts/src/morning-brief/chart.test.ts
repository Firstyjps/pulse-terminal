import { describe, expect, it, vi } from "vitest";
import type { ETFFlow } from "@pulse/sources";
import {
  buildBtcEtfSparklineSvg,
  buildBtcPriceChartSvg,
  fetchBtcKlines7d,
  svgToPng,
  type KlineRow,
} from "./chart.js";

function makeFlows(n: number, slope = 1_000_000_000): ETFFlow[] {
  const out: ETFFlow[] = [];
  let cum = 28_000_000_000;
  for (let i = 0; i < n; i++) {
    cum += slope;
    out.push({
      date: `2026-04-${String(i + 1).padStart(2, "0")}`,
      btc: 100_000_000 + i * 10_000_000,
      eth: 5_000_000,
      btcCumulative: cum,
      ethCumulative: 4_000_000_000,
    });
  }
  return out;
}

describe("buildBtcEtfSparklineSvg", () => {
  it("returns a complete <svg> document with dark bg + accent line color", () => {
    const svg = buildBtcEtfSparklineSvg(makeFlows(30));
    expect(svg).toMatch(/^<svg[^>]+xmlns/);
    expect(svg).toContain('width="600"');
    expect(svg).toContain('height="300"');
    // Dark background per CLAUDE.md token
    expect(svg).toContain('fill="#04050a"');
    // Accent purple line per CLAUDE.md token
    expect(svg).toContain('stroke="#7c5cff"');
    // closing tag
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("emits a path with M + L commands matching point count", () => {
    const flows = makeFlows(10);
    const svg = buildBtcEtfSparklineSvg(flows);
    const pathMatch = svg.match(/d="(M[^"]+)"/g);
    expect(pathMatch).toBeTruthy();
    // Stroke path: 1 M + (n-1) L = total commands = n
    const strokePath = pathMatch![1] ?? pathMatch![0];
    const lCount = (strokePath.match(/L/g) ?? []).length;
    expect(lCount).toBe(flows.length - 1);
  });

  it("renders 'Insufficient data' when < 2 flows", () => {
    const svg = buildBtcEtfSparklineSvg([]);
    expect(svg).toContain("Insufficient data");
  });

  it("includes title + change-over-period in header", () => {
    const svg = buildBtcEtfSparklineSvg(makeFlows(30));
    expect(svg).toContain("BTC ETF Cumulative Flow");
    expect(svg).toMatch(/over 30d/);
  });

  it("shows first and last date labels", () => {
    const flows = makeFlows(5);
    const svg = buildBtcEtfSparklineSvg(flows);
    expect(svg).toContain("2026-04-01");
    expect(svg).toContain("2026-04-05");
  });

  it("output is deterministic for fixed input (snapshot-friendly)", () => {
    const a = buildBtcEtfSparklineSvg(makeFlows(10, 500_000_000));
    const b = buildBtcEtfSparklineSvg(makeFlows(10, 500_000_000));
    expect(a).toBe(b);
  });

  it("escapes XML-reserved chars in date / title strings", () => {
    const flows: ETFFlow[] = [
      { date: "<bad>", btc: 0, eth: 0, btcCumulative: 1, ethCumulative: 0 },
      { date: "<bad2>", btc: 0, eth: 0, btcCumulative: 2, ethCumulative: 0 },
    ];
    const svg = buildBtcEtfSparklineSvg(flows, { title: 'A & B "test"' });
    expect(svg).toContain("&lt;bad&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).not.toContain("<bad>");
  });
});

describe("svgToPng", () => {
  it("returns Uint8Array when injected resvg succeeds", async () => {
    const fakePng = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const fakeBuffer = Buffer.from(fakePng);
    const fakeResvg = {
      Resvg: class {
        constructor(_svg: string, _opts?: unknown) {}
        render() {
          return { asPng: () => fakeBuffer };
        }
      } as unknown as new (svg: string, opts?: unknown) => { render(): { asPng(): Buffer } },
    };
    const out = await svgToPng("<svg/>", fakeResvg);
    expect(out).toBeInstanceOf(Uint8Array);
    expect(out!.byteLength).toBe(4);
  });

  it("returns null when resvg throws", async () => {
    const fakeResvg = {
      Resvg: class {
        constructor() {
          throw new Error("native binding load failed");
        }
        render() {
          return { asPng: () => Buffer.alloc(0) };
        }
      } as unknown as new (svg: string, opts?: unknown) => { render(): { asPng(): Buffer } },
    };
    const out = await svgToPng("<svg/>", fakeResvg);
    expect(out).toBeNull();
  });
});

// ──────────────────────────────────────────────────────────────────────────
// BTC price chart
// ──────────────────────────────────────────────────────────────────────────

function makeKlines(
  n: number,
  opts: { startPrice?: number; slope?: number; startTs?: number } = {},
): KlineRow[] {
  const startPrice = opts.startPrice ?? 60_000;
  const slope = opts.slope ?? 100;
  const startTs = opts.startTs ?? Date.UTC(2026, 4, 1); // 2026-05-01
  const out: KlineRow[] = [];
  for (let i = 0; i < n; i++) {
    const close = startPrice + i * slope;
    out.push({
      ts: startTs + i * 3_600_000,
      open: close - 5,
      high: close + 10,
      low: close - 10,
      close,
      volume: 100 + (i % 20),
    });
  }
  return out;
}

describe("buildBtcPriceChartSvg", () => {
  it("returns a complete <svg> with dark bg + 1280x320 dims", () => {
    const svg = buildBtcPriceChartSvg(makeKlines(168));
    expect(svg).toMatch(/^<svg[^>]+xmlns/);
    expect(svg).toContain('width="1280"');
    expect(svg).toContain('height="320"');
    expect(svg).toContain('fill="#0b0d12"');
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });

  it("uses green stroke when 7d change is positive", () => {
    const svg = buildBtcPriceChartSvg(makeKlines(168, { slope: 100 }));
    expect(svg).toContain('stroke="#22c55e"');
    expect(svg).not.toContain('stroke="#ef4444"');
  });

  it("uses red stroke when 7d change is negative", () => {
    const svg = buildBtcPriceChartSvg(makeKlines(168, { slope: -100 }));
    expect(svg).toContain('stroke="#ef4444"');
    expect(svg).not.toContain('stroke="#22c55e"');
  });

  it("renders title + last price + signed pct", () => {
    const svg = buildBtcPriceChartSvg(makeKlines(168));
    expect(svg).toContain("BTC/USD · 7D");
    expect(svg).toMatch(/\$[\d,]+/);
    expect(svg).toMatch(/[+\-]\d+\.\d{2}%/);
  });

  it("renders 'No price data' when input is empty or has < 2 rows", () => {
    expect(buildBtcPriceChartSvg([])).toContain("No price data");
    expect(buildBtcPriceChartSvg(makeKlines(1))).toContain("No price data");
  });

  it("flat-line input still renders without div-by-zero", () => {
    const flat = makeKlines(168, { slope: 0 });
    const svg = buildBtcPriceChartSvg(flat);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    // 0% change → still treated as ≥ 0, so green
    expect(svg).toContain('stroke="#22c55e"');
  });

  it("emits line path with M + 167 L commands for 168 rows", () => {
    const svg = buildBtcPriceChartSvg(makeKlines(168));
    // The line path is the one with stroke (no fill); area is fill, no stroke.
    const lineMatch = svg.match(/d="(M[^"]+)"\s+fill="none"/);
    expect(lineMatch).toBeTruthy();
    const stroke = lineMatch![1];
    const lCount = (stroke.match(/L/g) ?? []).length;
    expect(lCount).toBe(167);
  });

  it("output is deterministic for fixed input (snapshot-friendly)", () => {
    const a = buildBtcPriceChartSvg(makeKlines(50, { startPrice: 60_000, slope: 50 }));
    const b = buildBtcPriceChartSvg(makeKlines(50, { startPrice: 60_000, slope: 50 }));
    expect(a).toBe(b);
  });

  it("filters out NaN/Infinity rows defensively", () => {
    const rows = makeKlines(5);
    rows[2].close = NaN;
    rows[3].close = Infinity;
    const svg = buildBtcPriceChartSvg(rows);
    // 3 valid rows survive (0, 1, 4) → enough to draw a line, no crash
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
    expect(svg).toMatch(/^<svg/);
  });
});

describe("fetchBtcKlines7d", () => {
  function fakeKline(i: number, startTs = Date.UTC(2026, 4, 1)) {
    return [
      startTs + i * 3_600_000,
      "60000",
      "60100",
      "59900",
      "60050",
      "100",
      0,
      "0",
      0,
      "0",
      "0",
      "0",
    ];
  }

  it("returns parsed rows on a 200 response", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => Array.from({ length: 168 }, (_, i) => fakeKline(i)),
    } as unknown as Response));
    const rows = await fetchBtcKlines7d(fetchImpl as unknown as typeof fetch);
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(168);
    expect(rows![0].close).toBe(60050);
    expect(fetchImpl).toHaveBeenCalledTimes(1); // succeeded on first host
  });

  it("returns null when all 4 hosts return non-2xx", async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 418 } as Response));
    const rows = await fetchBtcKlines7d(fetchImpl as unknown as typeof fetch);
    expect(rows).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });

  it("returns null when response has < 2 rows", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [fakeKline(0)],
    } as unknown as Response));
    const rows = await fetchBtcKlines7d(fetchImpl as unknown as typeof fetch);
    expect(rows).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(4); // exhausts all hosts
  });

  it("falls through to next host on JSON parse failure", async () => {
    let call = 0;
    const fetchImpl = vi.fn(async () => {
      call++;
      if (call === 1) {
        return {
          ok: true,
          status: 200,
          json: async () => {
            throw new Error("bad json");
          },
        } as unknown as Response;
      }
      return {
        ok: true,
        status: 200,
        json: async () =>
          Array.from({ length: 2 }, (_, i) => fakeKline(i)),
      } as unknown as Response;
    });
    const rows = await fetchBtcKlines7d(fetchImpl as unknown as typeof fetch);
    expect(rows).not.toBeNull();
    expect(rows!.length).toBe(2);
    expect(call).toBe(2);
  });

  it("returns null when response shape is non-array", async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ msg: "rate limited" }),
    } as unknown as Response));
    const rows = await fetchBtcKlines7d(fetchImpl as unknown as typeof fetch);
    expect(rows).toBeNull();
    expect(fetchImpl).toHaveBeenCalledTimes(4);
  });
});
