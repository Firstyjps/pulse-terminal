import { getMultiPortfolio } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns a unified multi-source portfolio.
 *
 *   { configured: true,
 *     sources: [{source:"binance"|"bybit"|"okx", totalUsd, balances[], ts}],
 *     totalUsd, status[], ts }
 *
 * If no source is configured, `configured: false` + a hint message.
 */
export async function GET() {
  try {
    const data = await getMultiPortfolio();
    if (data.sources.length === 0) {
      return Response.json(
        {
          configured: false,
          status: data.status,
          message:
            "No portfolio source configured. Set BINANCE_API_KEY+SECRET, BYBIT_API_KEY+SECRET, or OKX_API_KEY+SECRET+PASSPHRASE in .env.local (read-only keys recommended).",
        },
        { status: 200 },
      );
    }
    return Response.json({ configured: true, ...data });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
