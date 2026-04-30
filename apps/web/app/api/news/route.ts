import { getCryptoNews } from "@pulse/sources/server";
import type { NewsFilter } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 300;

const ALLOWED: NewsFilter[] = ["all", "BTC", "ETH", "hot", "bullish", "bearish"];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = (url.searchParams.get("filter") ?? "all") as NewsFilter;
    const filter = ALLOWED.includes(raw) ? raw : "all";
    const items = await getCryptoNews(filter);
    return Response.json({ filter, items, ts: Date.now() });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
