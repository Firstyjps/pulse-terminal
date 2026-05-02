import { z } from "zod";
import {
  getFundingRates,
  getOpenInterest,
  type Exchange,
  type FundingRate,
  type OpenInterest,
} from "@pulse/sources/server";

import { hubFetch, json, text, type RegisterFn } from "../_helpers.js";

const ExchangeSchema = z.enum(["binance", "bybit", "okx", "deribit"]);

export const registerDerivativesTools: RegisterFn = (server) => {
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
};
