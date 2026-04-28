import { getFundingRates } from "@pulse/sources/server";

export const runtime = "nodejs";
export const revalidate = 30;

export async function GET() {
  try {
    const rates = await getFundingRates();
    return Response.json({ rates, ts: Date.now() });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
