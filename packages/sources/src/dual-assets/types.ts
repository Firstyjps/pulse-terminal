export type DualAssetDirection = "BuyLow" | "SellHigh";
export type DualAssetDuration = "8h" | "1d";

export interface DualAssetProduct {
  productId: string;
  coin: string;          // base asset, e.g. "SOL"
  quoteCoin: string;     // quote, e.g. "USDT"
  direction: DualAssetDirection;
  duration: DualAssetDuration;
  targetPrice: number;
  apr: number;           // percent
  indexPrice: number;
  isVipOnly: boolean;
  settlementTime: string; // ISO
}

export interface DualAssetSnapshot {
  id?: number;
  timestamp_utc: string;        // ISO 8601 UTC
  timestamp_ict: string;        // ISO 8601 UTC+7 (Asia/Bangkok)
  hour_ict: number;             // 0-23
  product_id: string;
  coin_pair: string;            // "SOL-USDT"
  direction: DualAssetDirection;
  target_price: number;
  apr_pct: number;              // percent
  duration: DualAssetDuration;
  settlement_utc: string | null;
  index_price: number | null;
  is_vip_only: 0 | 1;
  sol_iv_pct: number | null;
  created_at?: string;
}

export interface DualAssetsConfig {
  pairs: string[];
  directions: DualAssetDirection[];
  targets: number[] | null;
  durations: DualAssetDuration[];
  minTrackAprPct: number;
  aprAlertPct: number;
  intervalMs: number;
  dbPath?: string;
  schedulerEnabled: boolean;
}

export interface DualAssetsSettings {
  pairs: string[];
  directions: DualAssetDirection[];
  targets: number[] | null;
  durations: DualAssetDuration[];
  durationLabels: Record<DualAssetDuration, string>;
  minTrackAprPct: number;
  aprAlertPct: number;
  intervalMs: number;
  dbPath: string;
  schedulerEnabled: boolean;
  bybitKeyConfigured: boolean;
  authRequiredForTracking: false;
}

export interface DualAssetSnapshotQuery {
  limit?: number;
  coinPair?: string;
  targetPrice?: number;
  directions?: DualAssetDirection[];
  durations?: DualAssetDuration[];
  minAprPct?: number;
  dedupe?: boolean;
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
  target_price: number | null;
  coin_pair: string;
  overall_avg_apr: number;
  confidence: {
    score: number;
    label: "low" | "medium" | "high";
    reasons: string[];
  };
  trend: {
    direction: "rising" | "falling" | "flat" | "insufficient";
    latest_avg_apr: number | null;
    previous_avg_apr: number | null;
    change_pct: number | null;
  };
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

export interface DailySummary {
  date: string;
  coin_pair: string;
  direction: DualAssetDirection | "all";
  duration: DualAssetDuration | "all";
  target_price: number;
  avg_apr: number | null;
  max_apr: number | null;
  min_apr: number | null;
  best_hour_ict: number | null;
  worst_hour_ict: number | null;
  avg_index_price: number | null;
  sample_count: number;
}

export interface DualAssetsTickResult {
  saved: number;
  skipped: number;
  dbSkipped: number;
  trackSkipped: number;
  rawRows: number;
  hot: DualAssetSnapshot[];
  ts: string;
  apiLatencyMs: number;
}

export interface DualAssetsFetchBatch {
  snapshots: DualAssetSnapshot[];
  rawRows: number;
  trackSkipped: number;
  apiLatencyMs: number;
  solIvPct: number | null;
}

export interface AlertEvent {
  id?: number;
  timestamp_utc: string;
  coin_pair: string;
  direction: DualAssetDirection;
  duration: DualAssetDuration;
  target_price: number;
  apr_pct: number;
  threshold_pct: number;
  product_id: string;
  created_at?: string;
}
