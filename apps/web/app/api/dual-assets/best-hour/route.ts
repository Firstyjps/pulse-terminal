import { generateHourlyReport, getAprIvCorrelation } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const coinPair = url.searchParams.get("coin_pair") ?? "SOL-USDT";
  const targetPrice = Number(url.searchParams.get("target") ?? 78);
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 7)));
  const includeCorr = url.searchParams.get("correlation") === "1";

  try {
    const report = generateHourlyReport({ coinPair, targetPrice, days });
    if (includeCorr && !("error" in report)) {
      return Response.json({ ...report, correlation: getAprIvCorrelation(days) });
    }
    return Response.json(report);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
