import { z } from "zod";
import { analyzeOrderBook, getDepth, getWhaleFlow } from "@pulse/sources/server";

import { json, text, type RegisterFn } from "../_helpers.js";

export const registerMarketsTools: RegisterFn = (server) => {
  server.tool(
    "get_order_book",
    "Top-N bids/asks for a Binance spot pair. Sourced from realtime hub's WS depth stream " +
      "(BTCUSDT/ETHUSDT/SOLUSDT cached @100ms cadence) — falls back to Binance REST /depth when hub unreachable. " +
      "Raw top-of-book only — spans a few dollars on liquid pairs. Use for spread/microstructure checks; " +
      "for support/resistance levels use analyze_order_book instead.",
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
    "analyze_order_book",
    "Deep order-book analysis for a Binance spot pair (REST depth=5000, clusters within ±5% of mid). " +
      "Pre-computed: support/resistance liquidity walls (qty-weighted price, size in base+USD, distance % from mid), " +
      "cumulative bid/ask depth + bid/ask ratio at ±0.5/1/2/5%, spread, and book coverage. " +
      "Use THIS for support/resistance in market briefs — report wall prices with their distance % and size, " +
      "and the ±1%/±2% imbalance ratios. Check `coverage` before citing outer bands (a shallow fallback book " +
      "is labeled source=hub-shallow).",
    {
      symbol: z.string().optional().default("BTCUSDT"),
    },
    async ({ symbol = "BTCUSDT" }) => {
      try {
        return json(await analyzeOrderBook(symbol));
      } catch (err) {
        return text(`Order book analysis failed for ${symbol}: ${(err as Error).message}`);
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
};
