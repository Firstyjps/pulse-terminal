import { getAggregatePortfolio } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Unified CEX (Binance/Bybit/OKX) + DeFi (Meteora/Pendle/Orca/Aave) snapshot.
 *
 *   { configured: true, totalUsd, byVenue, byAsset, lp[], asOf, errors? }
 *
 * If aggregator returns zero positions (no env keys / nothing held),
 * `configured: false` plus a hint message. Failure isolation per-source.
 */
export async function GET() {
  try {
    const data = await getAggregatePortfolio();
    if (data.totalUsd === 0 && data.byVenue.length === 0) {
      return Response.json({
        configured: false,
        ...data,
        message:
          "No positions found. Set BINANCE_API_KEY+SECRET / BYBIT_API_KEY+SECRET / OKX_API_KEY+SECRET+PASSPHRASE in .env.local, or fund a tracked DeFi wallet.",
      });
    }
    return Response.json({ configured: true, ...data });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
