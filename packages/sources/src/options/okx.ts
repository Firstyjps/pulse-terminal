// OKX options adapter — public REST. Only BTC + ETH (no SOL options on OKX).

import { fetchJson } from "../_helpers.js";
import { normalizeExpiry } from "./_expiry.js";
import type { OptionAsset, OptionData } from "./types.js";

interface OKXTicker {
  instId: string;
  bidPx: string;
  bidSz: string;
  askPx: string;
  askSz: string;
  last: string;
  vol24h: string;
  oi: string;
}

interface OKXOptSummary {
  instId: string;
  delta: string;
  deltaBS: string;
  gamma: string;
  gammaBS: string;
  theta: string;
  thetaBS: string;
  vega: string;
  vegaBS: string;
  markVol: string;
}

const OKX_FAMILY: Record<OptionAsset, string | null> = {
  BTC: "BTC-USD",
  ETH: "ETH-USD",
  SOL: null, // not available on OKX
};

function parseInstId(instId: string) {
  const parts = instId.split("-");
  if (parts.length < 5) return null;
  return {
    strike: parseFloat(parts[3]),
    side: parts[4] === "C" ? ("call" as const) : ("put" as const),
    expiry: parts[2],
  };
}

export async function fetchOkxOptions(
  asset: OptionAsset,
): Promise<{ options: OptionData[]; expiries: string[]; underlyingPrice: number }> {
  const family = OKX_FAMILY[asset];
  if (!family) return { options: [], expiries: [], underlyingPrice: 0 };

  const [tickerJson, summaryJson, indexJson] = await Promise.all([
    fetchJson<{ data?: OKXTicker[] }>(
      `https://www.okx.com/api/v5/market/tickers?instType=OPTION&instFamily=${family}`,
      { revalidate: 25 },
    ),
    fetchJson<{ data?: OKXOptSummary[] }>(
      `https://www.okx.com/api/v5/public/opt-summary?instFamily=${family}`,
      { revalidate: 25 },
    ),
    fetchJson<{ data?: { idxPx: string }[] }>(
      `https://www.okx.com/api/v5/market/index-tickers?instId=${asset}-USD`,
      { revalidate: 15 },
    ).catch(() => ({ data: [] })),
  ]);

  const tickers = tickerJson.data ?? [];
  const summaries = summaryJson.data ?? [];
  const greeksMap = new Map<string, OKXOptSummary>();
  summaries.forEach((s) => greeksMap.set(s.instId, s));

  const underlyingPrice = parseFloat(indexJson.data?.[0]?.idxPx ?? "0") || 0;

  const expiries = new Set<string>();
  const options: OptionData[] = [];

  for (const t of tickers) {
    const parsed = parseInstId(t.instId);
    if (!parsed) continue;

    const normExpiry = normalizeExpiry(parsed.expiry);
    expiries.add(normExpiry);

    // OKX BTC/ETH option prices are fraction of underlying.
    const bidRaw = parseFloat(t.bidPx) || 0;
    const askRaw = parseFloat(t.askPx) || 0;
    const lastRaw = parseFloat(t.last) || 0;
    const markRaw = (bidRaw + askRaw) / 2 || lastRaw;

    if (markRaw <= 0) continue;

    const multiplier = underlyingPrice > 0 ? underlyingPrice : 1;
    const greeks = greeksMap.get(t.instId);

    options.push({
      strike: parsed.strike,
      exchange: "OKX",
      side: parsed.side,
      asset,
      expiry: normExpiry,
      bid: +(bidRaw * multiplier).toFixed(2),
      ask: +(askRaw * multiplier).toFixed(2),
      mark: +(markRaw * multiplier).toFixed(2),
      iv: +(parseFloat(greeks?.markVol ?? "0") * 100).toFixed(1),
      delta: parseFloat(greeks?.deltaBS ?? greeks?.delta ?? "0"),
      gamma: parseFloat(greeks?.gammaBS ?? greeks?.gamma ?? "0"),
      theta: parseFloat(greeks?.thetaBS ?? greeks?.theta ?? "0"),
      vega: parseFloat(greeks?.vegaBS ?? greeks?.vega ?? "0"),
      oi: Math.round(parseFloat(t.oi) || 0),
      volume: Math.round(parseFloat(t.vol24h) || 0),
      size_bid: Math.round(parseFloat(t.bidSz) || 0),
      size_ask: Math.round(parseFloat(t.askSz) || 0),
    });
  }

  return { options, expiries: Array.from(expiries).sort(), underlyingPrice };
}
