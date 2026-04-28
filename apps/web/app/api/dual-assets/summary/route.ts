import { getDailySummaries } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const coinPair = url.searchParams.get("coin_pair") ?? "SOL-USDT";
  const targetParam = url.searchParams.get("target");
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? 30)));

  try {
    const summaries = getDailySummaries({
      coinPair,
      targetPrice: targetParam ? Number(targetParam) : undefined,
      days,
    });
    return Response.json({ count: summaries.length, summaries });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
