// Localhost-only HTTP cache layer — MCP / agents query this instead of hitting
// CoinGecko / DefiLlama / Binance directly. Sub-50ms responses (vs ~2s upstream).

import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { HubCache } from "./cache.js";
import {
  buildHealthV2,
  type AprReader,
  type OptionsReader,
} from "./hub-health.js";
import { getDepth, listDepthSymbols } from "./binance-depth-stream.js";

interface Routes {
  cache: HubCache;
  /** Optional APR store reader. Omit to suppress the `apr` block. */
  apr?: AprReader;
  /** Optional options-cache reader. Omit to suppress the `options` block. */
  options?: OptionsReader;
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

export function startHttpServer(port: number, routes: Routes): () => void {
  const server = createServer(async (req, res) => {
    const started = Date.now();
    try {
      handle(req, res, routes);
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

function handle(req: IncomingMessage, res: ServerResponse, routes: Routes) {
  if (!req.url) return send(res, 400, { error: "no url" });
  const url = new URL(req.url, "http://localhost");
  const { cache } = routes;

  // GET /health — v2 per docs/HUB-HEALTH-V2.md
  if (url.pathname === "/health") {
    const body = buildHealthV2({
      cache,
      apr: routes.apr,
      options: routes.options,
    });
    return send(res, 200, body);
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

  // GET /depth?symbol=BTCUSDT — Binance partial book top-20 (100ms cadence)
  if (url.pathname === "/depth") {
    const symbol = (url.searchParams.get("symbol") ?? "BTCUSDT").toUpperCase();
    const book = getDepth(symbol);
    if (!book) {
      return send(res, 404, {
        error: "no depth for that symbol",
        symbol,
        available: listDepthSymbols(),
      });
    }
    return send(res, 200, book);
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
