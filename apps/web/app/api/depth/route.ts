import { getDepth } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const symbol = (url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
  const limit = Math.max(5, Math.min(100, Number(url.searchParams.get("limit") ?? 20)));

  if (!/^[A-Z0-9]{4,12}$/.test(symbol)) {
    return Response.json({ error: "invalid symbol" }, { status: 400 });
  }

  try {
    const book = await getDepth(symbol, limit);
    return Response.json(book);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 502 });
  }
}
