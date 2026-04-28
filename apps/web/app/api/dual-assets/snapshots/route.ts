import { getRecentSnapshots } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const limit = Math.max(1, Math.min(1000, Number(url.searchParams.get("limit") ?? 100)));
  try {
    const records = getRecentSnapshots(limit);
    return Response.json({ count: records.length, records });
  } catch (err) {
    return Response.json({ error: (err as Error).message, configured: false }, { status: 500 });
  }
}
