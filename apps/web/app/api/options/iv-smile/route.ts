import { getOptionsAggregate, buildIVSmile } from "@pulse/sources/server";
import type { OptionAsset } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 25;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const asset = (url.searchParams.get("asset") ?? "SOL").toUpperCase() as OptionAsset;
  const expiry = url.searchParams.get("expiry");

  try {
    const agg = await getOptionsAggregate(asset);
    const targetExpiry = expiry ?? agg.expiries[0];
    if (!targetExpiry) return Response.json({ error: "no expiries available" }, { status: 404 });
    const smile = buildIVSmile(agg.options, asset, targetExpiry);
    return Response.json({ ...smile, available_expiries: agg.expiries, underlyingPrice: agg.underlyingPrice });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
