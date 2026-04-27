import { getFutures } from "@pulse/sources/server";

export const runtime = "nodejs";
export const revalidate = 60;

export async function GET() {
  try {
    return Response.json(await getFutures());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
