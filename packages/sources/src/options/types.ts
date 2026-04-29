// Multi-exchange options data — types shared between server adapters and browser UI.

export type OptionExchange = "Deribit" | "Binance" | "Bybit" | "OKX";
export type OptionAsset = "SOL" | "BTC" | "ETH";
export type OptionSide = "call" | "put";

export interface OptionData {
  strike: number;
  exchange: OptionExchange;
  side: OptionSide;
  asset: OptionAsset;
  expiry: string; // normalized YYYYMMDD
  bid: number;
  ask: number;
  mark: number;
  iv: number; // percent, 0-200
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
  oi: number;
  volume: number;
  size_bid: number;
  size_ask: number;
}

export interface OptionsAggregateResponse {
  options: OptionData[];
  underlyingPrice: number;
  strikes: number[];
  expiries: string[];
  errors: { exchange: OptionExchange; error: string }[];
  ts: number;
}

export interface OptionsArbitrage {
  asset: OptionAsset;
  expiry: string;
  strike: number;
  side: OptionSide;
  buyExchange: OptionExchange;
  buyAsk: number;
  sellExchange: OptionExchange;
  sellBid: number;
  spread: number;
  spreadPercent: number;
}
