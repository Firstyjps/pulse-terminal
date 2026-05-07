import { z } from "zod";
import {
  generateHourlyReport,
  getRecentSnapshots,
  getDailySummaries,
  getAprIvCorrelation,
  getDualAssetsSettings,
  loadDualAssetsConfig,
  parseDirections,
  parseDurations,
  resolveDbPath,
} from "@pulse/sources/server";

import { json, text, type RegisterFn } from "../_helpers.js";

export const registerDualAssetsTools: RegisterFn = (server) => {
  server.tool(
    "get_dual_assets_settings",
    "Current Pulse Dual Assets settings. Tracking uses public Bybit endpoints; no Bybit API key is required for read-only APR tracking.",
    {},
    async () => json(getDualAssetsSettings(resolveDbPath())),
  );

  server.tool(
    "get_dual_assets_apr",
    "Recent Bybit Dual Assets APR snapshots from local SQLite (populated by alerts cron every 5 min). " +
      "Defaults to Track APY >=55 and 8h/1d public Bybit products. Use get_best_dual_assets_hour for the analyzed report.",
    {
      limit: z.number().int().min(1).max(1000).optional().default(96).describe("rows; 96 = ~8h at 5-min cadence"),
      coin_pair: z.string().optional().default("SOL-USDT"),
      duration: z.string().optional().describe("Comma list: 8h,1d. Use none for empty result."),
      direction: z.string().optional().describe("Comma list: BuyLow,SellHigh. Use none for empty result."),
      min_apr_pct: z.number().optional().describe("Visibility filter. Defaults to DUAL_ASSETS_MIN_TRACK_APR=55."),
    },
    async ({ limit = 96, coin_pair = "SOL-USDT", duration, direction, min_apr_pct }) => {
      try {
        const config = loadDualAssetsConfig();
        const durations = parseDurations(duration, config.durations);
        const directions = parseDirections(direction, config.directions);
        const records = getRecentSnapshots({
          limit,
          coinPair: coin_pair,
          durations,
          directions,
          minAprPct: min_apr_pct ?? config.minTrackAprPct,
          dedupe: true,
        });
        return json({
          count: records.length,
          filters: {
            minTrackAprPct: min_apr_pct ?? config.minTrackAprPct,
            durations,
            directions,
          },
          records,
        });
      } catch (err) {
        return text(`SQLite not initialized yet — alerts cron must run at least once. Error: ${(err as Error).message}`);
      }
    },
  );

  server.tool(
    "get_best_dual_assets_hour",
    "Hourly APR analysis for Bybit Dual Assets — answers: 'when in the day is APR highest?' " +
      "Returns hourly_data (24 buckets in ICT/UTC+7), best_hours top-3, hot/cold lists, and a Thai-language recommendation. " +
      "Optionally include APR-vs-IV correlation (needs ≥10 samples with IV data).",
    {
      coin_pair: z.string().optional().default("SOL-USDT"),
      target_price: z.number().optional(),
      days: z.number().int().min(1).max(90).optional().default(7),
      duration: z.string().optional().describe("Comma list: 8h,1d."),
      direction: z.string().optional().describe("Comma list: BuyLow,SellHigh."),
      include_correlation: z.boolean().optional().default(false),
    },
    async ({ coin_pair = "SOL-USDT", target_price, days = 7, duration, direction, include_correlation = false }) => {
      const config = loadDualAssetsConfig();
      const report = generateHourlyReport({
        coinPair: coin_pair,
        targetPrice: target_price,
        days,
        durations: parseDurations(duration, config.durations),
        directions: parseDirections(direction, config.directions),
        minAprPct: config.minTrackAprPct,
      });
      if ("error" in report) return text(report.error);
      if (include_correlation) {
        return json({ ...report, correlation: getAprIvCorrelation(days) });
      }
      return json(report);
    },
  );

  server.tool(
    "get_dual_assets_daily_summary",
    "Daily aggregated APR summaries for Bybit Dual Assets — one row per (date, coin_pair, target_price) " +
      "with avg/max/min APR and best/worst hour-of-day. Rolled up by alerts cron at 00:05 ICT. " +
      "Use this for trend tracking across days; use get_best_dual_assets_hour for intraday hourly analysis.",
    {
      coin_pair: z.string().optional().default("SOL-USDT"),
      target_price: z.number().optional().describe("Optional — filter to a single target price"),
      days: z.number().int().min(1).max(365).optional().default(30),
      duration: z.string().optional().describe("Comma list: 8h,1d."),
      direction: z.string().optional().describe("Comma list: BuyLow,SellHigh."),
    },
    async ({ coin_pair = "SOL-USDT", target_price, days = 30, duration, direction }) => {
      try {
        const config = loadDualAssetsConfig();
        const summaries = getDailySummaries({
          coinPair: coin_pair,
          targetPrice: target_price,
          days,
          durations: parseDurations(duration, config.durations),
          directions: parseDirections(direction, config.directions),
          minAprPct: config.minTrackAprPct,
        });
        return json({ count: summaries.length, summaries });
      } catch (err) {
        return text(`SQLite not initialized yet — alerts cron must run at least once. Error: ${(err as Error).message}`);
      }
    },
  );
};
