import type { Exchange, FundingRate, OpenInterest } from "./types.js";
import { fetchJson } from "./_helpers.js";

// ── Binance ─────────────────────────────────────────────────────────────────
type BinancePremium = {
  symbol: string;
  lastFundingRate: string;
  nextFundingTime: number;
  time: number;
};

async function getBinanceFunding(symbol?: string): Promise<FundingRate[]> {
  const url = symbol
    ? `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`
    : `https://fapi.binance.com/fapi/v1/premiumIndex`;
  const data = await fetchJson<BinancePremium | BinancePremium[]>(url, { revalidate: 60 });
  const arr = Array.isArray(data) ? data : [data];
  return arr
    .filter((p) => p.symbol.endsWith("USDT") && p.lastFundingRate)
    .map((p) => {
      const rate = parseFloat(p.lastFundingRate);
      return {
        exchange: "binance" as const,
        symbol: p.symbol,
        rate,
        ratePercent: rate * 100,
        nextFundingTime: p.nextFundingTime,
        ts: p.time,
      };
    });
}

type BinanceOI = { symbol: string; openInterest: string; time: number };

async function getBinanceOI(symbol: string): Promise<OpenInterest> {
  const data = await fetchJson<BinanceOI>(
    `https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`,
    { revalidate: 60 },
  );
  const oi = parseFloat(data.openInterest);
  // Get mark price for USD notional
  const mark = await fetchJson<{ markPrice: string }>(
    `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
    { revalidate: 60 },
  );
  const price = parseFloat(mark.markPrice);
  return {
    exchange: "binance",
    symbol,
    oi,
    oiUsd: oi * price,
    ts: data.time,
  };
}

// ── Bybit ───────────────────────────────────────────────────────────────────
type BybitTicker = {
  symbol: string;
  fundingRate: string;
  nextFundingTime: string;
  openInterest: string;
  openInterestValue: string;
  markPrice: string;
};
type BybitResp = { result: { list: BybitTicker[] }; time: number };

async function getBybitFunding(symbol?: string): Promise<FundingRate[]> {
  const url = symbol
    ? `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`
    : `https://api.bybit.com/v5/market/tickers?category=linear`;
  const json = await fetchJson<BybitResp>(url, { revalidate: 60 });
  return json.result.list
    .filter((t) => t.symbol.endsWith("USDT") && t.fundingRate)
    .map((t) => {
      const rate = parseFloat(t.fundingRate);
      return {
        exchange: "bybit" as const,
        symbol: t.symbol,
        rate,
        ratePercent: rate * 100,
        nextFundingTime: parseInt(t.nextFundingTime, 10),
        ts: json.time,
      };
    });
}

async function getBybitOI(symbol: string): Promise<OpenInterest> {
  const json = await fetchJson<BybitResp>(
    `https://api.bybit.com/v5/market/tickers?category=linear&symbol=${symbol}`,
    { revalidate: 60 },
  );
  const t = json.result.list[0];
  return {
    exchange: "bybit",
    symbol,
    oi: parseFloat(t.openInterest),
    oiUsd: parseFloat(t.openInterestValue),
    ts: json.time,
  };
}

// ── OKX ─────────────────────────────────────────────────────────────────────
type OkxFunding = {
  instId: string;
  fundingRate: string;
  nextFundingTime: string;
  ts: string;
};
type OkxResp<T> = { code: string; data: T[] };

function okxSymbolToInstId(s: string): string {
  // BTCUSDT → BTC-USDT-SWAP
  if (s.includes("-")) return s;
  const base = s.replace(/USDT$/, "");
  return `${base}-USDT-SWAP`;
}

type OkxInstrument = { instId: string; instType: string; settleCcy: string; state: string };

async function getOkxFunding(symbol?: string): Promise<FundingRate[]> {
  if (!symbol) {
    // OKX has no batch funding endpoint — fetch the top USDT-settled SWAP instruments,
    // then call funding-rate per-instrument in parallel. Result is cached upstream for 60s.
    let instruments: string[] = [];
    try {
      const list = await fetchJson<OkxResp<OkxInstrument>>(
        "https://www.okx.com/api/v5/public/instruments?instType=SWAP",
        { revalidate: 3600 },
      );
      instruments = list.data
        .filter((i) => i.settleCcy === "USDT" && i.state === "live" && i.instId.endsWith("-USDT-SWAP"))
        .map((i) => i.instId)
        .slice(0, 80); // cap to keep latency + rate-limit safe
    } catch {
      // fall back to a sane default set if the listing call fails
      instruments = [
        "BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP", "BNB-USDT-SWAP", "XRP-USDT-SWAP",
        "DOGE-USDT-SWAP", "ADA-USDT-SWAP", "AVAX-USDT-SWAP", "LINK-USDT-SWAP", "DOT-USDT-SWAP",
      ];
    }
    const results = await Promise.allSettled(instruments.map((id) => getOkxFunding(id)));
    return results.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  }
  const instId = okxSymbolToInstId(symbol);
  const json = await fetchJson<OkxResp<OkxFunding>>(
    `https://www.okx.com/api/v5/public/funding-rate?instId=${instId}`,
    { revalidate: 60 },
  );
  return json.data.map((d) => {
    const rate = parseFloat(d.fundingRate);
    return {
      exchange: "okx" as const,
      symbol: d.instId,
      rate,
      ratePercent: rate * 100,
      nextFundingTime: parseInt(d.nextFundingTime, 10),
      ts: parseInt(d.ts, 10),
    };
  });
}

type OkxOiPoint = { instId: string; oi: string; oiCcy: string; oiUsd: string; ts: string };

async function getOkxOI(symbol: string): Promise<OpenInterest> {
  const instId = okxSymbolToInstId(symbol);
  const json = await fetchJson<OkxResp<OkxOiPoint>>(
    `https://www.okx.com/api/v5/public/open-interest?instType=SWAP&instId=${instId}`,
    { revalidate: 60 },
  );
  const p = json.data[0];
  return {
    exchange: "okx",
    symbol: p.instId,
    oi: parseFloat(p.oi),
    oiUsd: parseFloat(p.oiUsd),
    ts: parseInt(p.ts, 10),
  };
}

// ── Deribit ─────────────────────────────────────────────────────────────────
// Deribit's perpetuals are inverse contracts ($10/contract for BTC-PERPETUAL).
// `/public/ticker` returns funding_8h + open_interest + mark_price in one shot,
// so a single endpoint covers both adapters. Funding on Deribit is paid
// continuously rather than at fixed 8h boundaries — `funding_8h` is the
// realised 8-hour rate and is the directly comparable value to other venues'
// per-period funding rate. We surface it as `rate` for parity, and set
// `nextFundingTime = ts` to flag that there is no discrete next-charge moment.
type DeribitTicker = {
  instrument_name: string;
  funding_8h: number;       // 8h funding rate as decimal (0.0001 = 0.01%)
  current_funding: number;  // live continuous funding rate
  open_interest: number;    // for inverse perps: USD notional (contracts × $10)
  mark_price: number;
  timestamp: number;        // ms epoch
};

type DeribitResp<T> = { result: T; usIn?: number };

const DERIBIT_DEFAULT_SYMBOLS = ["BTC-PERPETUAL", "ETH-PERPETUAL"] as const;

/** Map cross-venue symbol shorthand (e.g. "BTCUSDT") to Deribit's instrument name. */
function deribitInstrumentName(s: string): string {
  if (s.includes("-PERPETUAL")) return s;
  const base = s.replace(/USDT$/i, "").replace(/USD$/i, "").toUpperCase();
  return `${base}-PERPETUAL`;
}

async function getDeribitTicker(instrument: string): Promise<DeribitTicker> {
  const json = await fetchJson<DeribitResp<DeribitTicker>>(
    `https://www.deribit.com/api/v2/public/ticker?instrument_name=${instrument}`,
    { revalidate: 60 },
  );
  return json.result;
}

async function getDeribitFunding(symbol?: string): Promise<FundingRate[]> {
  if (!symbol) {
    const results = await Promise.allSettled(
      DERIBIT_DEFAULT_SYMBOLS.map((s) => getDeribitFunding(s)),
    );
    return results
      .filter((r): r is PromiseFulfilledResult<FundingRate[]> => r.status === "fulfilled")
      .flatMap((r) => r.value);
  }
  const instrument = deribitInstrumentName(symbol);
  const t = await getDeribitTicker(instrument);
  const rate = Number(t.funding_8h);
  return [
    {
      exchange: "deribit" as const,
      symbol: t.instrument_name,
      rate,
      ratePercent: rate * 100,
      // Deribit funds continuously — no discrete next event, so we mirror ts.
      nextFundingTime: t.timestamp,
      ts: t.timestamp,
    },
  ];
}

async function getDeribitOI(symbol: string): Promise<OpenInterest> {
  const instrument = deribitInstrumentName(symbol);
  const t = await getDeribitTicker(instrument);
  const oiUsd = Number(t.open_interest);
  const mark = Number(t.mark_price);
  // For inverse perps, open_interest is already USD notional. Convert to base
  // currency by dividing by mark price (matches Binance/Bybit's `oi` semantics).
  const oi = mark > 0 ? oiUsd / mark : 0;
  return {
    exchange: "deribit",
    symbol: t.instrument_name,
    oi,
    oiUsd,
    ts: t.timestamp,
  };
}

// ── Public API ──────────────────────────────────────────────────────────────

const FUNDING_LOADERS: Record<Exchange, (symbol?: string) => Promise<FundingRate[]>> = {
  binance: getBinanceFunding,
  bybit: getBybitFunding,
  okx: getOkxFunding,
  deribit: getDeribitFunding,
};

const OI_LOADERS: Record<Exchange, (symbol: string) => Promise<OpenInterest>> = {
  binance: getBinanceOI,
  bybit: getBybitOI,
  okx: getOkxOI,
  deribit: getDeribitOI,
};

/**
 * Fetch funding rates from one or all exchanges.
 * If `exchange` is omitted, queries Binance/Bybit/OKX/Deribit in parallel.
 */
export async function getFundingRates(opts: {
  exchange?: Exchange;
  symbol?: string;
} = {}): Promise<FundingRate[]> {
  const { exchange, symbol } = opts;
  if (exchange) return FUNDING_LOADERS[exchange](symbol);

  const results = await Promise.allSettled([
    getBinanceFunding(symbol),
    getBybitFunding(symbol),
    getOkxFunding(symbol),
    getDeribitFunding(symbol),
  ]);
  return results
    .filter((r): r is PromiseFulfilledResult<FundingRate[]> => r.status === "fulfilled")
    .flatMap((r) => r.value);
}

export async function getOpenInterest(opts: {
  exchange?: Exchange;
  symbol: string;
}): Promise<OpenInterest[]> {
  const { exchange, symbol } = opts;
  if (exchange) return [await OI_LOADERS[exchange](symbol)];

  const results = await Promise.allSettled([
    getBinanceOI(symbol),
    getBybitOI(symbol),
    getOkxOI(symbol),
    getDeribitOI(symbol),
  ]);
  return results
    .filter((r): r is PromiseFulfilledResult<OpenInterest> => r.status === "fulfilled")
    .map((r) => r.value);
}
