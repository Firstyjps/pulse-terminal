import {
  generateHourlyReport,
  getAprIvCorrelation,
  loadDualAssetsConfig,
  parseDirections,
  parseDurations,
} from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const config = loadDualAssetsConfig();
  const coinPair = url.searchParams.get("coin_pair") ?? "SOL-USDT";
  const targetParam = url.searchParams.get("target");
  const targetPrice = targetParam ? Number(targetParam) : undefined;
  const days = Math.max(1, Math.min(90, Number(url.searchParams.get("days") ?? 7)));
  const includeCorr = url.searchParams.get("correlation") === "1";
  const durationParam = url.searchParams.get("duration");
  const directionParam = url.searchParams.get("direction");
  const durations = parseDurations(durationParam, config.durations);
  const directions = parseDirections(directionParam, config.directions);

  try {
    const report = generateHourlyReport({
      coinPair,
      targetPrice,
      days,
      durations,
      directions,
      minAprPct: config.minTrackAprPct,
    });
    if (includeCorr && !("error" in report)) {
      return Response.json({ ...report, correlation: getAprIvCorrelation(days) });
    }
    return Response.json(report);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
