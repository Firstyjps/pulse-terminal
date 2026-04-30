import {
  getSnapshotHistory,
  getSnapshotStats,
  collectAndSaveDailySnapshot,
} from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = clampInt(url.searchParams.get("days"), 1, 90, 30);
    const history = getSnapshotHistory(days);
    const stats = getSnapshotStats();
    return Response.json({ days, history, stats, ts: Date.now() });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

/** Manual collect — useful for fresh deploys before the 00:05 UTC cron fires. */
export async function POST() {
  try {
    const result = await collectAndSaveDailySnapshot({ force: false });
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
