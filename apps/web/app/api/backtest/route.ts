import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fetchJson, type FuturesData } from "@pulse/sources";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScanRecord {
  ts: string;
  scan_id: string;
  symbol: string;
  findings: Array<{ category: string; severity: "low" | "med" | "high"; signal: string; evidence: Record<string, unknown> }>;
  marker: { btcPrice?: number; ethPrice?: number };
}

interface PatternStats {
  pattern: string;
  count: number;
  /** % of times BTC moved in the "expected" direction within the lookahead window. */
  hitRate: number;
  /** Average BTC % move in the lookahead window. */
  avgMove: number;
  samples: number;
}

// Web's CWD is `apps/web/`; the alerts log lives next door at `apps/alerts/data/`.
const LOG_PATH = resolve(
  process.env.ALERT_LOG_PATH ?? resolve(process.cwd(), "../alerts/data/alerts.jsonl"),
);
// "Expected direction" per pattern category — used to score the alert
const EXPECTED_DIRECTION: Record<string, "down" | "up"> = {
  etf: "down",        // outflow → expect down
  funding: "down",    // overheated → expect mean revert down
  futures: "down",    // crowded long → expect down
  stablecoin: "up",   // dry powder building → expect up over time
  tvl: "down",
  dex: "down",
};

async function loadScans(): Promise<ScanRecord[]> {
  try {
    const txt = await readFile(LOG_PATH, "utf8");
    return txt.split("\n").filter((l) => l.trim()).map((l) => JSON.parse(l) as ScanRecord);
  } catch {
    return [];
  }
}

async function computeHitRates(scans: ScanRecord[], lookaheadH: number): Promise<PatternStats[]> {
  if (!scans.length) return [];

  // Get current BTC for "open" scans whose lookahead hasn't elapsed yet.
  // We only score scans that have aged at least `lookaheadH` hours.
  const cutoffMs = Date.now() - lookaheadH * 3_600_000;
  const scored = scans.filter((s) => new Date(s.ts).getTime() <= cutoffMs);

  // We need price N hours after each scan. Use Binance klines (1h candles) once.
  // This pulls last 1000 hours of BTC prices, enough for ~40 days.
  type Kline = [number, string, string, string, string, ...unknown[]];
  let klines: Kline[] = [];
  try {
    klines = await fetchJson<Kline[]>(
      "https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=1000",
      { revalidate: 600 },
    );
  } catch {
    klines = [];
  }
  // Map: hour-bucket-ms → close price
  const priceByHour = new Map<number, number>();
  for (const k of klines) {
    const hour = Math.floor(k[0] / 3_600_000) * 3_600_000;
    priceByHour.set(hour, parseFloat(k[4]));
  }

  // Group findings by pattern signal (concat category + signal)
  const groups = new Map<string, { hits: number; total: number; moves: number[] }>();

  for (const scan of scored) {
    const baseHour = Math.floor(new Date(scan.ts).getTime() / 3_600_000) * 3_600_000;
    const targetHour = baseHour + lookaheadH * 3_600_000;
    const startPrice = scan.marker.btcPrice ?? priceByHour.get(baseHour);
    const endPrice = priceByHour.get(targetHour);
    if (!startPrice || !endPrice) continue;
    const movePct = ((endPrice - startPrice) / startPrice) * 100;

    for (const f of scan.findings) {
      const key = `${f.category}:${f.signal}`;
      const expected = EXPECTED_DIRECTION[f.category] ?? "down";
      const hit = (expected === "down" && movePct < 0) || (expected === "up" && movePct > 0);
      const g = groups.get(key) ?? { hits: 0, total: 0, moves: [] };
      g.total += 1;
      if (hit) g.hits += 1;
      g.moves.push(movePct);
      groups.set(key, g);
    }
  }

  const stats: PatternStats[] = [];
  for (const [key, g] of groups.entries()) {
    if (g.total === 0) continue;
    stats.push({
      pattern: key,
      count: g.total,
      samples: g.total,
      hitRate: (g.hits / g.total) * 100,
      avgMove: g.moves.reduce((s, n) => s + n, 0) / g.moves.length,
    });
  }
  stats.sort((a, b) => b.count - a.count);
  return stats;
}

interface BacktestSummary {
  totalScans: number;
  scoredScans: number;
  oldestTs: string | null;
  newestTs: string | null;
  lookaheadHours: number;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const lookaheadH = Math.max(1, Math.min(168, Number(url.searchParams.get("hours") ?? 24)));
  const scans = await loadScans();
  if (!scans.length) {
    return Response.json({
      configured: false,
      message: `No alert log at ${LOG_PATH}. Run \`pnpm --filter @pulse/alerts dev\` for a while to populate.`,
      summary: { totalScans: 0, scoredScans: 0, oldestTs: null, newestTs: null, lookaheadHours: lookaheadH } satisfies BacktestSummary,
      stats: [] as PatternStats[],
    });
  }
  const cutoffMs = Date.now() - lookaheadH * 3_600_000;
  const scored = scans.filter((s) => new Date(s.ts).getTime() <= cutoffMs);
  const stats = await computeHitRates(scans, lookaheadH);
  return Response.json({
    configured: true,
    summary: {
      totalScans: scans.length,
      scoredScans: scored.length,
      oldestTs: scans[0]?.ts ?? null,
      newestTs: scans[scans.length - 1]?.ts ?? null,
      lookaheadHours: lookaheadH,
    } satisfies BacktestSummary,
    stats,
  });
}

// FuturesData re-export shut up unused import warning at build time
void (null as unknown as FuturesData);
