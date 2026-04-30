import { getOptionsTermStructure } from "@pulse/sources/server";
import type { OptionAsset } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 30;

const ASSETS: OptionAsset[] = ["BTC", "ETH", "SOL"];

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const asset = (url.searchParams.get("asset") ?? "BTC").toUpperCase() as OptionAsset;
    if (!ASSETS.includes(asset)) {
      return Response.json({ error: `asset must be one of ${ASSETS.join(", ")}` }, { status: 400 });
    }
    const data = await getOptionsTermStructure(asset);
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
