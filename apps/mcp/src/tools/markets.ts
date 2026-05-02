import { z } from "zod";
import { getDepth, getWhaleFlow } from "@pulse/sources/server";

import { json, text, type RegisterFn } from "../_helpers.js";

export const registerMarketsTools: RegisterFn = (server) => {
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
};
