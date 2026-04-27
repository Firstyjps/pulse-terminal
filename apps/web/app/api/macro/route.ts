import { getMacro } from "@pulse/sources/server";

export const runtime = "nodejs";
export const revalidate = 600;

export async function GET() {
  try {
    return Response.json(await getMacro());
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
