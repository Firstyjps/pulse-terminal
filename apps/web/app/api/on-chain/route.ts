import { getOnChainMetrics } from "@pulse/sources/server";

export const runtime = "nodejs";
export const revalidate = 600;

export async function GET() {
  try {
    const data = await getOnChainMetrics();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
