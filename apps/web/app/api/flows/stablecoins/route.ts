import { getStablecoins } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 600;

export async function GET() {
  try {
    return Response.json(await getStablecoins());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
