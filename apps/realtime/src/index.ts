import { PulseServer } from "./server.js";
import { startPollers } from "./poller.js";
import { startBinanceStream } from "./binance-stream.js";
import { startBybitStream } from "./bybit-stream.js";
import { startOkxStream } from "./okx-stream.js";
import { startSnapshotPoller } from "./snapshot-poller.js";
import { startHttpServer } from "./http-server.js";
import { cache } from "./cache.js";
import { createAprReader, preloadAprDriver } from "./apr-reader.js";

const WS_PORT = Number(process.env.WS_PORT ?? 8080);
const HTTP_PORT = Number(process.env.HUB_HTTP_PORT ?? 8081);
const NATIVE_STREAMS = (process.env.PULSE_NATIVE_STREAMS ?? "binance,bybit,okx")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const server = new PulseServer(WS_PORT);
const stoppers: Array<() => void> = [];

stoppers.push(startPollers(server));
stoppers.push(startSnapshotPoller(cache));

// Preload SQLite driver for APR /health block (graceful if unavailable).
void preloadAprDriver();
stoppers.push(startHttpServer(HTTP_PORT, { cache, apr: createAprReader() }));

if (NATIVE_STREAMS.includes("binance")) stoppers.push(startBinanceStream(server));
if (NATIVE_STREAMS.includes("bybit")) stoppers.push(startBybitStream(server));
if (NATIVE_STREAMS.includes("okx")) stoppers.push(startOkxStream(server));

console.log(`[realtime] native streams: ${NATIVE_STREAMS.join(", ") || "(none — REST poller only)"}`);

const shutdown = (signal: string) => {
  console.log(`[realtime] ${signal} received — shutting down`);
  for (const stop of stoppers) {
    try { stop(); } catch { /* ignore */ }
  }
  server.shutdown();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
