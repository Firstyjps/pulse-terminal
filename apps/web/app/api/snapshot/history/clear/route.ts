import { timingSafeEqual } from "node:crypto";
import { clearSnapshots } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Truncate the entire snapshot-history table.
 * Requires PULSE_ADMIN_TOKEN. Without it this route is disabled in production.
 */
export async function POST(req: Request) {
  const configured = process.env.PULSE_ADMIN_TOKEN;
  if (!configured) {
    return Response.json({ error: "not found" }, { status: 404 });
  }

  const provided = readAdminToken(req);
  if (!provided || !constantTimeEqual(provided, configured)) {
    return Response.json({ error: "forbidden" }, { status: 403 });
  }

  try {
    clearSnapshots();
    return Response.json({ cleared: true, ts: Date.now() });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

function readAdminToken(req: Request): string | null {
  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length).trim();
  return req.headers.get("x-pulse-admin-token");
}

function constantTimeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}
