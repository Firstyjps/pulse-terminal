import {
  getDailySummaries,
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
  const days = Math.max(1, Math.min(365, Number(url.searchParams.get("days") ?? 30)));
  const durations = parseDurations(url.searchParams.get("duration"), config.durations);
  const directions = parseDirections(url.searchParams.get("direction"), config.directions);

  try {
    const summaries = getDailySummaries({
      coinPair,
      targetPrice: targetParam ? Number(targetParam) : undefined,
      days,
      durations,
      directions,
      minAprPct: config.minTrackAprPct,
    });
    return Response.json({
      count: summaries.length,
      summaries,
      target_groups: buildTargetGroups(summaries),
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

type SummaryRow = ReturnType<typeof getDailySummaries>[number];

function buildTargetGroups(rows: SummaryRow[]) {
  const groups = new Map<string, {
    target_price: number;
    direction: string;
    duration: string;
    samples: number;
    days: Set<string>;
    weightedApr: number;
    max_apr: number | null;
    latest_date: string | null;
  }>();

  for (const row of rows) {
    const key = `${row.target_price}|${row.direction}|${row.duration}`;
    const g = groups.get(key) ?? {
      target_price: row.target_price,
      direction: row.direction,
      duration: row.duration,
      samples: 0,
      days: new Set<string>(),
      weightedApr: 0,
      max_apr: null,
      latest_date: null,
    };
    const sampleCount = row.sample_count ?? 0;
    g.samples += sampleCount;
    g.days.add(row.date);
    if (row.avg_apr != null) g.weightedApr += row.avg_apr * Math.max(1, sampleCount);
    if (row.max_apr != null) g.max_apr = Math.max(g.max_apr ?? row.max_apr, row.max_apr);
    if (!g.latest_date || row.date > g.latest_date) g.latest_date = row.date;
    groups.set(key, g);
  }

  return [...groups.values()]
    .map((g) => ({
      target_price: g.target_price,
      samples: g.samples,
      days: g.days.size,
      avg_apr: g.samples > 0 ? +(g.weightedApr / g.samples).toFixed(2) : null,
      max_apr: g.max_apr,
      latest_date: g.latest_date,
    }))
    .sort((a, b) => (b.avg_apr ?? 0) - (a.avg_apr ?? 0));
}
