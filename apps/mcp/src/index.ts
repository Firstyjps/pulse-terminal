#!/usr/bin/env node
/**
 * Pulse Terminal — MCP Server
 *
 * Exposes 10 read-only tools to Claude Desktop (or any MCP client) so the model can
 * fetch live crypto market + derivatives data without an API key on the server side.
 *
 * Tools:
 *   - get_market_overview      — total mcap, BTC dom, F&G, DeFi TVL
 *   - get_stablecoin_flows     — total supply, dominance, 30d trajectory
 *   - get_etf_flows            — BTC/ETH spot ETF daily flows + cumulative
 *   - get_futures              — Binance perp OI, funding, L/S, price
 *   - get_dex_leaderboard      — DefiLlama DEX 24h/7d, top venues
 *   - get_tvl_breakdown        — DeFi TVL total + by chain
 *   - get_fundflow_snapshot    — all of the above formatted as one markdown brief
 *   - get_funding_summary      — NEW. Aggregated funding across Binance/Bybit/OKX
 *   - get_oi_snapshot          — NEW. Aggregated open interest snapshot
 *   - detect_anomalies         — NEW. Cross-source signal scan (ETF + funding + flows)
 *
 * Transport: stdio (the standard for Claude Desktop).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
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
  getFundingRates,
  getOpenInterest,
  scanAnomalies,
  type Exchange,
  type FundflowSnapshot,
  type FundingRate,
  type OpenInterest,
} from "@pulse/sources";

const server = new McpServer(
  {
    name: "pulse-terminal",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
    instructions: [
      "Use these tools to fetch live crypto market + derivatives data.",
      "Start with get_fundflow_snapshot for broad questions — it bundles overview, stablecoins, etf, futures, dex, and tvl in one call.",
      "Use single-purpose tools (e.g. get_funding_summary) for narrow questions to save tokens.",
      "All data is real-time. Sources: CoinGecko, DefiLlama, Binance/Bybit/OKX, alternative.me. ETF flows fall back to Farside-scraped proxy when COINGLASS_API_KEY is missing (flagged via _isProxy=true).",
    ].join(" "),
  },
);

const json = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
});

const text = (s: string) => ({
  content: [{ type: "text" as const, text: s }],
});

// ─────────────────────────────────────────────────────────────────
// Hub cache layer — query the local realtime daemon (started by `apps/realtime`)
// for sub-50ms responses. Each tool falls back to direct upstream fetch if the
// hub is unreachable or returns 404/503.
// ─────────────────────────────────────────────────────────────────

const HUB_BASE = process.env.PULSE_HUB_URL ?? "http://127.0.0.1:8081";
const HUB_TIMEOUT_MS = 800;

async function hubFetch<T>(path: string): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HUB_TIMEOUT_MS);
  try {
    const res = await fetch(`${HUB_BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

// ─────────────────────────────────────────────────────────────────
// Existing 7 tools — ported from Crypto-Fundflow-Analyzer
// ─────────────────────────────────────────────────────────────────

server.tool(
  "get_market_overview",
  "Total crypto market cap, 24h volume, BTC/ETH dominance, market-cap change %, " +
    "DeFi TVL, active cryptocurrencies, and Fear & Greed Index. " +
    "Sources: CoinGecko /global, alternative.me, DefiLlama.",
  {},
  async () => {
    // Try the local hub first — its snapshot includes the same overview, ~5-20ms
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
    "and full cumulative since-inception totals. Source: Coinglass when key is " +
    "set, otherwise Farside-scraped proxy with _isProxy=true.",
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

// ─────────────────────────────────────────────────────────────────
// 3 new derivatives tools (Pulse Terminal additions)
// ─────────────────────────────────────────────────────────────────

const ExchangeSchema = z.enum(["binance", "bybit", "okx"]);

server.tool(
  "get_funding_summary",
  "Aggregated funding rates for a symbol across Binance, Bybit, and OKX (or a " +
    "specific exchange). Returns each venue's rate plus the cross-venue mean / " +
    "max-min spread — a wide spread between exchanges is itself a signal. " +
    "Sources: fapi.binance.com, api.bybit.com, www.okx.com.",
  {
    exchange: ExchangeSchema.optional().describe("Filter to one venue. Omit for all three."),
    symbol: z
      .string()
      .optional()
      .default("BTCUSDT")
      .describe("Symbol (e.g. BTCUSDT, ETHUSDT). Default BTCUSDT."),
  },
  async ({ exchange, symbol = "BTCUSDT" }) => {
    // Try hub: it has freshest funding from native WS streams
    const hub = await hubFetch<{ rates: FundingRate[] }>(
      `/funding?${new URLSearchParams({ ...(exchange ? { exchange } : {}), symbol })}`,
    );
    const rates = hub?.rates?.length
      ? hub.rates
      : await getFundingRates({ exchange: exchange as Exchange | undefined, symbol });
    if (!rates.length) return text(`No funding rates returned for ${symbol}.`);

    const matched = rates.filter((r) =>
      r.symbol.toUpperCase().replace(/-USDT-SWAP$/, "USDT") === symbol.toUpperCase(),
    );
    const sample = matched.length ? matched : rates;

    const avg = sample.reduce((s, r) => s + r.ratePercent, 0) / sample.length;
    const min = Math.min(...sample.map((r) => r.ratePercent));
    const max = Math.max(...sample.map((r) => r.ratePercent));
    return json({
      symbol,
      perVenue: sample.map((r) => ({
        exchange: r.exchange,
        symbol: r.symbol,
        ratePercent: r.ratePercent,
        nextFunding: new Date(r.nextFundingTime).toISOString(),
      })),
      summary: {
        avgPercent: avg,
        minPercent: min,
        maxPercent: max,
        spreadPercent: max - min,
      },
    });
  },
);

server.tool(
  "get_oi_snapshot",
  "Open-interest snapshot for a symbol across Binance/Bybit/OKX in USD notional. " +
    "Returns each venue's OI plus the cross-venue total — useful for measuring " +
    "leverage build-up. Source: each exchange's public OI endpoint.",
  {
    exchange: ExchangeSchema.optional().describe("Filter to one venue. Omit for all three."),
    symbol: z
      .string()
      .optional()
      .default("BTCUSDT")
      .describe("Symbol (e.g. BTCUSDT, ETHUSDT). Default BTCUSDT."),
  },
  async ({ exchange, symbol = "BTCUSDT" }) => {
    const hub = await hubFetch<{ ois: OpenInterest[] }>(
      `/oi?${new URLSearchParams({ ...(exchange ? { exchange } : {}), symbol })}`,
    );
    const ois = hub?.ois?.length
      ? hub.ois
      : await getOpenInterest({ exchange: exchange as Exchange | undefined, symbol });
    if (!ois.length) return text(`No OI returned for ${symbol}.`);

    const totalUsd = ois.reduce((s, x) => s + x.oiUsd, 0);
    return json({
      symbol,
      perVenue: ois.map((x) => ({
        exchange: x.exchange,
        symbol: x.symbol,
        oi: x.oi,
        oiUsd: x.oiUsd,
        ts: new Date(x.ts).toISOString(),
      })),
      summary: { totalUsd, venues: ois.length },
    });
  },
);

server.tool(
  "detect_anomalies",
  "Cross-source anomaly scan. Pulls a fresh fund-flow snapshot plus funding rates " +
    "and emits a list of pattern findings (e.g. ETF outflow + funding spike, " +
    "stablecoin supply surge + TVL drop). Useful for nightly digest or alerting. " +
    "Returns at most ~10 findings ranked by severity. Logic shared with the " +
    "alerts worker and the web /api/alerts/scan route.",
  {
    symbol: z
      .string()
      .optional()
      .default("BTCUSDT")
      .describe("Symbol to source funding rate from. Default BTCUSDT."),
  },
  async ({ symbol = "BTCUSDT" }) => {
    const scan = await scanAnomalies(symbol);
    return json({
      generatedAt: scan.generatedAt,
      count: scan.findings.length,
      findings: scan.findings.slice(0, 10),
      marker: scan.marker,
      _hint:
        scan.findings.length === 0
          ? "no anomalies detected — markets quiet across the tracked dimensions"
          : undefined,
    });
  },
);

// Keep OpenInterest type referenced (used implicitly via getOpenInterest return)
type _UnusedOpenInterest = OpenInterest;

// ─────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Anything written to stdout corrupts the JSON-RPC stream — keep diagnostics on stderr.
process.stderr.write("[pulse-mcp] connected via stdio\n");
