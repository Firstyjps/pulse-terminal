# Handoff → Role 6 (Web Agent): `/api/health` spec drift

**From:** Role 7 (Realtime) audit · 2026-05-01
**Target file:** `apps/web/app/api/health/route.ts`
**Status board claim:** ✅ done ([AGENTS.md L266](../../AGENTS.md))
**Reality:** route deviates from spec ([AGENTS.md L314-332](../../AGENTS.md)) on 2 points (3rd item — `ts` epoch — intentionally deferred, see Caveats).

Role 7 found this while verifying the Phase B hub probe contract. The hub side (`apps/realtime/src/http-server.ts` + `hub-health.ts`) already implements `/health` correctly and serves the consumer-side liveness probe with no changes needed. The fix is purely in Role 6's lane.

---

## Drift summary

| # | Spec ([L321](../../AGENTS.md)) | Actual ([route.ts:13-17](../../apps/web/app/api/health/route.ts), [L40-55](../../apps/web/app/api/health/route.ts)) |
|---|---|---|
| 1 | `{ ok, latencyMs, error? }` | `{ ok, ms, err? }` — field names differ |
| 2 | `hub?: { ok, latencyMs, error? }` "once Phase B ships" | **block missing** — Phase B has shipped (`apps/realtime/http-server.ts` running on `127.0.0.1:8081`) |

---

## Unified diff (apply directly to `apps/web/app/api/health/route.ts`)

```diff
@@ -12,11 +12,12 @@ export const dynamic = "force-dynamic";

 interface CheckResult {
   ok: boolean;
-  ms: number;
-  err?: string;
+  latencyMs: number;
+  error?: string;
 }

 const TIMEOUT_MS = 2_000;
+const HUB_BASE = process.env.PULSE_HUB_URL;

 async function ping(url: string): Promise<CheckResult> {
   const started = performance.now();
   const ctrl = new AbortController();
   const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
   try {
     const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
-    return { ok: res.ok, ms: Math.round(performance.now() - started) };
+    return { ok: res.ok, latencyMs: Math.round(performance.now() - started) };
   } catch (err) {
     return {
       ok: false,
-      ms: Math.round(performance.now() - started),
-      err: (err as Error).message.slice(0, 80),
+      latencyMs: Math.round(performance.now() - started),
+      error: (err as Error).message.slice(0, 80),
     };
   } finally {
     clearTimeout(t);
   }
 }

 export async function GET() {
-  const [coingecko, defillama, binance, yahoo] = await Promise.all([
+  const [coingecko, defillama, binance, yahoo, hub] = await Promise.all([
     ping("https://api.coingecko.com/api/v3/ping"),
     ping("https://api.llama.fi/v2/historicalChainTvl"),
     ping("https://fapi.binance.com/fapi/v1/ping"),
     ping("https://query1.finance.yahoo.com/v8/finance/chart/%5EGSPC?range=1d&interval=1d"),
+    HUB_BASE ? ping(`${HUB_BASE}/health`) : Promise.resolve(null),
   ]);

-  const checks = { coingecko, defillama, binance, yahoo };
+  const checks = hub
+    ? { coingecko, defillama, binance, yahoo, hub }
+    : { coingecko, defillama, binance, yahoo };
   const failed = Object.values(checks).filter((c) => !c.ok).length;
   const status = failed === 0 ? "healthy" : failed <= 2 ? "degraded" : "unhealthy";

   return Response.json({
     status,
     checks,
     ts: new Date().toISOString(),
   });
 }
```

---

## Rationale

- **Rename `ms`→`latencyMs`, `err`→`error`** — match the public spec at [AGENTS.md L321](../../AGENTS.md). The hub's *internal* `HealthV2.checks` still uses `{ ok, ms, err? }` ([hub-health.ts:47](../../apps/realtime/src/hub-health.ts)) per its own spec ([AGENTS.md L378](../../AGENTS.md)) — they're two different contracts; do not unify.
- **Hub probe gated on `PULSE_HUB_URL`** — spec marks `hub?:` optional. Current pm2 `ecosystem.config.cjs` always sets `PULSE_HUB_URL=http://127.0.0.1:8081` ([ecosystem.config.cjs:32](../../ecosystem.config.cjs)) so in production the block always renders, but local dev without realtime daemon still gets a clean response.
- **Liveness probe via existing `ping()`** — hub `/health` always returns HTTP 200 even when its internal `status` is `unhealthy` ([http-server.ts:67](../../apps/realtime/src/http-server.ts)), so a generic ping is the right semantic for the consumer-side probe (see Caveat #1).

---

## Caveats / decisions deferred

1. **Liveness vs deep health.** The probe says `hub.ok=true` whenever the HTTP 200 lands, even if the body is `{status:"unhealthy"}`. This is consistent with how the route treats the other 4 upstreams. If you want deep health, parse `body.status` and fold it in — but recommend leaving as-is for symmetry.
2. **`ts: ISO string` not changed.** Spec at [AGENTS.md L327](../../AGENTS.md) says `ts: number` (epoch). Current is `new Date().toISOString()`. Out of scope for this handoff per Role 7's instruction. Open follow-up: decide which the dashboard / monitor downstream actually consumes, then fix in a separate change.
3. **Status threshold unchanged.** Logic is `failed === 0 → healthy · ≤2 → degraded · 3+ → unhealthy`. With 5 checks (was 4) the thresholds still satisfy the spec at [L329](../../AGENTS.md). No tweak needed.

---

## Verification after apply

```powershell
# 1. typecheck
pnpm --filter @pulse/web typecheck

# 2. dev server
pnpm dev

# 3a. with PULSE_HUB_URL unset → no hub block
$env:PULSE_HUB_URL=$null; curl http://localhost:3000/api/health

# 3b. with hub running → hub block present
$env:PULSE_HUB_URL="http://127.0.0.1:8081"; curl http://localhost:3000/api/health
```

Expected: `checks.coingecko.latencyMs` (not `ms`), `checks.hub` present in 3b only, status derives correctly from `failed` count.

---

## Cross-references

- Hub `/health` contract: [docs/HUB-HEALTH-V2.md](../../docs/HUB-HEALTH-V2.md) (referenced from [http-server.ts:60](../../apps/realtime/src/http-server.ts))
- Spec for web `/api/health`: [AGENTS.md L314-332](../../AGENTS.md)
- Status board claim: [AGENTS.md L266](../../AGENTS.md) (mark this row 🔧 in-progress until applied)
