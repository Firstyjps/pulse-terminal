import { getAggregatePortfolio } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unified portfolio snapshot — CoinStats Premium first, multi-CEX/DeFi fallback.
 *
 *   { configured: true, totalUsd, byVenue, byAsset, lp[], asOf, _source, errors? }
 *
 * `_source` is one of: "coinstats" (canonical) | "multi-cex" (fallback) | "none".
 * If aggregator returns zero positions, `configured: false` plus a hint message
 * tailored to which source is missing.
 */
export async function GET() {
  try {
    const data = await getAggregatePortfolio();
    if (data.totalUsd === 0 && data.byVenue.length === 0) {
      const message =
        data._source === "none"
          ? "No positions found. Set COINSTATS_API_KEY (recommended — full multi-wallet portfolio) or BINANCE_API_KEY+SECRET / BYBIT_API_KEY+SECRET / OKX_API_KEY+SECRET+PASSPHRASE in .env.local."
          : "Portfolio source returned empty.";
      return Response.json({
        configured: false,
        ...data,
        message,
      });
    }
    return Response.json({ configured: true, ...data });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
