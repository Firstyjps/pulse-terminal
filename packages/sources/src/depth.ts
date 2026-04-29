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

const HUB = process.env.PULSE_HUB_URL ?? "http://127.0.0.1:8081";

async function fromHub(symbol: string): Promise<DepthBook | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 800);
    const res = await fetch(`${HUB}/depth?symbol=${symbol}`, { signal: ctrl.signal });
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
