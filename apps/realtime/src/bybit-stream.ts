import WebSocket from "ws";
import type { PulseServer } from "./server.js";
import { TRACKED_SYMBOLS } from "./tracked-symbols.js";

const BYBIT_WS = "wss://stream.bybit.com/v5/public/linear";
const TRACKED = TRACKED_SYMBOLS;
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const PING_MS = 20_000;

/**
 * Bybit v5 linear public WS — subscribes to tickers.<SYMBOL>.
 * `tickers` snapshot includes fundingRate, nextFundingTime, openInterest,
 * openInterestValue, markPrice. Forwards funding + OI to the broadcast pipe.
 */
export function startBybitStream(server: PulseServer): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = RECONNECT_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(BYBIT_WS);

    ws.on("open", () => {
      backoff = RECONNECT_DELAY_MS;
      console.log("[bybit-stream] connected");
      const sub = {
        op: "subscribe",
        args: TRACKED.map((s) => `tickers.${s}`),
      };
      try { ws?.send(JSON.stringify(sub)); } catch { /* ignore */ }

      // Bybit recommends sending {op:"ping"} every ~20s
      pingTimer = setInterval(() => {
        try { ws?.send(JSON.stringify({ op: "ping" })); } catch { /* ignore */ }
      }, PING_MS);
    });

    ws.on("message", (raw) => {
      let payload: any;
      try { payload = JSON.parse(raw.toString()); } catch { return; }
      if (!payload || payload.topic == null) return;
      if (typeof payload.topic !== "string" || !payload.topic.startsWith("tickers.")) return;
      const data = payload.data;
      if (!data || typeof data !== "object") return;

      const symbol = String(data.symbol ?? payload.topic.split(".")[1] ?? "");
      const ts = Number(payload.ts ?? Date.now());

      const fundingRateRaw = data.fundingRate;
      if (fundingRateRaw != null && fundingRateRaw !== "") {
        const rate = parseFloat(fundingRateRaw);
        if (Number.isFinite(rate)) {
          server.broadcast({
            type: "funding",
            exchange: "bybit",
            symbol,
            rate,
            ratePercent: rate * 100,
            ts,
          });
        }
      }

      const oi = parseFloat(data.openInterest ?? "");
      const oiUsd = parseFloat(data.openInterestValue ?? "");
      if (Number.isFinite(oi) && Number.isFinite(oiUsd) && oiUsd > 0) {
        server.broadcast({
          type: "oi",
          exchange: "bybit",
          symbol,
          oi,
          oiUsd,
          ts,
        });
      }
    });

    ws.on("close", () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = undefined; }
      if (stopped) return;
      console.warn(`[bybit-stream] disconnected — retry in ${backoff}ms`);
      reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_RECONNECT_DELAY_MS);
    });

    ws.on("error", (err) => {
      console.warn("[bybit-stream] error:", err.message);
    });
  };

  connect();

  return () => {
    stopped = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (ws) {
      try {
        ws.removeAllListeners("close");
        ws.close();
      } catch { /* ignore */ }
    }
  };
}
