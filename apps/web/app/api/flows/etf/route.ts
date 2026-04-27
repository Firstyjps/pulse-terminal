import { getETFFlows } from "@pulse/sources";

export const runtime = "nodejs";
export const revalidate = 1800;

export async function GET() {
  try {
    return Response.json(await getETFFlows());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
