import { getWhaleFlow } from "@pulse/sources/server";

export const runtime = "nodejs";
// 60s revalidate — Etherscan free tier has tight rate limits
export const revalidate = 60;

export async function GET() {
  try {
    const data = await getWhaleFlow();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
