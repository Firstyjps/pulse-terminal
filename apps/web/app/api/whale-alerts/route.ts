import { fetchJson } from "@pulse/sources";
import { getWhaleAlerts } from "@pulse/sources/server";

export const runtime = "nodejs";
export const revalidate = 60;

interface CGSimple { bitcoin?: { usd?: number } }

async function getBtcSpot(): Promise<number> {
  try {
    const j = await fetchJson<CGSimple>(
      "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd",
      { revalidate: 120, retries: 1 },
    );
    if (j.bitcoin?.usd && Number.isFinite(j.bitcoin.usd)) return j.bitcoin.usd;
  } catch { /* fall through */ }
  return 70_000;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const rawThreshold = parseFloat(url.searchParams.get("threshold") ?? "1000000");
    const threshold = Number.isFinite(rawThreshold) && rawThreshold > 0
      ? Math.min(Math.max(rawThreshold, 100_000), 1_000_000_000)
      : 1_000_000;
    const btcPrice = await getBtcSpot();
    const data = await getWhaleAlerts(threshold, btcPrice);
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
