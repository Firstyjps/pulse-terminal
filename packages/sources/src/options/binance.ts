// Binance options adapter (eapi.binance.com) — public REST.
// Ported from option-dashboard/src/api/binance.ts.

import { fetchJson } from "../_helpers.js";
import { normalizeExpiry } from "./_expiry.js";
import type { OptionAsset, OptionData } from "./types.js";

interface BinanceMark {
  symbol: string;
  markPrice: string;
  markIV: string;
  delta: string;
  theta: string;
  gamma: string;
  vega: string;
}

interface BinanceTicker {
  symbol: string;
  bidPrice: string;
  askPrice: string;
  volume: string;
  exercisePrice: string;
}

function parseSymbol(symbol: string) {
  const parts = symbol.split("-");
  if (parts.length < 4) return null;
  return {
    strike: parseFloat(parts[2]),
    side: parts[3] === "C" ? ("call" as const) : ("put" as const),
    expiry: parts[1],
  };
}

// Single in-process cache (Next.js route is server-side, single-request scope).
// We rely on Next.js fetch revalidate for cross-request caching instead.
async function getMarks(): Promise<BinanceMark[]> {
  const data = await fetchJson<unknown>(
    "https://eapi.binance.com/eapi/v1/mark",
    { revalidate: 25 },
  );
  if (!Array.isArray(data)) return [];
  return data as BinanceMark[];
}

async function getTickers(): Promise<BinanceTicker[]> {
  try {
    const data = await fetchJson<unknown>(
      "https://eapi.binance.com/eapi/v1/ticker",
      { revalidate: 25 },
    );
    return Array.isArray(data) ? (data as BinanceTicker[]) : [];
  } catch {
    return [];
  }
}

export async function fetchBinanceOptions(
  asset: OptionAsset,
): Promise<{ options: OptionData[]; expiries: string[]; underlyingPrice: number }> {
  const [marks, tickers] = await Promise.all([getMarks(), getTickers()]);

  const prefix = `${asset}-`;
  const matchedMarks = marks.filter((m) => m.symbol.startsWith(prefix));
  const tickerMap = new Map<string, BinanceTicker>();
  tickers.filter((t) => t.symbol.startsWith(prefix)).forEach((t) => tickerMap.set(t.symbol, t));

  const expiries = new Set<string>();
  const options: OptionData[] = [];
  let underlyingPrice = 0;

  for (const m of matchedMarks) {
    const parsed = parseSymbol(m.symbol);
    if (!parsed) continue;

    const normExpiry = normalizeExpiry(parsed.expiry);
    expiries.add(normExpiry);
    const mark = parseFloat(m.markPrice) || 0;
    if (mark <= 0) continue;

    const ticker = tickerMap.get(m.symbol);
    const exPrice = parseFloat(ticker?.exercisePrice ?? "0");
    if (exPrice > 0) underlyingPrice = exPrice;

    options.push({
      strike: parsed.strike,
      exchange: "Binance",
      side: parsed.side,
      asset,
      expiry: normExpiry,
      bid: parseFloat(ticker?.bidPrice ?? "0") || 0,
      ask: parseFloat(ticker?.askPrice ?? "0") || 0,
      mark,
      iv: +(parseFloat(m.markIV ?? "0") * 100).toFixed(1),
      delta: parseFloat(m.delta ?? "0"),
      gamma: parseFloat(m.gamma ?? "0"),
      theta: parseFloat(m.theta ?? "0"),
      vega: parseFloat(m.vega ?? "0"),
      oi: 0,
      volume: Math.round(parseFloat(ticker?.volume ?? "0") || 0),
      size_bid: 0,
      size_ask: 0,
    });
  }

  return { options, expiries: Array.from(expiries).sort(), underlyingPrice };
}
