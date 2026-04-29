// Multi-exchange options aggregator. Fans out + Promise.allSettled.

import { fetchDeribitOptions } from "./deribit.js";
import { fetchBinanceOptions } from "./binance.js";
import { fetchBybitOptions } from "./bybit.js";
import { fetchOkxOptions } from "./okx.js";
import type {
  OptionAsset,
  OptionExchange,
  OptionData,
  OptionsAggregateResponse,
  OptionsArbitrage,
} from "./types.js";

export async function getOptionsAggregate(asset: OptionAsset): Promise<OptionsAggregateResponse> {
  const fetchers: { exchange: OptionExchange; fn: () => Promise<{ options: OptionData[]; expiries: string[]; underlyingPrice: number }> }[] = [
    { exchange: "Deribit", fn: () => fetchDeribitOptions(asset) },
    { exchange: "Bybit",   fn: () => fetchBybitOptions(asset) },
    { exchange: "Binance", fn: () => fetchBinanceOptions(asset) },
  ];
  if (asset === "BTC" || asset === "ETH") {
    fetchers.push({ exchange: "OKX", fn: () => fetchOkxOptions(asset) });
  }

  const results = await Promise.allSettled(fetchers.map((f) => f.fn()));

  const errors: { exchange: OptionExchange; error: string }[] = [];
  let allOptions: OptionData[] = [];
  let underlyingPrice = 0;
  const allExpiries = new Set<string>();

  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      allOptions = allOptions.concat(r.value.options);
      r.value.expiries.forEach((e) => allExpiries.add(e));
      if (r.value.underlyingPrice > 0) underlyingPrice = r.value.underlyingPrice;
    } else {
      errors.push({
        exchange: fetchers[i].exchange,
        error: r.reason instanceof Error ? r.reason.message : String(r.reason),
      });
    }
  });

  const strikes = Array.from(new Set(allOptions.map((o) => o.strike))).sort((a, b) => a - b);
  const expiries = Array.from(allExpiries).sort();

  return {
    options: allOptions,
    underlyingPrice,
    strikes,
    expiries,
    errors,
    ts: Date.now(),
  };
}

/**
 * Find cross-venue arbitrage: same strike+side+expiry, buy ask < sell bid → free spread.
 * Filters out tiny spreads + bad quotes.
 */
export function findOptionsArbitrage(opts: OptionData[], minSpreadPct = 5): OptionsArbitrage[] {
  type Key = string;
  const grouped = new Map<Key, OptionData[]>();
  for (const o of opts) {
    if (o.bid <= 0 || o.ask <= 0) continue;
    const k = `${o.asset}|${o.expiry}|${o.strike}|${o.side}`;
    const arr = grouped.get(k) ?? [];
    arr.push(o);
    grouped.set(k, arr);
  }

  const out: OptionsArbitrage[] = [];
  for (const arr of grouped.values()) {
    if (arr.length < 2) continue;
    for (const buy of arr) {
      for (const sell of arr) {
        if (buy.exchange === sell.exchange) continue;
        if (sell.bid > buy.ask) {
          const spread = sell.bid - buy.ask;
          const mid = (sell.bid + buy.ask) / 2;
          const spreadPct = mid > 0 ? (spread / mid) * 100 : 0;
          if (spreadPct >= minSpreadPct) {
            out.push({
              asset: buy.asset,
              expiry: buy.expiry,
              strike: buy.strike,
              side: buy.side,
              buyExchange: buy.exchange,
              buyAsk: buy.ask,
              sellExchange: sell.exchange,
              sellBid: sell.bid,
              spread,
              spreadPercent: +spreadPct.toFixed(2),
            });
          }
        }
      }
    }
  }
  return out.sort((a, b) => b.spreadPercent - a.spreadPercent).slice(0, 50);
}

/**
 * IV smile per expiry — points (strike, iv) sorted by strike, separated by side.
 */
export function buildIVSmile(opts: OptionData[], asset: OptionAsset, expiry: string) {
  const filtered = opts.filter((o) => o.asset === asset && o.expiry === expiry && o.iv > 0);
  const calls = filtered.filter((o) => o.side === "call").sort((a, b) => a.strike - b.strike);
  const puts = filtered.filter((o) => o.side === "put").sort((a, b) => a.strike - b.strike);
  return {
    asset,
    expiry,
    calls: calls.map((o) => ({ strike: o.strike, iv: o.iv, exchange: o.exchange })),
    puts: puts.map((o) => ({ strike: o.strike, iv: o.iv, exchange: o.exchange })),
  };
}
