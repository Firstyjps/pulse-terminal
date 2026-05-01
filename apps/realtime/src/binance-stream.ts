import WebSocket from "ws";
import type { PulseServer } from "./server.js";
import { TRACKED_SYMBOLS } from "./tracked-symbols.js";

const BINANCE_WS = "wss://fstream.binance.com/ws/!markPrice@arr@1s";
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;

interface MarkPriceTick {
  e: "markPriceUpdate";
  E: number;     // event time
  s: string;     // symbol
  p: string;     // mark price
  r: string;     // funding rate
  T: number;     // next funding time
}

const TRACKED = new Set<string>(TRACKED_SYMBOLS);

/**
 * Subscribe to Binance's all-symbol mark price stream and forward funding-rate
 * ticks for tracked symbols into the PulseServer broadcast pipeline.
 *
 * Auto-reconnects with exponential backoff capped at 60s.
 */
export function startBinanceStream(server: PulseServer): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = RECONNECT_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(BINANCE_WS);

    ws.on("open", () => {
      backoff = RECONNECT_DELAY_MS;
      console.log("[binance-stream] connected");
    });

    ws.on("message", (raw) => {
      let payload: unknown;
      try {
        payload = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const ticks = Array.isArray(payload) ? (payload as MarkPriceTick[]) : [];
      for (const tick of ticks) {
        if (tick.e !== "markPriceUpdate" || !TRACKED.has(tick.s)) continue;
        const rate = parseFloat(tick.r);
        if (!Number.isFinite(rate)) continue;
        server.broadcast({
          type: "funding",
          exchange: "binance",
          symbol: tick.s,
          rate,
          ratePercent: rate * 100,
          ts: tick.E,
        });
      }
    });

    ws.on("close", () => {
      if (stopped) return;
      console.warn(`[binance-stream] disconnected — retry in ${backoff}ms`);
      reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_RECONNECT_DELAY_MS);
    });

    ws.on("error", (err) => {
      console.warn("[binance-stream] error:", err.message);
      // close handler will trigger the reconnect
    });
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) {
      try {
        ws.removeAllListeners("close");
        ws.close();
      } catch {
        /* ignore */
      }
    }
  };
}
