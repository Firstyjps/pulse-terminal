import { PulseServer } from "./server.js";
import { startPollers } from "./poller.js";
import { startBinanceStream } from "./binance-stream.js";
import { startBybitStream } from "./bybit-stream.js";
import { startOkxStream } from "./okx-stream.js";
import { startSnapshotPoller } from "./snapshot-poller.js";
import { startHttpServer } from "./http-server.js";
import { cache } from "./cache.js";
import { createAprReader, preloadAprDriver } from "./apr-reader.js";
import { startBinanceDepthStream } from "./binance-depth-stream.js";
import { RegimeStore, startRegimeLoop, type RegimeReading } from "./regime/index.js";
import { getMacro } from "@pulse/sources/server";

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

// Macro regime indicator — computes Risk-On/Off/Range every 5min from cached
// data. Returns null when any required input is missing so the loop simply
// skips that tick instead of polluting the store with partial readings.
const regimeStore = new RegimeStore();
stoppers.push(
  startRegimeLoop({
    store: regimeStore,
    read: async (): Promise<RegimeReading | null> => {
      const overview = cache.snapshot?.overview;
      if (!overview?.btcDominance) return null;
      const btc = cache.fundingList({ exchange: "binance", symbol: "BTCUSDT" })[0];
      const eth = cache.fundingList({ exchange: "binance", symbol: "ETHUSDT" })[0];
      const sol = cache.fundingList({ exchange: "binance", symbol: "SOLUSDT" })[0];
      if (!btc || !eth || !sol) return null;
      const macro = await getMacro();
      const dxy = macro.dxy?.current;
      if (typeof dxy !== "number") return null;
      return {
        dominance: overview.btcDominance,
        dxy,
        btcFunding: btc.ratePercent,
        ethFunding: eth.ratePercent,
        solFunding: sol.ratePercent,
      };
    },
  }),
);

stoppers.push(
  startHttpServer(HTTP_PORT, { cache, apr: createAprReader(), regime: regimeStore }),
);

if (NATIVE_STREAMS.includes("binance")) stoppers.push(startBinanceStream(server));
if (NATIVE_STREAMS.includes("bybit")) stoppers.push(startBybitStream(server));
if (NATIVE_STREAMS.includes("okx")) stoppers.push(startOkxStream(server));

// Order book depth (Binance partial book @ 100ms). Disabled by setting PULSE_DEPTH=0.
if (process.env.PULSE_DEPTH !== "0") {
  stoppers.push(startBinanceDepthStream());
}

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
