import { getPortfolio } from "@pulse/sources/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getPortfolio();
    if (!data) {
      return Response.json(
        { configured: false, message: "Set BINANCE_API_KEY + BINANCE_API_SECRET (read-only) in .env.local" },
        { status: 200 },
      );
    }
    return Response.json({ configured: true, ...data });
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
