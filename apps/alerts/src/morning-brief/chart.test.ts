import { describe, expect, it } from "vitest";
import type { ETFFlow } from "@pulse/sources";
import { buildBtcEtfSparklineSvg, svgToPng } from "./chart.js";

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
