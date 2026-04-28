// Bybit Dual Assets — types shared between server tracker and browser UI.
// Concept: Bybit "Dual Assets" pays APR for committing collateral; APR varies
// hour-by-hour. We track snapshots to find the hour-of-day with highest yield.

export type DualAssetDirection = "BuyLow" | "SellHigh";

export interface DualAssetProduct {
  coin: string;          // base asset, e.g. "SOL"
  quoteCoin: string;     // quote, e.g. "USDT"
  direction: DualAssetDirection;
  duration: string;      // e.g. "<1D", "1D", "3D"
  targetPrice: number;
  apr: number;           // percent
  indexPrice: number;
  isVipOnly: boolean;
  settlementTime: string; // ISO
}

export interface DualAssetSnapshot {
  timestamp_utc: string;        // ISO 8601 UTC
  timestamp_ict: string;        // ISO 8601 UTC+7 (Asia/Bangkok)
  hour_ict: number;             // 0-23
  coin_pair: string;            // "SOL-USDT"
  direction: DualAssetDirection;
  target_price: number;
  apr_pct: number;
  duration: string;
  settlement_utc: string | null;
  index_price: number | null;
  is_vip_only: 0 | 1;
  sol_iv_pct: number | null;
}

export interface HourlyAprStat {
  hour_ict: number;
  avg_apr: number;
  max_apr: number;
  min_apr: number;
  avg_price: number | null;
  avg_iv: number | null;
  samples: number;
}

export interface DualAssetReport {
  period_days: number;
  target_price: number;
  coin_pair: string;
  overall_avg_apr: number;
  best_hours: HourlyAprStat[];
  hot_hours: number[];
  cold_hours: number[];
  hourly_data: HourlyAprStat[];
  recommendation: string;
}

export interface AprIvCorrelation {
  correlation: number | null;
  interpretation: string | null;
  samples: number;
  message: string;
}
