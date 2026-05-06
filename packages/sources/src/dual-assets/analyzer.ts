// Hourly APR analysis — generates report consumable by both MCP tools and web UI.

import { getHourlyAvg, getBestHours, getDailySummaries } from "./store.js";
import type { DualAssetReport } from "./types.js";

export function generateHourlyReport(opts: {
  coinPair?: string;
  targetPrice?: number;
  days?: number;
  duration?: string;
} = {}): DualAssetReport | { error: string } {
  const { coinPair = "SOL-USDT", targetPrice = 78, days = 7, duration } = opts;
  const hourly = getHourlyAvg({ coinPair, targetPrice, days, duration });
  if (!hourly.length) return { error: "No data available yet — wait for cron to populate." };

  const best = getBestHours({ coinPair, targetPrice, days, topN: 3, duration });
  const avgAll = hourly.reduce((s, h) => s + h.avg_apr, 0) / hourly.length;
  const totalSamples = hourly.reduce((s, h) => s + h.samples, 0);
  const bestEdgePct = best[0] && avgAll > 0 ? ((best[0].avg_apr - avgAll) / avgAll) * 100 : 0;
  const confidence = buildConfidence(totalSamples, hourly.length, bestEdgePct);
  const trend = buildTrend(coinPair, targetPrice, days);

  const hotHours = hourly.filter((h) => h.avg_apr >= avgAll * 1.1).map((h) => h.hour_ict);
  const coldHours = hourly.filter((h) => h.avg_apr <= avgAll * 0.9).map((h) => h.hour_ict);

  const fmt = (h: number) => `${String(h).padStart(2, "0")}:00`;
  const recommendation = best.length >= 2
    ? `Enter Dual Assets between ${fmt(best[0].hour_ict)}-${fmt(best[0].hour_ict + 1)} ICT ` +
      `(avg APR ${best[0].avg_apr}%) or ${fmt(best[1].hour_ict)}-${fmt(best[1].hour_ict + 1)} ICT ` +
      `(avg APR ${best[1].avg_apr}%)`
    : "Insufficient data — collect another 2–3 days.";

  return {
    period_days: days,
    target_price: targetPrice,
    coin_pair: coinPair,
    overall_avg_apr: +avgAll.toFixed(2),
    confidence,
    trend,
    best_hours: best,
    hot_hours: hotHours,
    cold_hours: coldHours,
    hourly_data: hourly,
    recommendation,
  };
}

function buildConfidence(
  totalSamples: number,
  activeHours: number,
  bestEdgePct: number,
): DualAssetReport["confidence"] {
  const reasons: string[] = [];
  let score = 0;

  score += Math.min(45, totalSamples * 3);
  if (totalSamples >= 20) reasons.push("sample base >= 20");
  else reasons.push(`sample base ${totalSamples}`);

  score += Math.min(25, activeHours * 2);
  if (activeHours >= 10) reasons.push("broad hourly coverage");

  if (bestEdgePct >= 20) {
    score += 25;
    reasons.push("best hour materially above average");
  } else if (bestEdgePct >= 10) {
    score += 15;
    reasons.push("best hour above average");
  } else {
    score += 5;
    reasons.push("weak best-hour separation");
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  return {
    score,
    label: score >= 75 ? "high" : score >= 50 ? "medium" : "low",
    reasons,
  };
}

function buildTrend(
  coinPair: string,
  targetPrice: number,
  days: number,
): DualAssetReport["trend"] {
  const rows = getDailySummaries({ coinPair, targetPrice, days })
    .filter((r) => r.avg_apr != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  if (rows.length < 2) {
    return { direction: "insufficient", latest_avg_apr: null, previous_avg_apr: null, change_pct: null };
  }

  const half = Math.max(1, Math.floor(rows.length / 2));
  const previous = rows.slice(0, half);
  const latest = rows.slice(half);
  const avgApr = (items: typeof rows) =>
    items.reduce((s, r) => s + (r.avg_apr ?? 0), 0) / items.length;

  const previousAvg = avgApr(previous);
  const latestAvg = avgApr(latest.length ? latest : rows.slice(-1));
  const changePct = previousAvg === 0 ? null : ((latestAvg - previousAvg) / previousAvg) * 100;
  const direction =
    changePct == null
      ? "insufficient"
      : changePct > 5
        ? "rising"
        : changePct < -5
          ? "falling"
          : "flat";

  return {
    direction,
    latest_avg_apr: +latestAvg.toFixed(2),
    previous_avg_apr: +previousAvg.toFixed(2),
    change_pct: changePct == null ? null : +changePct.toFixed(2),
  };
}
