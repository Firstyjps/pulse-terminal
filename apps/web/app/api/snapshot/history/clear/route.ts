import { clearSnapshots } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Truncate the entire snapshot-history table.
 * POST is required (so accidental browser GETs don't wipe data).
 */
export async function POST() {
  try {
    clearSnapshots();
    return Response.json({ cleared: true, ts: Date.now() });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
