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
 *   - get_funding_summary      — Aggregated funding across Binance/Bybit/OKX/Deribit
 *   - get_oi_snapshot          — Aggregated open interest snapshot
 *   - detect_anomalies         — Cross-source signal scan (ETF + funding + flows)
 *   - grade_signal             — NEW (Phase 4). Returns rubric for grading a finding
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
  // Phase 5A — multi-exchange options
  getOptionsAggregate,
  findOptionsArbitrage,
  buildIVSmile,
  // Phase 5A — Bybit Dual Assets
  generateHourlyReport,
  getRecentSnapshots,
  getDailySummaries,
  getAprIvCorrelation,
  // Phase 4 — grade_signal rubric
  buildGradeSignalRubric,
  // Round 4 — order book depth + whale flow
  getDepth,
  getWhaleFlow,
  type Exchange,
  type FundflowSnapshot,
  type FundingRate,
  type OpenInterest,
  type OptionAsset,
  type AnomalyFinding,
} from "@pulse/sources/server";

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
const WARN_DEDUP_MS = 30_000;
let lastHubWarn = 0;

/**
 * Warn once per WARN_DEDUP_MS to stderr (stdout is reserved for the MCP
 * JSON-RPC stream — never write there). Used when degrading from hub to direct
 * upstream so the user sees something is up without a flood of repeats.
 */
function warnHubDegrade(path: string, reason: string) {
  const now = Date.now();
  if (now - lastHubWarn < WARN_DEDUP_MS) return;
  lastHubWarn = now;
  process.stderr.write(
    `[pulse-mcp] hub ${path} unavailable (${reason.slice(0, 60)}), falling back to upstream\n`,
  );
}

async function hubFetch<T>(path: string): Promise<T | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), HUB_TIMEOUT_MS);
  try {
    const res = await fetch(`${HUB_BASE}${path}`, { signal: ctrl.signal });
    if (!res.ok) {
      warnHubDegrade(path, `HTTP ${res.status}`);
      return null;
    }
    return (await res.json()) as T;
  } catch (err) {
    warnHubDegrade(path, (err as Error).message);
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

const ExchangeSchema = z.enum(["binance", "bybit", "okx", "deribit"]);

server.tool(
  "get_funding_summary",
  "Aggregated funding rates for a symbol across Binance, Bybit, OKX, and " +
    "Deribit (or a specific exchange). Returns each venue's rate plus the " +
    "cross-venue mean / max-min spread — a wide spread between exchanges is " +
    "itself a signal. Deribit perpetuals are inverse contracts; their " +
    "funding_8h is the directly comparable rate. Sources: fapi.binance.com, " +
    "api.bybit.com, www.okx.com, www.deribit.com.",
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
  "Open-interest snapshot for a symbol across Binance/Bybit/OKX/Deribit in USD " +
    "notional. Returns each venue's OI plus the cross-venue total — useful for " +
    "measuring leverage build-up. Deribit's `oi` is derived from its " +
    "USD-quoted open_interest divided by mark_price (inverse perp). Source: " +
    "each exchange's public OI endpoint.",
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
// Phase 5A — Multi-exchange options (Deribit/Binance/Bybit/OKX)
// ─────────────────────────────────────────────────────────────────

const OptionAssetSchema = z.enum(["SOL", "BTC", "ETH"]);

server.tool(
  "get_options_chain",
  "Aggregated options chain across Deribit, Binance, Bybit, and OKX (BTC/ETH only on OKX, SOL only on the first three). " +
    "Returns mark/bid/ask/IV/Greeks/OI per (strike, side, expiry, exchange). Cached 25s. " +
    "Use this to scan IV skew, find best price at a strike, or feed downstream Greek calculations.",
  {
    asset: OptionAssetSchema.optional().default("SOL"),
    expiry: z.string().optional().describe("YYYYMMDD — filter to one expiry. Omit for all."),
    side: z.enum(["call", "put", "both"]).optional().default("both"),
    limit: z.number().int().min(1).max(500).optional().default(150),
  },
  async ({ asset = "SOL", expiry, side = "both", limit = 150 }) => {
    const agg = await getOptionsAggregate(asset as OptionAsset);
    let opts = agg.options;
    if (expiry) opts = opts.filter((o) => o.expiry === expiry);
    if (side !== "both") opts = opts.filter((o) => o.side === side);
    return json({
      asset,
      underlyingPrice: agg.underlyingPrice,
      strikes: agg.strikes,
      expiries: agg.expiries,
      errors: agg.errors,
      count: opts.length,
      options: opts.slice(0, limit),
    });
  },
);

server.tool(
  "get_iv_smile",
  "IV smile (strike → IV) for one expiry, separated by call/put across all venues. Use to spot skew abnormalities.",
  {
    asset: OptionAssetSchema.optional().default("SOL"),
    expiry: z.string().optional().describe("YYYYMMDD; defaults to nearest expiry"),
  },
  async ({ asset = "SOL", expiry }) => {
    const agg = await getOptionsAggregate(asset as OptionAsset);
    const targetExpiry = expiry ?? agg.expiries[0];
    if (!targetExpiry) return text("No expiries available.");
    const smile = buildIVSmile(agg.options, asset as OptionAsset, targetExpiry);
    return json({
      ...smile,
      underlyingPrice: agg.underlyingPrice,
      available_expiries: agg.expiries,
    });
  },
);

server.tool(
  "get_options_arbitrage",
  "Cross-venue options arbitrage scanner: same (asset, expiry, strike, side) where one venue's bid > another's ask. " +
    "Returns top 50 sorted by spread %. Filters out spreads < 5% as noise. " +
    "Most opportunities are illiquid — verify size_bid/size_ask via get_options_chain before assuming you can hit them.",
  {
    asset: OptionAssetSchema.optional().default("SOL"),
    minSpreadPercent: z.number().min(0.5).max(50).optional().default(5),
  },
  async ({ asset = "SOL", minSpreadPercent = 5 }) => {
    const agg = await getOptionsAggregate(asset as OptionAsset);
    const arb = findOptionsArbitrage(agg.options, minSpreadPercent);
    return json({
      asset,
      count: arb.length,
      arbitrage: arb,
      _note: "Verify liquidity via get_options_chain before trading.",
    });
  },
);

// ─────────────────────────────────────────────────────────────────
// Phase 5A — Bybit Dual Assets APR (SQLite-backed time-series)
// ─────────────────────────────────────────────────────────────────

server.tool(
  "get_dual_assets_apr",
  "Recent Bybit Dual Assets APR snapshots from local SQLite (populated by alerts cron every 5 min). " +
    "Returns raw rows for analysis or visualization. Use get_best_dual_assets_hour for the analyzed report.",
  {
    limit: z.number().int().min(1).max(1000).optional().default(96).describe("rows; 96 = ~8h at 5-min cadence"),
  },
  async ({ limit = 96 }) => {
    try {
      const records = getRecentSnapshots(limit);
      return json({ count: records.length, records });
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
    target_price: z.number().optional().default(78),
    days: z.number().int().min(1).max(90).optional().default(7),
    include_correlation: z.boolean().optional().default(false),
  },
  async ({ coin_pair = "SOL-USDT", target_price = 78, days = 7, include_correlation = false }) => {
    const report = generateHourlyReport({ coinPair: coin_pair, targetPrice: target_price, days });
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
  },
  async ({ coin_pair = "SOL-USDT", target_price, days = 30 }) => {
    try {
      const summaries = getDailySummaries({ coinPair: coin_pair, targetPrice: target_price, days });
      return json({ count: summaries.length, summaries });
    } catch (err) {
      return text(`SQLite not initialized yet — alerts cron must run at least once. Error: ${(err as Error).message}`);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// Phase 4 — grade_signal (rubric-returner pattern)
//
// We don't use MCP sampling/elicitation to round-trip back through Claude:
// host support for sampling is uneven across Claude Desktop versions, and a
// pure rubric-return is more debuggable. The tool hands Claude a structured
// rubric + the required output schema; Claude does the grading in-place
// and is told (in `instructions`) to return ONLY a JSON object matching the
// schema. Hit-rate enrichment from the alerts JSONL is a v2 enhancement —
// keeping v1 pure means latency stays sub-50ms.
// ─────────────────────────────────────────────────────────────────

const FindingSchema = z.object({
  category: z.enum([
    "etf",
    "stablecoin",
    "funding",
    "futures",
    "tvl",
    "dex",
    "options",  // Phase 5A — IV skew, max-OI shift
    "bybit",    // Phase 5A — dual-asset APR regime change
  ]),
  severity: z.enum(["low", "med", "high"]),
  signal: z.string(),
  evidence: z.record(z.unknown()).default({}),
});

server.tool(
  "grade_signal",
  "Grade an anomaly finding from `detect_anomalies`. Returns a structured " +
    "rubric (weights, formula, considerations specific to the finding's category) " +
    "plus the required output schema. After receiving this rubric, reply with " +
    "ONLY a JSON object matching outputSchema — do not echo the rubric back, do " +
    "not wrap in code fences. Use the rubric's category-specific considerations " +
    "and the severity confidence band as anchors. Typical chain: " +
    "detect_anomalies → pick a finding → grade_signal {finding} → produce " +
    "{confidence, reasoning, suggested_action, risk_flags}.",
  {
    finding: FindingSchema.describe(
      "An AnomalyFinding object — typically copied verbatim from detect_anomalies output.",
    ),
    market_context: z
      .record(z.unknown())
      .optional()
      .describe(
        "Optional macro context (BTC price, regime label, recent moves). Improves grading; " +
          "if omitted the rubric instructs the model to flag the absence in risk_flags.",
      ),
  },
  async ({ finding, market_context }) => {
    const rubric = buildGradeSignalRubric(
      finding as AnomalyFinding,
      market_context ?? null,
    );
    return json(rubric);
  },
);

// ─────────────────────────────────────────────────────────────────
// Round 4 — Order Book L2 + Whale Flow
// ─────────────────────────────────────────────────────────────────

server.tool(
  "get_order_book",
  "Top-N bids/asks for a Binance spot pair. Sourced from realtime hub's WS depth stream " +
    "(BTCUSDT/ETHUSDT/SOLUSDT cached @100ms cadence) — falls back to Binance REST /depth when hub unreachable. " +
    "Use for spread analysis, liquidity gaps, and book imbalance signals.",
  {
    symbol: z.string().optional().default("BTCUSDT"),
    limit: z.number().int().min(5).max(100).optional().default(20),
  },
  async ({ symbol = "BTCUSDT", limit = 20 }) => {
    try {
      const book = await getDepth(symbol, limit);
      return json(book);
    } catch (err) {
      return text(`Failed to fetch depth for ${symbol}: ${(err as Error).message}`);
    }
  },
);

server.tool(
  "get_whale_flow",
  "Recent on-chain whale transfers ≥ $WHALE_FLOW_MIN_USD (default $10M). " +
    "Self-indexed from Etherscan (USDT/USDC ERC-20) + Mempool.space (BTC). " +
    "Returns transfers with from/to addresses labeled (BINANCE/COINBASE/KRAKEN/OKX/BYBIT/etc.) " +
    "and direction (IN to exchange = potential sell, OUT = potential hold). " +
    "ETHERSCAN_API_KEY env upgrades rate limit from 1 → 5 req/sec.",
  {},
  async () => {
    try {
      const data = await getWhaleFlow();
      return json(data);
    } catch (err) {
      return text(`Whale flow scan failed: ${(err as Error).message}`);
    }
  },
);

// ─────────────────────────────────────────────────────────────────
// Boot
// ─────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);

// Anything written to stdout corrupts the JSON-RPC stream — keep diagnostics on stderr.
process.stderr.write("[pulse-mcp] connected via stdio\n");
