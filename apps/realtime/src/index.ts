import { PulseServer } from "./server.js";
import { startPollers } from "./poller.js";
import { startBinanceStream } from "./binance-stream.js";
import { startBybitStream } from "./bybit-stream.js";
import { startOkxStream } from "./okx-stream.js";

const PORT = Number(process.env.WS_PORT ?? 8080);
const NATIVE_STREAMS = (process.env.PULSE_NATIVE_STREAMS ?? "binance,bybit,okx")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

const server = new PulseServer(PORT);
const stopPollers = startPollers(server);

const stoppers: Array<() => void> = [stopPollers];

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
