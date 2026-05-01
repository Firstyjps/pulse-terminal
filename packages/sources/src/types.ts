// Shared types — single source of truth across the monorepo

export type Exchange = "binance" | "bybit" | "okx" | "deribit";

export interface MarketOverview {
  totalMarketCap: number;
  totalVolume24h: number;
  btcDominance: number;
  ethDominance: number;
  altDominance: number;          // 100 - btc - eth
  marketCapChange24h: number;
  /**
   * 24h volume change %. CoinGecko `/global` doesn't expose this directly,
   * so we maintain a server-side rolling buffer of recent samples and
   * compute the delta against the closest sample to (now − 24h). May be
   * undefined for the first ~24h after server start.
   */
  volumeChange24h?: number;
  /** volume24h / totalMarketCap × 100 — turnover ratio (always available). */
  volumeTurnoverPct: number;
  activeCryptocurrencies: number;
  defiMarketCap: number;
  defiTvl: number;
  fearGreedIndex?: {
    value: number;
    classification: string;
    /** 7-day history, oldest → newest (last entry is today). */
    history?: { value: number; classification: string; ts: number }[];
  };
}

export interface StablecoinPoint {
  date: string;
  totalCirculating: number;
  usdt: number;
  usdc: number;
  dai: number;
  others: number;
}

export interface StablecoinFlow {
  history: StablecoinPoint[];
  summary: {
    currentTotal: number;
    change7d: number;
    change30d: number;
    change7dPercent: number;
    change30dPercent: number;
    dominance: { name: string; mcap: number; pct: number }[];
  };
}

export interface ETFFlow {
  date: string;
  btc: number;
  eth: number;
  btcCumulative: number;
  ethCumulative: number;
}

export type ETFSource = "coinglass" | "farside" | "proxy";

/** Why Coinglass was skipped or failed — surfaces silent operational drift. */
export type ETFFallbackReason =
  | "no_api_key"               // env var unset OR set to empty string
  | "coinglass_http_error"     // fetch returned non-2xx
  | "coinglass_invalid_code"   // body code !== "0"/"00000"
  | "coinglass_empty_data"     // both BTC and ETH branches returned no data
  | "coinglass_threw"          // network exception inside fetchCoinglass
  | "farside_threw"            // farside scrape exception
  | "farside_empty";           // farside scrape returned <6 rows

export interface ETFFlowResponse {
  flows: ETFFlow[];
  summary: {
    btcLast: number;
    ethLast: number;
    btcCumulative: number;
    ethCumulative: number;
    btc7dSum: number;
    eth7dSum: number;
    btc30dSum: number;
    eth30dSum: number;
  };
  _source?: ETFSource;
  _isProxy?: boolean;
  /** Populated when `_source !== "coinglass"` so dashboards/alerts can detect drift. */
  _fallbackReason?: ETFFallbackReason;
}

export interface FuturesData {
  symbol: string;
  openInterest: number;
  fundingRate: number;
  longShortRatio: number;
  price: number;
  priceChange24h: number;
  history: { date: string; oi: number; funding: number; price: number }[];
}

export interface FuturesResponse {
  btc: FuturesData;
  eth: FuturesData;
}

export interface DexVolumePoint {
  date: string;
  volume: number;
}

export interface DexVolumeResponse {
  history: DexVolumePoint[];
  byChain: { name: string; volume24h: number; share: number }[];
  summary: { total24h: number; total7d: number; change24h: number };
}

export interface TvlPoint {
  date: string;
  tvl: number;
}

export interface TvlResponse {
  history: TvlPoint[];
  byChain: { name: string; tvl: number; change1d: number; change7d: number }[];
  summary: { total: number; change1d: number; change7d: number; change30d: number };
}

// Derivatives — port from Funding_Oi server pattern
export interface FundingRate {
  exchange: Exchange;
  symbol: string;
  rate: number;             // raw funding rate, e.g. 0.0001 = 0.01% per period
  ratePercent: number;      // rate * 100, convenience
  nextFundingTime: number;  // ms epoch
  ts: number;               // ms epoch
}

export interface OpenInterest {
  exchange: Exchange;
  symbol: string;
  oi: number;       // contracts
  oiUsd: number;    // notional USD
  ts: number;
}

export interface FundflowSnapshot {
  overview?: MarketOverview;
  stablecoins?: StablecoinFlow;
  etf?: ETFFlowResponse;
  futures?: FuturesResponse;
  dex?: DexVolumeResponse;
  tvl?: TvlResponse;
  generatedAt: string;
}
