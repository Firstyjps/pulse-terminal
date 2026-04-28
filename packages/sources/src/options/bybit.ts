// Bybit options adapter — public REST.
// Ported from option-dashboard/src/api/bybit.ts.

import { fetchJson } from "../_helpers.js";
import { normalizeExpiry } from "./_expiry.js";
import type { OptionAsset, OptionData } from "./types.js";

interface BybitTicker {
  symbol: string;
  bid1Price: string;
  bid1Size: string;
  ask1Price: string;
  ask1Size: string;
  markPrice: string;
  markIv: string;
  underlyingPrice: string;
  delta: string;
  gamma: string;
  theta: string;
  vega: string;
  openInterest: string;
  volume24h: string;
}

function parseSymbol(symbol: string) {
  const parts = symbol.replace(/-USDT$/, "").split("-");
  if (parts.length < 4) return null;
  return {
    strike: parseFloat(parts[2]),
    side: parts[3] === "C" ? ("call" as const) : ("put" as const),
    expiry: parts[1],
  };
}

export async function fetchBybitOptions(
  asset: OptionAsset,
): Promise<{ options: OptionData[]; expiries: string[]; underlyingPrice: number }> {
  const json = await fetchJson<{
    result?: { list: BybitTicker[] };
    retCode?: number;
    retMsg?: string;
  }>(
    `https://api.bybit.com/v5/market/tickers?category=option&baseCoin=${asset}`,
    { revalidate: 25 },
  );
  if (json.retCode !== undefined && json.retCode !== 0) {
    throw new Error(`Bybit ${json.retCode}: ${json.retMsg ?? "?"}`);
  }
  const list = json.result?.list ?? [];

  const expiries = new Set<string>();
  const options: OptionData[] = [];
  let underlyingPrice = 0;

  for (const t of list) {
    const parsed = parseSymbol(t.symbol);
    if (!parsed) continue;

    const normExpiry = normalizeExpiry(parsed.expiry);
    expiries.add(normExpiry);
    const mark = parseFloat(t.markPrice) || 0;
    if (mark <= 0) continue;

    const uPrice = parseFloat(t.underlyingPrice) || 0;
    if (uPrice > 0) underlyingPrice = uPrice;

    options.push({
      strike: parsed.strike,
      exchange: "Bybit",
      side: parsed.side,
      asset,
      expiry: normExpiry,
      bid: parseFloat(t.bid1Price) || 0,
      ask: parseFloat(t.ask1Price) || 0,
      mark,
      iv: +(parseFloat(t.markIv) * 100 || 0).toFixed(1),
      delta: parseFloat(t.delta) || 0,
      gamma: parseFloat(t.gamma) || 0,
      theta: parseFloat(t.theta) || 0,
      vega: parseFloat(t.vega) || 0,
      oi: Math.round(parseFloat(t.openInterest) || 0),
      volume: Math.round(parseFloat(t.volume24h) || 0),
      size_bid: Math.round(parseFloat(t.bid1Size) || 0),
      size_ask: Math.round(parseFloat(t.ask1Size) || 0),
    });
  }

  return { options, expiries: Array.from(expiries).sort(), underlyingPrice };
}
