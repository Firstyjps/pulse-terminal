import { getOptionsAggregate, findOptionsArbitrage } from "@pulse/sources/server";
import type { OptionAsset } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 25;

const VALID_ASSETS: OptionAsset[] = ["SOL", "BTC", "ETH"];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asset = (url.searchParams.get("asset") ?? "SOL").toUpperCase() as OptionAsset;
  const includeArbitrage = url.searchParams.get("arbitrage") === "1";
  const expiry = url.searchParams.get("expiry"); // YYYYMMDD — optional filter
  const side = url.searchParams.get("side") as "call" | "put" | null;

  if (!VALID_ASSETS.includes(asset)) {
    return Response.json({ error: `invalid asset: ${asset}` }, { status: 400 });
  }
  if (expiry && !/^\d{8}$/.test(expiry)) {
    return Response.json({ error: "expiry must be YYYYMMDD" }, { status: 400 });
  }

  try {
    const data = await getOptionsAggregate(asset);
    let options = data.options;
    if (expiry) options = options.filter((o) => o.expiry === expiry);
    if (side === "call" || side === "put") options = options.filter((o) => o.side === side);

    const filtered = { ...data, options };
    if (includeArbitrage) {
      return Response.json({
        ...filtered,
        arbitrage: findOptionsArbitrage(filtered.options),
      });
    }
    return Response.json(filtered);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
