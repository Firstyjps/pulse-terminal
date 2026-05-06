import { readFile } from "node:fs/promises";
import { fetchJson, type FuturesData } from "@pulse/sources";
import { resolveAlertsLogPath } from "../../../lib/alerts-log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ScanRecord {
  ts: string;
  scan_id: string;
  symbol: string;
  findings: Array<{
    category: string;
    severity: "low" | "med" | "high";
    signal: string;
    evidence: Record<string, unknown>;
    score?: { confidence?: number; impact?: number; priority?: number; label?: string };
  }>;
  marker: { btcPrice?: number; ethPrice?: number };
}

interface PatternStats {
  pattern: string;
  category: string;
  signal: string;
  expectedDirection: "down" | "up";
  count: number;
  /** % of times BTC moved in the "expected" direction within the lookahead window. */
  hitRate: number;
  /** Average BTC % move in the lookahead window. */
  avgMove: number;
  avgConfidence: number;
  avgImpact: number;
  avgPriority: number;
  samples: number;
}

interface CategoryStats {
  category: string;
  count: number;
  samples: number;
  expectedDirection: "down" | "up";
  hitRate: number;
  avgMove: number;
  avgPriority: number;
}

const LOG_PATH = resolveAlertsLogPath();
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

async function computeHitRates(scans: ScanRecord[], lookaheadH: number): Promise<{
  patterns: PatternStats[];
  categories: CategoryStats[];
}> {
  if (!scans.length) return { patterns: [], categories: [] };

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
  const groups = new Map<string, {
    category: string;
    signal: string;
    expectedDirection: "down" | "up";
    hits: number;
    total: number;
    moves: number[];
    confidence: number[];
    impact: number[];
    priority: number[];
  }>();
  const categories = new Map<string, {
    expectedDirection: "down" | "up";
    hits: number;
    total: number;
    moves: number[];
    priority: number[];
  }>();

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
      const g = groups.get(key) ?? {
        category: f.category,
        signal: f.signal,
        expectedDirection: expected,
        hits: 0,
        total: 0,
        moves: [],
        confidence: [],
        impact: [],
        priority: [],
      };
      g.total += 1;
      if (hit) g.hits += 1;
      g.moves.push(movePct);
      g.confidence.push(normalizeScore(f.score?.confidence, f.severity));
      g.impact.push(normalizeScore(f.score?.impact, f.severity));
      g.priority.push(normalizeScore(f.score?.priority, f.severity));
      groups.set(key, g);

      const c = categories.get(f.category) ?? { expectedDirection: expected, hits: 0, total: 0, moves: [], priority: [] };
      c.total += 1;
      if (hit) c.hits += 1;
      c.moves.push(movePct);
      c.priority.push(normalizeScore(f.score?.priority, f.severity));
      categories.set(f.category, c);
    }
  }

  const patterns: PatternStats[] = [];
  for (const [key, g] of groups.entries()) {
    if (g.total === 0) continue;
    patterns.push({
      pattern: key,
      category: g.category,
      signal: g.signal,
      expectedDirection: g.expectedDirection,
      count: g.total,
      samples: g.total,
      hitRate: (g.hits / g.total) * 100,
      avgMove: g.moves.reduce((s, n) => s + n, 0) / g.moves.length,
      avgConfidence: avg(g.confidence),
      avgImpact: avg(g.impact),
      avgPriority: avg(g.priority),
    });
  }
  patterns.sort((a, b) => b.count - a.count || b.avgPriority - a.avgPriority);

  const categoryStats: CategoryStats[] = [];
  for (const [category, c] of categories.entries()) {
    if (c.total === 0) continue;
    categoryStats.push({
      category,
      count: c.total,
      samples: c.total,
      expectedDirection: c.expectedDirection,
      hitRate: (c.hits / c.total) * 100,
      avgMove: avg(c.moves),
      avgPriority: avg(c.priority),
    });
  }
  categoryStats.sort((a, b) => b.count - a.count || b.avgPriority - a.avgPriority);

  return { patterns, categories: categoryStats };
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
      message: "No alert log found. Run `pnpm --filter @pulse/alerts dev` for a while to populate.",
      summary: { totalScans: 0, scoredScans: 0, oldestTs: null, newestTs: null, lookaheadHours: lookaheadH } satisfies BacktestSummary,
      stats: [] as PatternStats[],
      categories: [] as CategoryStats[],
    });
  }
  const cutoffMs = Date.now() - lookaheadH * 3_600_000;
  const scored = scans.filter((s) => new Date(s.ts).getTime() <= cutoffMs);
  const { patterns, categories } = await computeHitRates(scans, lookaheadH);
  return Response.json({
    configured: true,
    summary: {
      totalScans: scans.length,
      scoredScans: scored.length,
      oldestTs: scans[0]?.ts ?? null,
      newestTs: scans[scans.length - 1]?.ts ?? null,
      lookaheadHours: lookaheadH,
    } satisfies BacktestSummary,
    expectations: EXPECTED_DIRECTION,
    stats: patterns,
    categories,
  });
}

// FuturesData re-export shut up unused import warning at build time
void (null as unknown as FuturesData);

function avg(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, n) => s + n, 0) / values.length;
}

function normalizeScore(value: number | undefined, severity: "low" | "med" | "high"): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  return severity === "high" ? 75 : severity === "med" ? 55 : 35;
}
