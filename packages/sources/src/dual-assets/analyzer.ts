// Hourly APR analysis — generates report consumable by both MCP tools and web UI.

import { getHourlyAvg, getBestHours } from "./store.js";
import type { DualAssetReport } from "./types.js";

export function generateHourlyReport(opts: {
  coinPair?: string;
  targetPrice?: number;
  days?: number;
} = {}): DualAssetReport | { error: string } {
  const { coinPair = "SOL-USDT", targetPrice = 78, days = 7 } = opts;
  const hourly = getHourlyAvg({ coinPair, targetPrice, days });
  if (!hourly.length) return { error: "No data available yet — wait for cron to populate." };

  const best = getBestHours({ coinPair, targetPrice, days, topN: 3 });
  const avgAll = hourly.reduce((s, h) => s + h.avg_apr, 0) / hourly.length;

  const hotHours = hourly.filter((h) => h.avg_apr >= avgAll * 1.1).map((h) => h.hour_ict);
  const coldHours = hourly.filter((h) => h.avg_apr <= avgAll * 0.9).map((h) => h.hour_ict);

  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const recommendation = best.length >= 2
    ? `เข้า Dual Assets ช่วง ${fmt(best[0].hour_ict)}-${fmt(best[0].hour_ict + 1)} ICT ` +
      `(APR เฉลี่ย ${best[0].avg_apr}%) หรือช่วง ${fmt(best[1].hour_ict)}-${fmt(best[1].hour_ict + 1)} ICT ` +
      `(APR เฉลี่ย ${best[1].avg_apr}%)`
    : "ข้อมูลยังไม่เพียงพอ เก็บเพิ่มอีก 2-3 วัน";

  return {
    period_days: days,
    target_price: targetPrice,
    coin_pair: coinPair,
    overall_avg_apr: +avgAll.toFixed(2),
    best_hours: best,
    hot_hours: hotHours,
    cold_hours: coldHours,
    hourly_data: hourly,
    recommendation,
  };
}
