import { getSocialBuzz } from "@pulse/sources/server";

export const runtime = "nodejs";
export const revalidate = 900;

export async function GET() {
  try {
    const data = await getSocialBuzz();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
