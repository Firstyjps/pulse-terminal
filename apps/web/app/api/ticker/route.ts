import { getOverview, getFutures, getPortfolio } from "@pulse/sources/server";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET() {
  try {
    const [overview, futures, portfolio] = await Promise.allSettled([
      getOverview(),
      getFutures(),
      getPortfolio(),
    ]);

    return Response.json({
      btc: futures.status === "fulfilled" ? {
        price: futures.value.btc.price,
        change24h: futures.value.btc.priceChange24h,
      } : null,
      eth: futures.status === "fulfilled" ? {
        price: futures.value.eth.price,
        change24h: futures.value.eth.priceChange24h,
      } : null,
      fearGreed: overview.status === "fulfilled" ? overview.value.fearGreedIndex ?? null : null,
      marketCap: overview.status === "fulfilled" ? {
        total: overview.value.totalMarketCap,
        change24h: overview.value.marketCapChange24h,
      } : null,
      portfolio: portfolio.status === "fulfilled" && portfolio.value ? {
        totalUsd: portfolio.value.totalUsd,
      } : null,
      ts: Date.now(),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
