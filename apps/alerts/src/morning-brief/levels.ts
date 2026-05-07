import { getDepth, type DepthBook } from "@pulse/sources/server";

export const SUPPORT_RESISTANCE_SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"] as const;

export type SupportResistanceSymbol = (typeof SUPPORT_RESISTANCE_SYMBOLS)[number];
export type SupportResistanceTag = "pivot" | "liquidity" | "confluence";

export interface OhlcRow {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SupportResistanceLevel {
  price: number;
  tag: SupportResistanceTag;
}

export interface SymbolSupportResistance {
  symbol: SupportResistanceSymbol;
  status: "ok" | "unavailable";
  current: number | null;
  support: {
    s1: SupportResistanceLevel | null;
    s2: SupportResistanceLevel | null;
  };
  resistance: {
    r1: SupportResistanceLevel | null;
    r2: SupportResistanceLevel | null;
  };
  error?: string;
}

export interface FetchSupportResistanceOpts {
  fetchImpl?: typeof fetch;
  fetchDepth?: (symbol: SupportResistanceSymbol, limit: number) => Promise<DepthBook>;
}

type BinanceKline = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

interface CandidateLevel {
  price: number;
  tag: SupportResistanceTag;
  weight: number;
}

const KLINE_LIMIT = 168;
const DEPTH_LIMIT = 100;
const BINANCE_KLINES_URL = "https://api.binance.com/api/v3/klines";
const MERGE_DISTANCE_PCT = 0.0025;

async function fetchKlines7d(
  symbol: SupportResistanceSymbol,
  fetchImpl: typeof fetch,
): Promise<OhlcRow[]> {
  const url = `${BINANCE_KLINES_URL}?symbol=${symbol}&interval=1h&limit=${KLINE_LIMIT}`;
  const res = await fetchImpl(url, { cache: "no-store" } as RequestInit);
  if (!res.ok) throw new Error(`klines ${symbol} ${res.status}`);

  const raw = (await res.json()) as BinanceKline[];
  if (!Array.isArray(raw)) throw new Error(`klines ${symbol} malformed`);

  const rows = raw
    .slice(-KLINE_LIMIT)
    .map((k) => ({
      ts: k[0],
      open: Number.parseFloat(k[1]),
      high: Number.parseFloat(k[2]),
      low: Number.parseFloat(k[3]),
      close: Number.parseFloat(k[4]),
      volume: Number.parseFloat(k[5]),
    }))
    .filter(
      (r) =>
        Number.isFinite(r.ts) &&
        Number.isFinite(r.open) &&
        Number.isFinite(r.high) &&
        Number.isFinite(r.low) &&
        Number.isFinite(r.close) &&
        Number.isFinite(r.volume),
    );

  if (rows.length < 24) throw new Error(`klines ${symbol} insufficient rows`);
  return rows;
}

function near(a: number, b: number): boolean {
  const basis = Math.max(Math.abs(a), Math.abs(b), 1);
  return Math.abs(a - b) / basis <= MERGE_DISTANCE_PCT;
}

function clusterPrices(prices: number[], tag: SupportResistanceTag): CandidateLevel[] {
  const sorted = prices.filter(Number.isFinite).sort((a, b) => a - b);
  const clusters: number[][] = [];

  for (const price of sorted) {
    const last = clusters.at(-1);
    if (last && near(last.reduce((sum, x) => sum + x, 0) / last.length, price)) {
      last.push(price);
    } else {
      clusters.push([price]);
    }
  }

  return clusters.map((cluster) => ({
    price: cluster.reduce((sum, x) => sum + x, 0) / cluster.length,
    tag,
    weight: cluster.length,
  }));
}

function pivotCandidates(rows: OhlcRow[]): CandidateLevel[] {
  const lows: number[] = [];
  const highs: number[] = [];
  const lookback = 2;

  for (let i = lookback; i < rows.length - lookback; i++) {
    const row = rows[i];
    const window = rows.slice(i - lookback, i + lookback + 1);
    if (row.low === Math.min(...window.map((r) => r.low))) lows.push(row.low);
    if (row.high === Math.max(...window.map((r) => r.high))) highs.push(row.high);
  }

  const recent = rows.slice(-24);
  lows.push(...recent.map((r) => r.low), Math.min(...rows.map((r) => r.low)));
  highs.push(...recent.map((r) => r.high), Math.max(...rows.map((r) => r.high)));

  return [...clusterPrices(lows, "pivot"), ...clusterPrices(highs, "pivot")];
}

function liquidityCandidates(book: DepthBook): CandidateLevel[] {
  const fromSide = (levels: [number, number][]) => {
    const notionals = levels
      .map(([price, qty]) => ({ price, notional: price * qty }))
      .filter((x) => Number.isFinite(x.price) && Number.isFinite(x.notional) && x.notional > 0)
      .sort((a, b) => b.notional - a.notional);

    return notionals.slice(0, 8).map((x, idx) => ({
      price: x.price,
      tag: "liquidity" as const,
      weight: notionals.length - idx,
    }));
  };

  return clusterPrices(
    [...fromSide(book.bids), ...fromSide(book.asks)].map((x) => x.price),
    "liquidity",
  );
}

function mergeCandidates(candidates: CandidateLevel[]): CandidateLevel[] {
  const sorted = [...candidates].sort((a, b) => a.price - b.price);
  const merged: CandidateLevel[] = [];

  for (const candidate of sorted) {
    const last = merged.at(-1);
    if (!last || !near(last.price, candidate.price)) {
      merged.push({ ...candidate });
      continue;
    }

    const weight = last.weight + candidate.weight;
    last.price = (last.price * last.weight + candidate.price * candidate.weight) / weight;
    last.weight = weight;
    last.tag =
      last.tag === candidate.tag && last.tag !== "confluence" ? last.tag : "confluence";
  }

  return merged;
}

function pickLevels(
  candidates: CandidateLevel[],
  current: number,
): Pick<SymbolSupportResistance, "support" | "resistance"> {
  const normalize = (level: CandidateLevel): SupportResistanceLevel => ({
    price: level.price,
    tag: level.tag,
  });

  const support = candidates
    .filter((x) => x.price < current)
    .sort((a, b) => b.price - a.price)
    .slice(0, 2)
    .map(normalize);

  const resistance = candidates
    .filter((x) => x.price > current)
    .sort((a, b) => a.price - b.price)
    .slice(0, 2)
    .map(normalize);

  return {
    support: { s1: support[0] ?? null, s2: support[1] ?? null },
    resistance: { r1: resistance[0] ?? null, r2: resistance[1] ?? null },
  };
}

function unavailable(
  symbol: SupportResistanceSymbol,
  err: unknown,
): SymbolSupportResistance {
  return {
    symbol,
    status: "unavailable",
    current: null,
    support: { s1: null, s2: null },
    resistance: { r1: null, r2: null },
    error: err instanceof Error ? err.message.slice(0, 160) : String(err).slice(0, 160),
  };
}

async function buildForSymbol(
  symbol: SupportResistanceSymbol,
  opts: Required<FetchSupportResistanceOpts>,
): Promise<SymbolSupportResistance> {
  let rows: OhlcRow[];
  try {
    rows = await fetchKlines7d(symbol, opts.fetchImpl);
  } catch (err) {
    return unavailable(symbol, err);
  }

  const current = rows.at(-1)?.close;
  if (typeof current !== "number" || !Number.isFinite(current)) {
    return unavailable(symbol, new Error(`klines ${symbol} no current`));
  }

  const candidates = pivotCandidates(rows);
  try {
    const depth = await opts.fetchDepth(symbol, DEPTH_LIMIT);
    candidates.push(...liquidityCandidates(depth));
  } catch {
    // OHLC-only fallback is intentional: formatter still gets pivot levels.
  }

  const levels = pickLevels(mergeCandidates(candidates), current);
  return { symbol, status: "ok", current, ...levels };
}

export async function fetchSupportResistance(
  opts: FetchSupportResistanceOpts = {},
): Promise<SymbolSupportResistance[]> {
  const resolved: Required<FetchSupportResistanceOpts> = {
    fetchImpl: opts.fetchImpl ?? fetch,
    fetchDepth: opts.fetchDepth ?? ((symbol, limit) => getDepth(symbol, limit)),
  };

  return Promise.all(SUPPORT_RESISTANCE_SYMBOLS.map((symbol) => buildForSymbol(symbol, resolved)));
}
