import { getFullSnapshot } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 120;

export async function GET() {
  try {
    return Response.json(await getFullSnapshot());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
