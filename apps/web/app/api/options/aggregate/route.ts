import { getOptionsAggregate, findOptionsArbitrage } from "@pulse/sources/server";
import type { OptionAsset } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 25;

const VALID_ASSETS: OptionAsset[] = ["SOL", "BTC", "ETH"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asset = (url.searchParams.get("asset") ?? "SOL").toUpperCase() as OptionAsset;
  const includeArbitrage = url.searchParams.get("arbitrage") === "1";

  if (!VALID_ASSETS.includes(asset)) {
    return Response.json({ error: `invalid asset: ${asset}` }, { status: 400 });
  }

  try {
    const data = await getOptionsAggregate(asset);
    if (includeArbitrage) {
      return Response.json({
        ...data,
        arbitrage: findOptionsArbitrage(data.options),
      });
    }
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
