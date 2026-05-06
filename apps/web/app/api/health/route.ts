// Composite health check — verifies each upstream data source is reachable.
// Always returns HTTP 200 so probes (pm2, k8s) can rely on TCP/exit-code; the
// JSON body carries the per-check verdict.
//
// status:
//   healthy    — core checks pass and all external checks pass
//   degraded   — core checks pass, 1+ external checks fail
//   unhealthy  — core checks fail

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type HealthStatus = "healthy" | "degraded" | "unhealthy";

interface CheckResult {
  ok: boolean;
  ms: number;
  err?: string;
}

const TIMEOUT_MS = 2_500;
const HUB_TIMEOUT_MS = 1_200;

async function ping(url: string, timeoutMs = TIMEOUT_MS): Promise<CheckResult> {
  const started = performance.now();
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
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
  const hubUrl = process.env.PULSE_HUB_URL ?? "http://127.0.0.1:8081";
  const [coingecko, defillama, binance, yahoo, hub] = await Promise.all([
    ping("https://api.coingecko.com/api/v3/ping"),
    ping("https://api.llama.fi/v2/historicalChainTvl"),
    ping("https://fapi.binance.com/fapi/v1/ping"),
    ping("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d"),
    ping(`${hubUrl}/health`, HUB_TIMEOUT_MS),
  ]);

  const coreChecks = { hub };
  const externalChecks = { coingecko, defillama, binance, yahoo };
  const coreStatus = statusFromChecks(coreChecks, true);
  const externalStatus = statusFromChecks(externalChecks, false);
  const status: HealthStatus =
    coreStatus === "unhealthy"
      ? "unhealthy"
      : externalStatus === "healthy"
        ? "healthy"
        : "degraded";

  return Response.json({
    status,
    core: { status: coreStatus, checks: coreChecks },
    external: { status: externalStatus, checks: externalChecks },
    checks: { ...externalChecks, ...coreChecks },
    ts: new Date().toISOString(),
  });
}

function statusFromChecks(checks: Record<string, CheckResult>, core: boolean): HealthStatus {
  const failed = Object.values(checks).filter((c) => !c.ok).length;
  if (failed === 0) return "healthy";
  if (core) return "unhealthy";
  return failed <= 2 ? "degraded" : "unhealthy";
}
