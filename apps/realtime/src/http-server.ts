// Localhost-only HTTP cache layer — MCP / agents query this instead of hitting
// CoinGecko / DefiLlama / Binance directly. Sub-50ms responses (vs ~2s upstream).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { HubCache } from "./cache.js";

interface Routes {
  cache: HubCache;
}

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
};

function send(res: ServerResponse, status: number, body: unknown, extraHeaders: Record<string, string> = {}) {
  res.writeHead(status, { ...JSON_HEADERS, ...extraHeaders });
  res.end(JSON.stringify(body));
}

function sendCached(res: ServerResponse, body: unknown, ageMs: number) {
  send(res, 200, body, { "x-cache-age": String(Math.round(ageMs / 1000)) });
}

export function startHttpServer(port: number, { cache }: Routes): () => void {
  const server = createServer(async (req, res) => {
    const started = Date.now();
    try {
      handle(req, res, cache);
    } catch (err) {
      send(res, 500, { error: (err as Error).message });
    }
    res.on("finish", () => {
      console.log(`[http] ${req.method} ${req.url} → ${res.statusCode} (${Date.now() - started}ms)`);
    });
  });

  server.listen(port, "127.0.0.1", () => {
    console.log(`[http] cache layer on http://127.0.0.1:${port}`);
  });

  return () => server.close();
}

function handle(req: IncomingMessage, res: ServerResponse, cache: HubCache) {
  if (!req.url) return send(res, 400, { error: "no url" });
  const url = new URL(req.url, "http://localhost");

  // GET /health
  if (url.pathname === "/health") {
    const fundingFresh = [...cache.funding.values()].filter(
      (f) => Date.now() - f.ts < 5 * 60_000,
    ).length;
    const snapAge = cache.snapshotAgeMs();
    return send(res, 200, {
      status: cache.snapshot ? "healthy" : "warming",
      snapshotAgeSec: snapAge === Infinity ? null : Math.round(snapAge / 1000),
      fundingChannelsFresh: fundingFresh,
      oiChannels: cache.oi.size,
      ts: new Date().toISOString(),
    });
  }

  // GET /snapshot
  if (url.pathname === "/snapshot") {
    if (!cache.snapshot) return send(res, 503, { error: "snapshot not ready yet" });
    return sendCached(res, cache.snapshot, cache.snapshotAgeMs());
  }

  // GET /funding[?exchange=X&symbol=Y]
  if (url.pathname === "/funding") {
    const exchange = url.searchParams.get("exchange") ?? undefined;
    const symbol = url.searchParams.get("symbol") ?? undefined;
    return send(res, 200, {
      rates: cache.fundingList({ exchange, symbol }),
      ts: new Date().toISOString(),
    });
  }

  // GET /funding/:exchange/:symbol
  const fmatch = url.pathname.match(/^\/funding\/([^/]+)\/([^/]+)$/);
  if (fmatch) {
    const [, exchange, symbol] = fmatch;
    const list = cache.fundingList({ exchange, symbol });
    if (!list.length) return send(res, 404, { error: "no funding for that exchange/symbol" });
    return send(res, 200, list[0]);
  }

  // GET /oi[?exchange=X&symbol=Y]
  if (url.pathname === "/oi") {
    const exchange = url.searchParams.get("exchange") ?? undefined;
    const symbol = url.searchParams.get("symbol") ?? undefined;
    return send(res, 200, {
      ois: cache.oiList({ exchange, symbol }),
      ts: new Date().toISOString(),
    });
  }

  // GET /oi/:exchange/:symbol
  const omatch = url.pathname.match(/^\/oi\/([^/]+)\/([^/]+)$/);
  if (omatch) {
    const [, exchange, symbol] = omatch;
    const list = cache.oiList({ exchange, symbol });
    if (!list.length) return send(res, 404, { error: "no OI for that exchange/symbol" });
    return send(res, 200, list[0]);
  }

  // GET /summary — all-in-one debug endpoint
  if (url.pathname === "/summary") {
    return send(res, 200, {
      snapshotPresent: !!cache.snapshot,
      snapshotAgeSec: cache.snapshotAgeMs() === Infinity ? null : Math.round(cache.snapshotAgeMs() / 1000),
      fundingCount: cache.funding.size,
      oiCount: cache.oi.size,
      health: cache.health,
    });
  }

  send(res, 404, { error: "not found", path: url.pathname });
}
