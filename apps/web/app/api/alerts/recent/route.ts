import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Web's CWD is `apps/web/`; the alerts log lives next door at `apps/alerts/data/`.
const LOG_PATH = resolve(
  process.env.ALERT_LOG_PATH ?? resolve(process.cwd(), "../alerts/data/alerts.jsonl"),
);

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
      logPath: LOG_PATH,
      records,
    });
  } catch {
    return Response.json({
      configured: false,
      count: 0,
      logPath: LOG_PATH,
      message: `No alert log at ${LOG_PATH}. Start the worker: pnpm --filter @pulse/alerts dev`,
      records: [] as ScanRecord[],
    });
  }
}
