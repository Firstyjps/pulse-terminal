// Order book depth — top-N bids/asks for a symbol.
// Primary path: realtime hub at PULSE_HUB_URL (sub-50ms cached).
// Fallback: direct Binance /depth REST when hub unavailable.

import { fetchJson } from "./_helpers.js";

export interface DepthBook {
  symbol: string;
  bids: [number, number][]; // [price, qty] sorted: highest bid first
  asks: [number, number][]; // [price, qty] sorted: lowest ask first
  ts: number; // ms epoch
}

interface BinanceDepthResp {
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId: number;
}

async function fromHub(symbol: string): Promise<DepthBook | null> {
  const hub = process.env.PULSE_HUB_URL ?? "http://127.0.0.1:8081";
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${hub}/depth?symbol=${symbol}`, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return null;
    return (await res.json()) as DepthBook;
  } catch {
    return null;
  }
}

export async function getDepth(symbol: string, limit = 20): Promise<DepthBook> {
  const sym = symbol.toUpperCase();
  // Try hub cache first
  const cached = await fromHub(sym);
  if (cached) return cached;

  // Fall back to Binance REST
  const cap = Math.max(5, Math.min(100, limit));
  const data = await fetchJson<BinanceDepthResp>(
    `https://api.binance.com/api/v3/depth?symbol=${sym}&limit=${cap}`,
    { revalidate: 5, retries: 1 },
  );
  return {
    symbol: sym,
    bids: data.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)] as [number, number]),
    asks: data.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)] as [number, number]),
    ts: Date.now(),
  };
}

// ── Order book analysis ──────────────────────────────────────────────────────
// The raw top-of-book (get_depth) spans only a few dollars on liquid pairs and
// is useless as support/resistance. analyzeOrderBook() pulls the deep book
// (REST limit=5000) and pre-computes the numbers a brief actually needs:
// liquidity walls with distance from mid, cumulative depth bands, imbalance.

export interface DepthBand {
  pct: number; // band half-width, % of mid
  bidUsd: number; // cumulative bid notional within [mid*(1-pct%), mid]
  askUsd: number; // cumulative ask notional within [mid, mid*(1+pct%)]
  ratio: number; // bidUsd / askUsd; 0 when both sides empty
}

export interface DepthWall {
  price: number; // qty-weighted average price of the cluster
  qty: number; // base-asset qty in the cluster
  usd: number; // notional of the cluster
  distPct: number; // signed distance from mid, % (bids negative, asks positive)
}

export interface DepthAnalysis {
  symbol: string;
  ts: number;
  mid: number;
  spreadUsd: number;
  spreadPct: number;
  bands: DepthBand[]; // ±0.5 / 1 / 2 / 5 %
  supportWalls: DepthWall[]; // largest bid clusters within range, nearest first
  resistanceWalls: DepthWall[]; // largest ask clusters within range, nearest first
  // How far the fetched book actually reaches from mid, so shallow coverage
  // is visible instead of silently under-reporting the outer bands.
  coverage: { bidPct: number; askPct: number; bidLevels: number; askLevels: number };
  source: "rest-deep" | "hub-shallow";
}

const BAND_PCTS = [0.5, 1, 2, 5];
const WALL_RANGE_PCT = 5; // consider clusters within ±5% of mid
const WALL_BUCKET_PCT = 0.25; // cluster (bucket) width, % of mid
const WALL_TOP_N = 4;
const WALL_MIN_PROMINENCE = 0.1; // drop clusters smaller than 10% of the side's largest

type SourcedBook = DepthBook & { source: DepthAnalysis["source"] };

async function fetchDeepBook(sym: string): Promise<SourcedBook> {
  try {
    const data = await fetchJson<BinanceDepthResp>(
      `https://api.binance.com/api/v3/depth?symbol=${sym}&limit=5000`,
      { revalidate: 5, retries: 1 },
    );
    return {
      symbol: sym,
      ts: Date.now(),
      source: "rest-deep",
      bids: data.bids.map(([p, q]) => [parseFloat(p), parseFloat(q)] as [number, number]),
      asks: data.asks.map(([p, q]) => [parseFloat(p), parseFloat(q)] as [number, number]),
    };
  } catch (err) {
    const cached = await fromHub(sym);
    if (cached) return { ...cached, source: "hub-shallow" };
    throw err;
  }
}

function cumulativeUsd(levels: [number, number][], mid: number, pct: number): number {
  const lo = mid * (1 - pct / 100);
  const hi = mid * (1 + pct / 100);
  let usd = 0;
  for (const [price, qty] of levels) {
    if (price < lo || price > hi) continue;
    usd += price * qty;
  }
  return usd;
}

function findWalls(levels: [number, number][], mid: number): DepthWall[] {
  const bucketWidth = (mid * WALL_BUCKET_PCT) / 100;
  const lo = mid * (1 - WALL_RANGE_PCT / 100);
  const hi = mid * (1 + WALL_RANGE_PCT / 100);
  const buckets = new Map<number, { qty: number; usd: number }>();
  for (const [price, qty] of levels) {
    if (price < lo || price > hi) continue;
    const key = Math.floor(price / bucketWidth);
    const b = buckets.get(key) ?? { qty: 0, usd: 0 };
    b.qty += qty;
    b.usd += price * qty;
    buckets.set(key, b);
  }
  const clusters = [...buckets.values()]
    .map((b) => ({
      price: b.usd / b.qty, // qty-weighted average price of the cluster
      qty: b.qty,
      usd: b.usd,
      distPct: (b.usd / b.qty / mid - 1) * 100,
    }))
    .sort((a, b) => b.usd - a.usd);
  // A wall must stand out: near-mid noise buckets a fraction of the largest
  // cluster's size are not tradeable levels.
  const floor = (clusters[0]?.usd ?? 0) * WALL_MIN_PROMINENCE;
  return clusters
    .filter((c) => c.usd >= floor)
    .slice(0, WALL_TOP_N)
    .sort((a, b) => Math.abs(a.distPct) - Math.abs(b.distPct));
}

export async function analyzeOrderBook(symbol: string): Promise<DepthAnalysis> {
  const sym = symbol.toUpperCase();
  const book = await fetchDeepBook(sym);
  if (!book.bids.length || !book.asks.length) {
    throw new Error(`empty order book for ${sym}`);
  }

  const bestBid = book.bids[0][0];
  const bestAsk = book.asks[0][0];
  const mid = (bestBid + bestAsk) / 2;
  const spreadUsd = bestAsk - bestBid;

  const bands: DepthBand[] = BAND_PCTS.map((pct) => {
    const bidUsd = cumulativeUsd(book.bids, mid, pct);
    const askUsd = cumulativeUsd(book.asks, mid, pct);
    return { pct, bidUsd, askUsd, ratio: askUsd > 0 ? bidUsd / askUsd : 0 };
  });

  const lastBid = book.bids[book.bids.length - 1][0];
  const lastAsk = book.asks[book.asks.length - 1][0];

  return {
    symbol: sym,
    ts: book.ts,
    mid,
    spreadUsd,
    spreadPct: (spreadUsd / mid) * 100,
    bands,
    supportWalls: findWalls(book.bids, mid),
    resistanceWalls: findWalls(book.asks, mid),
    coverage: {
      bidPct: (1 - lastBid / mid) * 100,
      askPct: (lastAsk / mid - 1) * 100,
      bidLevels: book.bids.length,
      askLevels: book.asks.length,
    },
    source: book.source,
  };
}
