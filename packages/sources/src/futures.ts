import type { FuturesData, FuturesResponse } from "./types.js";
import { fetchJson } from "./_helpers.js";

type BinanceTicker = { symbol: string; lastPrice: string; priceChangePercent: string };
type BinanceFunding = { symbol: string; lastFundingRate: string; markPrice: string };
type BinanceOiHist = {
  symbol: string;
  sumOpenInterest: string;
  sumOpenInterestValue: string;
  timestamp: number;
};
type BinanceLsr = {
  symbol: string;
  longShortRatio: string;
  longAccount: string;
  shortAccount: string;
  timestamp: string;
};
type BinanceKline = [number, string, string, string, string, string, number, string, number, string, string, string];

async function loadSymbol(symbol: "BTCUSDT" | "ETHUSDT"): Promise<FuturesData> {
  const [ticker, premium, oiHist, lsr, klines] = await Promise.all([
    fetchJson<BinanceTicker[] | BinanceTicker>(
      `https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`,
      { revalidate: 60 },
    ).then((data) => (Array.isArray(data) ? data[0] : (data as BinanceTicker))),
    fetchJson<BinanceFunding>(
      `https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`,
      { revalidate: 60 },
    ),
    fetchJson<BinanceOiHist[]>(
      `https://fapi.binance.com/futures/data/openInterestHist?symbol=${symbol}&period=1d&limit=30`,
      { revalidate: 300 },
    ),
    fetchJson<BinanceLsr[]>(
      `https://fapi.binance.com/futures/data/globalLongShortAccountRatio?symbol=${symbol}&period=1d&limit=1`,
      { revalidate: 300 },
    ),
    fetchJson<BinanceKline[]>(
      `https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=1d&limit=30`,
      { revalidate: 300 },
    ),
  ]);

  const oiByTs = new Map<number, number>();
  for (const point of oiHist) {
    const day = Math.floor(point.timestamp / 86_400_000) * 86_400_000;
    oiByTs.set(day, parseFloat(point.sumOpenInterestValue));
  }

  const fundingValue = parseFloat(premium.lastFundingRate) * 100;

  const history = klines.map((k) => {
    const ts = k[0];
    const day = Math.floor(ts / 86_400_000) * 86_400_000;
    return {
      date: new Date(day).toISOString().slice(0, 10),
      oi: oiByTs.get(day) ?? 0,
      funding: fundingValue,
      price: parseFloat(k[4]),
    };
  });

  const latestOi = oiHist.length
    ? parseFloat(oiHist[oiHist.length - 1].sumOpenInterestValue)
    : 0;

  return {
    symbol,
    openInterest: latestOi,
    fundingRate: fundingValue,
    longShortRatio: lsr[0] ? parseFloat(lsr[0].longShortRatio) : 0,
    price: parseFloat(ticker.lastPrice),
    priceChange24h: parseFloat(ticker.priceChangePercent),
    history,
  };
}

export async function getFutures(): Promise<FuturesResponse> {
  const [btc, eth] = await Promise.all([
    loadSymbol("BTCUSDT"),
    loadSymbol("ETHUSDT"),
  ]);
  return { btc, eth };
}

export async function getFuturesSymbol(
  symbol: "BTCUSDT" | "ETHUSDT",
): Promise<FuturesData> {
  return loadSymbol(symbol);
}
