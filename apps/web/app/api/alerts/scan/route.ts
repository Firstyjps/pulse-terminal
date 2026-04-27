import { scanAnomalies } from "@pulse/sources";

export const runtime = "nodejs";
// Anomaly scan is "live" — disable static caching but cap inbound work via revalidate.
export const revalidate = 60;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const symbol = (searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  try {
    const scan = await scanAnomalies(symbol);
    return Response.json(scan);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
