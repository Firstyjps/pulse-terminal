// SVG sparkline of BTC ETF cumulative flow → PNG via @resvg/resvg-js.
// Dark theme matching Pulse dashboard tokens (#04050a bg, #7c5cff line).
//
// Two layers:
//   1. buildBtcEtfSparklineSvg(flows) — pure, deterministic, snapshot-friendly
//   2. svgToPng(svg)                  — async, calls @resvg/resvg-js
//
// Image is best-effort. If resvg fails (native binding issue, OOM), the caller
// just skips sendPhoto and the message goes through without the chart.

import type { ETFFlow } from "@pulse/sources";

const W = 600;
const H = 300;
const PAD = 30;
const BG = "#04050a";
const LINE = "#7c5cff";
const GRID = "#1a1d2a";
const TEXT = "#9ca3af";
const TITLE = "#e5e7eb";

export interface ChartOpts {
  days?: number;
  title?: string;
}

/** Build the SVG markup. Returns a self-contained `<svg>` document. */
export function buildBtcEtfSparklineSvg(
  flows: ETFFlow[],
  opts: ChartOpts = {},
): string {
  const days = opts.days ?? 30;
  const title = opts.title ?? "BTC ETF Cumulative Flow (30d)";
  const slice = flows.slice(-days);

  if (slice.length < 2) {
    return wrap(
      `<text x="${W / 2}" y="${H / 2}" text-anchor="middle" fill="${TEXT}" font-family="Inter, system-ui" font-size="14">Insufficient data</text>`,
      title,
    );
  }

  const values = slice.map((f) => f.btcCumulative);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const innerW = W - PAD * 2;
  const innerH = H - PAD * 2 - 20; // -20 for title row
  const stepX = innerW / (slice.length - 1);

  const pts: Array<[number, number]> = slice.map((f, i) => [
    PAD + i * stepX,
    PAD + 20 + innerH - ((f.btcCumulative - min) / range) * innerH,
  ]);

  const pathD = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");

  // Area fill underneath the line
  const areaD =
    pathD +
    ` L${pts[pts.length - 1][0].toFixed(1)},${(PAD + 20 + innerH).toFixed(1)}` +
    ` L${pts[0][0].toFixed(1)},${(PAD + 20 + innerH).toFixed(1)} Z`;

  const lastVal = slice[slice.length - 1].btcCumulative;
  const firstVal = slice[0].btcCumulative;
  const change = lastVal - firstVal;
  const changeStr =
    (change >= 0 ? "+" : "-") + fmtBn(Math.abs(change)) + ` over ${slice.length}d`;
  const lastStr = `Latest: ${fmtBn(lastVal)}`;

  // Y-axis baseline
  const baseline = `<line x1="${PAD}" y1="${PAD + 20 + innerH}" x2="${W - PAD}" y2="${PAD + 20 + innerH}" stroke="${GRID}" stroke-width="1"/>`;

  const inner = [
    baseline,
    `<path d="${areaD}" fill="${LINE}" fill-opacity="0.18"/>`,
    `<path d="${pathD}" fill="none" stroke="${LINE}" stroke-width="2"/>`,
    `<circle cx="${pts[pts.length - 1][0].toFixed(1)}" cy="${pts[pts.length - 1][1].toFixed(1)}" r="3.5" fill="${LINE}"/>`,
    `<text x="${PAD}" y="${PAD + 12}" fill="${TITLE}" font-family="Inter, system-ui" font-size="14" font-weight="600">${escapeXml(title)}</text>`,
    `<text x="${W - PAD}" y="${PAD + 12}" text-anchor="end" fill="${TEXT}" font-family="Inter, system-ui" font-size="12">${escapeXml(changeStr)}</text>`,
    `<text x="${PAD}" y="${H - 8}" fill="${TEXT}" font-family="Inter, system-ui" font-size="11">${escapeXml(slice[0].date)}</text>`,
    `<text x="${W - PAD}" y="${H - 8}" text-anchor="end" fill="${TEXT}" font-family="Inter, system-ui" font-size="11">${escapeXml(slice[slice.length - 1].date)} · ${escapeXml(lastStr)}</text>`,
  ].join("\n  ");

  return wrap(inner, title);
}

function wrap(inner: string, title: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${escapeXml(title)}">
  <rect width="${W}" height="${H}" fill="${BG}"/>
  ${inner}
</svg>`;
}

function fmtBn(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)}M`;
  return `$${n.toFixed(0)}`;
}

function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Convert SVG markup to PNG. Returns null on failure so the caller can drop
 * the image and still send the text message.
 *
 * @param resvgImpl  Optional injected resvg ctor for tests.
 */
export async function svgToPng(
  svg: string,
  resvgImpl?: { Resvg: new (svg: string, opts?: unknown) => { render(): { asPng(): Buffer } } },
): Promise<Uint8Array | null> {
  try {
    const mod = resvgImpl ?? (await import("@resvg/resvg-js"));
    const r = new mod.Resvg(svg, { fitTo: { mode: "width", value: W } });
    const png = r.render().asPng();
    return new Uint8Array(png);
  } catch {
    return null;
  }
}
