import { getDualAssetsSettings, resolveDbPath } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(getDualAssetsSettings(resolveDbPath()));
}
