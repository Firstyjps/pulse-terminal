// SVG charts → PNG via @resvg/resvg-js. Dark theme.
//
// Two chart families share this file:
//   • BTC/USD 7d price chart   — buildBtcPriceChartSvg + fetchBtcKlines7d (current)
//   • BTC ETF cumulative flow  — buildBtcEtfSparklineSvg (deprecated 2026-05-02; kept for revert)
//
// svgToPng() is opaque to which SVG it gets. Image is best-effort; resvg
// failures cause the caller to skip sendPhoto without failing the brief.

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

/**
 * @deprecated 2026-05-02 — superseded by buildBtcPriceChartSvg. Kept for one-line revert.
 * Build the SVG markup for the BTC ETF cumulative flow chart.
 */
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

// ─────────────────────────────────────────────────────────────────────────
// BTC/USD 7d price chart (current — used by morning brief image step)
// ─────────────────────────────────────────────────────────────────────────

const PRICE_W = 1280;
const PRICE_H = 320;
const PRICE_PAD_X = 40;
const PRICE_PAD_TOP = 44;
const PRICE_PAD_BOT = 44;

const PRICE_BG = "#0b0d12";
const PRICE_GRID = "#1a1d2a";
const PRICE_TEXT = "#9ca3af";
const PRICE_TITLE = "#e5e7eb";
const PRICE_GREEN = "#22c55e";
const PRICE_RED = "#ef4444";

const PRICE_FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * BTC/USD 7d kline. `ts` is unix MILLISECONDS — note: the web /api/klines
 * route's KlineRow uses seconds (Lightweight Charts UTCTimestamp). Keep the
 * two divergent — different consumers, different conventions. Don't unify.
 */
export interface KlineRow {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BINANCE_HOSTS = [
  "https://data-api.binance.vision",
  "https://api.binance.com",
  "https://api1.binance.com",
  "https://api3.binance.com",
];

type BinanceKline = [
  number, // open time (ms)
  string, // open
  string, // high
  string, // low
  string, // close
  string, // volume
  number, // close time
  string, // quote volume
  number, // trades
  string, // taker buy base
  string, // taker buy quote
  string, // unused
];

/**
 * Best-effort fetch of last 168 hourly closes for BTCUSDT (spot). Returns
 * null on any failure (timeout, all 4 hosts non-2xx, malformed, < 2 rows).
 *
 * @param fetchImpl  Test seam — defaults to global fetch.
 */
export async function fetchBtcKlines7d(
  fetchImpl: typeof fetch = fetch,
): Promise<KlineRow[] | null> {
  for (const host of BINANCE_HOSTS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 5000);
    try {
      const res = await fetchImpl(
        `${host}/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=168`,
        { signal: ctrl.signal, cache: "no-store" } as RequestInit,
      );
      if (!res.ok) continue;
      const raw = (await res.json()) as BinanceKline[];
      if (!Array.isArray(raw)) continue;
      const rows: KlineRow[] = raw
        .map((k) => ({
          ts: k[0],
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }))
        .filter((r) => Number.isFinite(r.close) && Number.isFinite(r.ts));
      if (rows.length >= 2) return rows;
    } catch (err) {
      console.warn(`[morning-brief] klines fetch failed (${host}):`, (err as Error).message);
    } finally {
      clearTimeout(timer);
    }
  }
  console.warn("[morning-brief] all Binance kline hosts failed");
  return null;
}

/**
 * Pure, deterministic, snapshot-friendly. Returns a self-contained `<svg>`
 * document. Renders BTC/USD price line + filled area, gradient-tinted
 * green if last close ≥ first close else red. Caller owns data freshness.
 */
export function buildBtcPriceChartSvg(klines: KlineRow[]): string {
  const rows = (klines ?? []).filter(
    (r) => Number.isFinite(r.close) && Number.isFinite(r.ts),
  );
  if (rows.length < 2) {
    return wrapPrice(
      `<text x="${PRICE_W / 2}" y="${PRICE_H / 2}" text-anchor="middle" fill="${PRICE_TEXT}" font-family="${PRICE_FONT}" font-size="14">No price data</text>`,
    );
  }

  const first = rows[0].close;
  const last = rows[rows.length - 1].close;
  const isUp = last >= first;
  const lineColor = isUp ? PRICE_GREEN : PRICE_RED;

  const closes = rows.map((r) => r.close);
  let min = Math.min(...closes);
  let max = Math.max(...closes);
  let range = max - min;
  if (range < 0.001) range = 0.001;
  const headroom = range * 0.05;
  min -= headroom;
  max += headroom;
  range = max - min;

  const innerW = PRICE_W - PRICE_PAD_X * 2;
  const innerH = PRICE_H - PRICE_PAD_TOP - PRICE_PAD_BOT;
  const stepX = innerW / (rows.length - 1);
  const baselineY = PRICE_PAD_TOP + innerH;

  const yScale = (close: number) =>
    PRICE_PAD_TOP + innerH - ((close - min) / range) * innerH;

  const pts: Array<[number, number]> = rows.map((r, i) => [
    PRICE_PAD_X + i * stepX,
    yScale(r.close),
  ]);

  const lineD = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");

  const areaD =
    lineD +
    ` L${pts[pts.length - 1][0].toFixed(1)},${baselineY.toFixed(1)}` +
    ` L${pts[0][0].toFixed(1)},${baselineY.toFixed(1)} Z`;

  const lastX = pts[pts.length - 1][0];
  const lastY = pts[pts.length - 1][1];

  const pctChange = ((last - first) / first) * 100;
  const pctSign = pctChange >= 0 ? "+" : "";
  const pctStr = `${pctSign}${pctChange.toFixed(2)}%`;
  const lastPriceStr = `$${Math.round(last).toLocaleString("en-US")}`;

  const firstTs = rows[0].ts;
  const lastTs = rows[rows.length - 1].ts;
  const tsRange = lastTs - firstTs || 1;

  const tickLabels: string[] = [];
  const dayMs = 86_400_000;
  for (let d = 0; d < 7; d++) {
    const tickTs = firstTs + d * dayMs;
    const x = PRICE_PAD_X + ((tickTs - firstTs) / tsRange) * innerW;
    const dt = new Date(tickTs);
    const dayName = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][dt.getUTCDay()];
    const dayNum = String(dt.getUTCDate()).padStart(2, "0");
    tickLabels.push(
      `<text x="${x.toFixed(1)}" y="${(PRICE_H - 14).toFixed(1)}" text-anchor="middle" fill="${PRICE_TEXT}" font-family="${PRICE_FONT}" font-size="11">${escapeXml(`${dayName} ${dayNum}`)}</text>`,
    );
  }

  const gradId = isUp ? "priceFillUp" : "priceFillDown";
  const defs = `<defs><linearGradient id="${gradId}" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="${lineColor}" stop-opacity="0.35"/><stop offset="100%" stop-color="${lineColor}" stop-opacity="0"/></linearGradient></defs>`;

  const baseline = `<line x1="${PRICE_PAD_X}" y1="${baselineY.toFixed(1)}" x2="${(PRICE_W - PRICE_PAD_X).toFixed(1)}" y2="${baselineY.toFixed(1)}" stroke="${PRICE_GRID}" stroke-width="1"/>`;

  const titleEl = `<text x="${PRICE_PAD_X}" y="28" fill="${PRICE_TITLE}" font-family="${PRICE_FONT}" font-size="18" font-weight="600">BTC/USD · 7D</text>`;
  const lastPriceEl = `<text x="${(PRICE_W - PRICE_PAD_X).toFixed(1)}" y="28" text-anchor="end" font-family="${PRICE_FONT}" font-size="18"><tspan fill="${PRICE_TITLE}" font-weight="600">${escapeXml(lastPriceStr)}</tspan><tspan fill="${lineColor}"> · ${escapeXml(pctStr)}</tspan></text>`;

  const inner = [
    defs,
    baseline,
    `<path d="${areaD}" fill="url(#${gradId})"/>`,
    `<path d="${lineD}" fill="none" stroke="${lineColor}" stroke-width="2.5"/>`,
    `<circle cx="${lastX.toFixed(1)}" cy="${lastY.toFixed(1)}" r="4" fill="${lineColor}"/>`,
    titleEl,
    lastPriceEl,
    ...tickLabels,
  ].join("\n  ");

  return wrapPrice(inner);
}

function wrapPrice(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PRICE_W}" height="${PRICE_H}" viewBox="0 0 ${PRICE_W} ${PRICE_H}" role="img" aria-label="BTC/USD 7-day price chart">
  <rect width="${PRICE_W}" height="${PRICE_H}" fill="${PRICE_BG}"/>
  ${inner}
</svg>`;
}

// ─────────────────────────────────────────────────────────────────────────
// BTC ETF flows bar+line combo chart (current — sent as 2nd photo)
//
// Mirrors the dashboard view at /fundflow:
//   - Daily flow bars (green positive · red negative) on the left Y axis
//   - Cumulative line (orange) on the right Y axis
// Same width as the BTC price chart so Telegram media-album-stacks them
// at consistent visual scale.
// ─────────────────────────────────────────────────────────────────────────

const ETF_W = 1280;
const ETF_H = 400;
const ETF_PAD_X = 64;
const ETF_PAD_TOP = 50;
const ETF_PAD_BOT = 48;

const ETF_BG = "#0b0d12";
const ETF_GRID = "#1a1d2a";
const ETF_TEXT = "#9ca3af";
const ETF_TITLE = "#e5e7eb";
const ETF_GREEN = "#22c55e";
const ETF_RED = "#ef4444";
const ETF_ORANGE = "#f59e0b";

const ETF_FONT = "ui-monospace, SFMono-Regular, Menlo, monospace";

/**
 * BTC ETF daily flow bars + cumulative line. Pure / deterministic. Returns
 * a "No data" placeholder SVG when fewer than 2 valid rows survive the
 * NaN/Infinity guard.
 *
 * Last 30 rows of `flows` are used. Last bar's underlying value is also the
 * cumulative line's right-edge endpoint by construction
 * (`flows[last].btcCumulative`).
 */
export function buildBtcEtfFlowsBarChartSvg(flows: ETFFlow[]): string {
  const slice = (flows ?? [])
    .filter(
      (f) => Number.isFinite(f.btc) && Number.isFinite(f.btcCumulative),
    )
    .slice(-30);

  if (slice.length < 2) {
    return wrapEtf(
      `<text x="${ETF_W / 2}" y="${ETF_H / 2}" text-anchor="middle" fill="${ETF_TEXT}" font-family="${ETF_FONT}" font-size="14">No data</text>`,
    );
  }

  // Daily-flow scale (left axis): force zero inclusion so every bar sits on
  // a clear baseline regardless of whether the period is all-positive,
  // all-negative, or mixed.
  let dMin = Math.min(...slice.map((f) => f.btc), 0);
  let dMax = Math.max(...slice.map((f) => f.btc), 0);
  let dRange = dMax - dMin;
  if (dRange < 1) dRange = 1;
  const dPad = dRange * 0.08;
  dMin -= dPad;
  dMax += dPad;
  dRange = dMax - dMin;

  // Cumulative scale (right axis): independent of the bar scale.
  let cMin = Math.min(...slice.map((f) => f.btcCumulative));
  let cMax = Math.max(...slice.map((f) => f.btcCumulative));
  let cRange = cMax - cMin;
  if (cRange < 1) cRange = 1;
  const cPad = cRange * 0.05;
  cMin -= cPad;
  cMax += cPad;
  cRange = cMax - cMin;

  const innerW = ETF_W - ETF_PAD_X * 2;
  const innerH = ETF_H - ETF_PAD_TOP - ETF_PAD_BOT;

  const dailyY = (v: number) => ETF_PAD_TOP + innerH - ((v - dMin) / dRange) * innerH;
  const cumY = (v: number) => ETF_PAD_TOP + innerH - ((v - cMin) / cRange) * innerH;
  const zeroY = dailyY(0);

  const xStep = slice.length === 1 ? 0 : innerW / (slice.length - 1);
  const xPos = (i: number) => ETF_PAD_X + (slice.length === 1 ? innerW / 2 : i * xStep);
  const barWidth = Math.max(2, (xStep || innerW / slice.length) * 0.7);

  const bars = slice
    .map((f, i) => {
      const cx = xPos(i);
      const yPos = dailyY(f.btc);
      const yTop = Math.min(yPos, zeroY);
      const h = Math.max(1, Math.abs(yPos - zeroY));
      const fill = f.btc >= 0 ? ETF_GREEN : ETF_RED;
      return `<rect x="${(cx - barWidth / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${h.toFixed(1)}" fill="${fill}" fill-opacity="0.85"/>`;
    })
    .join("\n  ");

  const linePts = slice.map(
    (f, i) => [xPos(i), cumY(f.btcCumulative)] as const,
  );
  const lineD = linePts
    .map((p, i) => `${i === 0 ? "M" : "L"}${p[0].toFixed(1)},${p[1].toFixed(1)}`)
    .join(" ");
  const lastPt = linePts[linePts.length - 1];
  const lineEl = `<path d="${lineD}" fill="none" stroke="${ETF_ORANGE}" stroke-width="2.5"/>`;
  const lineDot = `<circle cx="${lastPt[0].toFixed(1)}" cy="${lastPt[1].toFixed(1)}" r="4" fill="${ETF_ORANGE}"/>`;

  // X-axis date ticks. Stride keeps labels from overlapping at any window
  // length the brief might pass (typically 28-30 rows = every-3rd day).
  const tickStride = slice.length > 14 ? 3 : slice.length > 7 ? 2 : 1;
  const xTicks: string[] = [];
  for (let i = 0; i < slice.length; i += tickStride) {
    const f = slice[i];
    const cx = xPos(i);
    const label = f.date.length === 10 ? f.date.slice(5) : f.date; // MM-DD
    xTicks.push(
      `<text x="${cx.toFixed(1)}" y="${(ETF_H - 14).toFixed(1)}" text-anchor="middle" fill="${ETF_TEXT}" font-family="${ETF_FONT}" font-size="11">${escapeXml(label)}</text>`,
    );
  }

  // Header: title (top-left) + 7D sum / cumulative summary (top-right).
  const lastFlow = slice[slice.length - 1];
  const sevenDayBtc = slice.slice(-7).reduce((a, f) => a + f.btc, 0);
  const summary = `7D ${fmtBnSigned(sevenDayBtc)} · CUM ${fmtBnSigned(lastFlow.btcCumulative)}`;
  const titleEl = `<text x="${ETF_PAD_X}" y="28" fill="${ETF_TITLE}" font-family="${ETF_FONT}" font-size="18" font-weight="600">BITCOIN ETF FLOWS</text>`;
  const summaryEl = `<text x="${(ETF_W - ETF_PAD_X).toFixed(1)}" y="28" text-anchor="end" fill="${ETF_TEXT}" font-family="${ETF_FONT}" font-size="14">${escapeXml(summary)}</text>`;

  // Zero baseline for the bars + light reference lines at min/max.
  const zeroLine = `<line x1="${ETF_PAD_X}" y1="${zeroY.toFixed(1)}" x2="${(ETF_W - ETF_PAD_X).toFixed(1)}" y2="${zeroY.toFixed(1)}" stroke="${ETF_GRID}" stroke-width="1"/>`;

  const leftLabels = [
    [dMax, dailyY(dMax)] as const,
    [0, zeroY] as const,
    [dMin, dailyY(dMin)] as const,
  ]
    .map(
      ([v, y]) =>
        `<text x="${(ETF_PAD_X - 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="end" fill="${ETF_TEXT}" font-family="${ETF_FONT}" font-size="10">${escapeXml(fmtBnSigned(v))}</text>`,
    )
    .join("\n  ");

  const rightLabels = [
    [cMax, cumY(cMax)] as const,
    [(cMin + cMax) / 2, cumY((cMin + cMax) / 2)] as const,
    [cMin, cumY(cMin)] as const,
  ]
    .map(
      ([v, y]) =>
        `<text x="${(ETF_W - ETF_PAD_X + 6).toFixed(1)}" y="${(y + 4).toFixed(1)}" text-anchor="start" fill="${ETF_ORANGE}" font-family="${ETF_FONT}" font-size="10">${escapeXml(fmtBnSigned(v))}</text>`,
    )
    .join("\n  ");

  const inner = [
    zeroLine,
    bars,
    lineEl,
    lineDot,
    titleEl,
    summaryEl,
    leftLabels,
    rightLabels,
    ...xTicks,
  ].join("\n  ");

  return wrapEtf(inner);
}

function wrapEtf(inner: string): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${ETF_W}" height="${ETF_H}" viewBox="0 0 ${ETF_W} ${ETF_H}" role="img" aria-label="BTC ETF daily flows + cumulative">
  <rect width="${ETF_W}" height="${ETF_H}" fill="${ETF_BG}"/>
  ${inner}
</svg>`;
}

function fmtBnSigned(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  if (abs >= 1e9) return `${sign}$${(abs / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${sign}$${(abs / 1e6).toFixed(0)}M`;
  if (abs >= 1e3) return `${sign}$${(abs / 1e3).toFixed(0)}K`;
  return `${sign}$${abs.toFixed(0)}`;
}

// ─────────────────────────────────────────────────────────────────────────
// SVG → PNG (shared)
// ─────────────────────────────────────────────────────────────────────────

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
    // Render at the SVG's intrinsic dimensions (was fit-to-600; the new
    // 1280×320 BTC price chart needs its full width).
    const r = new mod.Resvg(svg, { fitTo: { mode: "original" } });
    const png = r.render().asPng();
    return new Uint8Array(png);
  } catch {
    return null;
  }
}
