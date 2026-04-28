import { resolve } from "node:path";
import { runGradedBacktest } from "@pulse/sources/server";

// Phase 4 — graded backtest endpoint.
//
// Wraps `runGradedBacktest()` (the pure-engine + JSONL-reader + kline-fetcher
// orchestrator from @pulse/sources) and exposes per-category / per-severity /
// calibration-bin hit rates so the /backtest UI can surface whether the
// rubric's confidence actually tracks reality.
//
// Existing /api/backtest reports binary direction-match hit-rate per pattern;
// this endpoint adds the confidence-weighted view. Both can coexist.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const lookaheadHours = clampInt(url.searchParams.get("lookahead"), 1, 168, 24);
  const thresholdPercent = clampFloat(url.searchParams.get("threshold"), 0.1, 20, 1.0);
  const lookbackDays = clampInt(url.searchParams.get("lookback"), 1, 365, 30);
  const allowSynthetic = url.searchParams.get("synthetic") !== "false";

  // Web's CWD is `apps/web/`; alerts log lives next door.
  const logPath = resolve(process.cwd(), "../alerts/data/alerts.jsonl");

  try {
    const sinceMs = Date.now() - lookbackDays * 24 * 3_600_000;
    const includeResults = url.searchParams.get("include") === "results";
    const { report, results, meta } = await runGradedBacktest({
      logPath,
      lookaheadHours,
      thresholdPercent,
      sinceMs,
      allowSynthetic,
    });
    // Don't return the per-finding `results` array by default — it can be
    // megabytes for a 30-day log. Callers that need it can pass ?include=results.
    const body: Record<string, unknown> = { report, meta };
    if (includeResults) body.results = results.slice(0, 1000); // hard cap
    return Response.json(body, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    return Response.json(
      { error: (err as Error).message ?? "graded backtest failed" },
      { status: 500 },
    );
  }
}

// ── helpers ─────────────────────────────────────────────────────────────────

function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function clampFloat(raw: string | null, min: number, max: number, fallback: number): number {
  if (!raw) return fallback;
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}
