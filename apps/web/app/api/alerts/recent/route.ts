import { readFile } from "node:fs/promises";
import { resolveAlertsLogPath } from "../../../../lib/alerts-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOG_PATH = resolveAlertsLogPath();

interface ScanRecord {
  ts: string;
  scan_id: string;
  symbol: string;
  findings: Array<{ category: string; severity: "low" | "med" | "high"; signal: string; evidence: Record<string, unknown> }>;
  marker: { btcPrice?: number; ethPrice?: number };
  sent_webhook?: boolean;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = Math.max(1, Math.min(Number(searchParams.get("limit") ?? "20"), 200));

  try {
    const txt = await readFile(LOG_PATH, "utf8");
    const lines = txt.split("\n").filter((l) => l.trim());
    // Take last N (most recent)
    const tail = lines.slice(-limit);
    const records: ScanRecord[] = [];
    for (const l of tail) {
      try {
        records.push(JSON.parse(l) as ScanRecord);
      } catch {
        /* skip malformed line */
      }
    }
    records.reverse(); // newest first
    return Response.json({
      configured: true,
      count: records.length,
      records,
    });
  } catch {
    return Response.json({
      configured: false,
      count: 0,
      message: "No alert log found. Start the worker: pnpm --filter @pulse/alerts dev",
      records: [] as ScanRecord[],
    });
  }
}
