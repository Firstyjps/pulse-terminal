import { getAllSnapshots } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const all = getAllSnapshots();
    const filename = `pulse-snapshot-history-${new Date().toISOString().slice(0, 10)}.json`;
    return new Response(JSON.stringify({ exported_at: new Date().toISOString(), count: all.length, snapshots: all }, null, 2), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
