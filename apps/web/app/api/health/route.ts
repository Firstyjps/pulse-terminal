// Composite health check — verifies each upstream data source is reachable.
// Always returns HTTP 200 so probes (pm2, k8s) can rely on TCP/exit-code; the
// JSON body carries the per-check verdict.
//
// status:
//   healthy    — all checks pass
//   degraded   — 1-2 checks fail
//   unhealthy  — 3+ checks fail

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface CheckResult {
  ok: boolean;
  ms: number;
  err?: string;
}

const TIMEOUT_MS = 2_000;

async function ping(url: string): Promise<CheckResult> {
  const started = performance.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    return { ok: res.ok, ms: Math.round(performance.now() - started) };
  } catch (err) {
    return {
      ok: false,
      ms: Math.round(performance.now() - started),
      err: (err as Error).message.slice(0, 80),
    };
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const [coingecko, defillama, binance, yahoo] = await Promise.all([
    ping("https://api.coingecko.com/api/v3/ping"),
    ping("https://api.llama.fi/v2/historicalChainTvl"),
    ping("https://fapi.binance.com/fapi/v1/ping"),
    ping("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d"),
  ]);

  const checks = { coingecko, defillama, binance, yahoo };
  const failed = Object.values(checks).filter((c) => !c.ok).length;
  const status = failed === 0 ? "healthy" : failed <= 2 ? "degraded" : "unhealthy";

  return Response.json({
    status,
    checks,
    ts: new Date().toISOString(),
  });
}
