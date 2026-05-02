import { z } from "zod";
import {
  getOverview,
  getStablecoins,
  getETFFlows,
  getFutures,
  getFuturesSymbol,
  getDexVolume,
  getTVL,
  getFullSnapshot,
  summarizeSnapshot,
  type FundflowSnapshot,
} from "@pulse/sources/server";

import { hubFetch, json, text, type RegisterFn } from "../_helpers.js";

export const registerFundflowTools: RegisterFn = (server) => {
  server.tool(
    "get_market_overview",
    "Total crypto market cap, 24h volume, BTC/ETH dominance, market-cap change %, " +
      "DeFi TVL, active cryptocurrencies, and Fear & Greed Index. " +
      "Sources: CoinGecko /global, alternative.me, DefiLlama.",
    {},
    async () => {
      const cached = await hubFetch<FundflowSnapshot>("/snapshot");
      if (cached?.overview) return json(cached.overview);
      return json(await getOverview());
    },
  );

  server.tool(
    "get_stablecoin_flows",
    "Total stablecoin market cap (USDT, USDC, DAI, USDe, etc.), 7d/30d change " +
      "in absolute USD and %, top dominance breakdown, plus 180-day daily " +
      "trajectory. Stablecoin supply is the canonical indicator of dry powder " +
      "waiting in crypto. Source: DefiLlama stablecoins.",
    {},
    async () => {
      const cached = await hubFetch<FundflowSnapshot>("/snapshot");
      if (cached?.stablecoins) return json(cached.stablecoins);
      return json(await getStablecoins());
    },
  );

  server.tool(
    "get_etf_flows",
    "Spot Bitcoin/Ethereum ETF daily flows in USD, 7d & 30d cumulative sums, " +
      "and full cumulative since-inception totals. Source: Farside-scraped proxy " +
      "(flagged via _isProxy=true).",
    {
      symbol: z
        .enum(["btc", "eth", "both"])
        .optional()
        .default("both")
        .describe("Filter to btc/eth/both. Default: both."),
    },
    async ({ symbol = "both" }) => {
      const cached = await hubFetch<FundflowSnapshot>("/snapshot");
      const data = cached?.etf ?? (await getETFFlows());
      if (symbol === "both") return json(data);
      const isBtc = symbol === "btc";
      return json({
        flows: data.flows.map((f) => ({
          date: f.date,
          flow: isBtc ? f.btc : f.eth,
          cumulative: isBtc ? f.btcCumulative : f.ethCumulative,
        })),
        summary: isBtc
          ? {
              latestDay: data.summary.btcLast,
              cumulative: data.summary.btcCumulative,
              sum7d: data.summary.btc7dSum,
              sum30d: data.summary.btc30dSum,
            }
          : {
              latestDay: data.summary.ethLast,
              cumulative: data.summary.ethCumulative,
              sum7d: data.summary.eth7dSum,
              sum30d: data.summary.eth30dSum,
            },
        _isProxy: data._isProxy,
      });
    },
  );

  server.tool(
    "get_futures",
    "Binance perpetual futures (USDT-M) for BTC/ETH: open interest in USD, " +
      "8-hour funding rate %, global long/short ratio, last price, 24h change %, " +
      "30-day daily history. Funding > 0.05% = overheated long; < -0.02% = overheated short. " +
      "Source: Binance fapi.",
    {
      symbol: z
        .enum(["BTCUSDT", "ETHUSDT", "both"])
        .optional()
        .default("both")
        .describe("Filter to one symbol or both. Default: both."),
    },
    async ({ symbol = "both" }) => {
      const cached = await hubFetch<FundflowSnapshot>("/snapshot");
      if (symbol === "both") {
        if (cached?.futures) return json(cached.futures);
        return json(await getFutures());
      }
      return json(await getFuturesSymbol(symbol));
    },
  );

  server.tool(
    "get_dex_leaderboard",
    "Decentralised exchange aggregate volume: 24h total, 7d total, 24h change %, " +
      "180-day daily history, and top venues by 24h share. Indicator of retail / " +
      "altcoin activity. Source: DefiLlama /overview/dexs.",
    {
      days: z
        .number()
        .int()
        .min(1)
        .max(180)
        .optional()
        .default(7)
        .describe("Lookback in days for the summary slice. Default 7."),
    },
    async () => {
      const cached = await hubFetch<FundflowSnapshot>("/snapshot");
      if (cached?.dex) return json(cached.dex);
      return json(await getDexVolume());
    },
  );

  server.tool(
    "get_tvl_breakdown",
    "DeFi Total Value Locked: aggregate USD across all chains, 1d/7d/30d change %, " +
      "180-day daily history, top chains by TVL with 1d/7d change. " +
      "Source: DefiLlama /v2.",
    {
      chain: z
        .string()
        .optional()
        .describe("Optional chain filter (case-insensitive substring). Returns only that chain when set."),
    },
    async ({ chain }) => {
      const cached = await hubFetch<FundflowSnapshot>("/snapshot");
      const data = cached?.tvl ?? (await getTVL());
      if (!chain) return json(data);
      const needle = chain.toLowerCase();
      return json({
        ...data,
        byChain: data.byChain.filter((c) => c.name.toLowerCase().includes(needle)),
      });
    },
  );

  server.tool(
    "get_fundflow_snapshot",
    "Single combined call returning all 6 datasets formatted as a compact markdown " +
      "brief. Best starting point for broad questions. Use single-purpose tools when " +
      "the question is narrow (saves tokens).",
    {
      format: z
        .enum(["markdown", "json"])
        .optional()
        .default("markdown")
        .describe("markdown = brief (default). json = full raw snapshot."),
    },
    async ({ format = "markdown" }) => {
      const snapshot = (await hubFetch<FundflowSnapshot>("/snapshot")) ?? (await getFullSnapshot());
      return format === "json" ? json(snapshot) : text(summarizeSnapshot(snapshot, "overview"));
    },
  );
};
