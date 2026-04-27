import { getOverview } from "@pulse/sources/server";

export const runtime = "nodejs";
export const revalidate = 120;

export async function GET() {
  try {
    const data = await getOverview();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
