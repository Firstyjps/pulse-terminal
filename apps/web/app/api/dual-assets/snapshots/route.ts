import {
  getRecentSnapshots,
  loadDualAssetsConfig,
  parseDirections,
  parseDurations,
} from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const config = loadDualAssetsConfig();
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? 100)));
  const durationParam = url.searchParams.get("duration");
  const directionParam = url.searchParams.get("direction");
  const targetParam = url.searchParams.get("target");
  const minAprParam = url.searchParams.get("min_apr_pct");
  const durations = parseDurations(durationParam, config.durations);
  const directions = parseDirections(directionParam, config.directions);
  try {
    const records = getRecentSnapshots({
      limit,
      coinPair: url.searchParams.get("coin_pair") ?? undefined,
      targetPrice: targetParam ? Number(targetParam) : undefined,
      durations,
      directions,
      minAprPct: minAprParam ? Number(minAprParam) : config.minTrackAprPct,
      dedupe: true,
    });
    return Response.json({
      count: records.length,
      records,
      filters: {
        minTrackAprPct: minAprParam ? Number(minAprParam) : config.minTrackAprPct,
        durations,
        directions,
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message, configured: false }, { status: 500 });
  }
}
