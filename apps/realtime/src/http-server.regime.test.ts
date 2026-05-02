import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startHttpServer } from "./http-server.js";
import { RegimeStore, type RegimeReading } from "./regime/index.js";
import type { HubCache } from "./cache.js";

// Minimum HubCache stub — http-server only touches `cache` for /snapshot,
// /funding, /oi, /summary etc. Our tests only hit /regime so a tiny stub
// satisfies the type without dragging in the real cache.
function stubCache(): HubCache {
  return {
    snapshot: null,
    snapshotAgeMs: () => Infinity,
    funding: new Map(),
    fundingList: () => [],
    oi: new Map(),
    oiList: () => [],
    health: { lastError: undefined, lastErrorTs: undefined },
  } as unknown as HubCache;
}

const NEUTRAL: RegimeReading = {
  dominance: 53,
  dxy: 105,
  btcFunding: 0.005,
  ethFunding: 0.005,
  solFunding: 0.005,
};

async function pickPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const probe: Server = createServer();
    probe.listen(0, "127.0.0.1", () => {
      const addr = probe.address();
      if (typeof addr === "object" && addr) {
        const p = addr.port;
        probe.close(() => resolve(p));
      } else {
        probe.close(() => reject(new Error("no port")));
      }
    });
    probe.on("error", reject);
  });
}

async function getJson(port: number, path: string): Promise<{ status: number; body: any; ageHeader: string | null }> {
  const res = await fetch(`http://127.0.0.1:${port}${path}`);
  const body = await res.json().catch(() => null);
  return { status: res.status, body, ageHeader: res.headers.get("x-cache-age") };
}

describe("/regime endpoint", () => {
  let port: number;
  let stop: (() => void) | null = null;
  const tmpDirs: string[] = [];

  beforeEach(async () => {
    port = await pickPort();
  });

  afterEach(() => {
    if (stop) {
      stop();
      stop = null;
    }
    for (const d of tmpDirs.splice(0)) {
      try {
        rmSync(d, { recursive: true, force: true });
      } catch {
        /* best effort */
      }
    }
  });

  function mkPath(): string {
    const dir = mkdtempSync(join(tmpdir(), "regime-http-"));
    tmpDirs.push(dir);
    return join(dir, "last-regime.json");
  }

  it("returns 503 when store has no snapshot (truly first-ever boot)", async () => {
    const store = new RegimeStore({ persistPath: null });
    stop = startHttpServer(port, { cache: stubCache(), regime: store });
    const r = await getJson(port, "/regime");
    expect(r.status).toBe(503);
    expect(r.body.error).toContain("not computed yet");
  });

  it("returns 200 with _isStale=true + _ageMs when store hydrated from disk", async () => {
    const path = mkPath();
    const ts = Date.now() - 300_000; // 5 min ago
    writeFileSync(
      path,
      JSON.stringify({
        regime: "Risk-Off",
        score: -0.5,
        reason: "test",
        ts,
        reading: NEUTRAL,
        signals: {},
      }),
      "utf-8",
    );
    const store = new RegimeStore({ persistPath: path });
    stop = startHttpServer(port, { cache: stubCache(), regime: store });
    const r = await getJson(port, "/regime");
    expect(r.status).toBe(200);
    expect(r.body._isStale).toBe(true);
    expect(typeof r.body._ageMs).toBe("number");
    expect(r.body._ageMs).toBeGreaterThan(290_000);
    expect(r.body.regime).toBe("Risk-Off");
    expect(r.ageHeader).not.toBeNull();
  });

  it("returns 200 WITHOUT _isStale after a fresh record() since hydrate", async () => {
    const path = mkPath();
    writeFileSync(
      path,
      JSON.stringify({
        regime: "Risk-Off",
        score: -0.5,
        reason: "old",
        ts: Date.now() - 600_000,
        reading: NEUTRAL,
        signals: {},
      }),
      "utf-8",
    );
    const store = new RegimeStore({ persistPath: path });
    expect(store.isHydrated()).toBe(true);
    store.record({ ...NEUTRAL });
    expect(store.isHydrated()).toBe(false);
    stop = startHttpServer(port, { cache: stubCache(), regime: store });
    const r = await getJson(port, "/regime");
    expect(r.status).toBe(200);
    expect(r.body._isStale).toBeUndefined();
    expect(r.body._ageMs).toBeUndefined();
  });

  it("returns 404 when regime store is not wired", async () => {
    stop = startHttpServer(port, { cache: stubCache() });
    const r = await getJson(port, "/regime");
    expect(r.status).toBe(404);
    expect(r.body.error).toContain("not wired");
  });
});
