import { z } from "zod";
import {
  getOptionsAggregate,
  findOptionsArbitrage,
  buildIVSmile,
  type OptionAsset,
} from "@pulse/sources/server";

import { json, text, type RegisterFn } from "../_helpers.js";

const OptionAssetSchema = z.enum(["SOL", "BTC", "ETH"]);

export const registerOptionsTools: RegisterFn = (server) => {
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
};
