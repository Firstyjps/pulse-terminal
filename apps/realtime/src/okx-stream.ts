import WebSocket from "ws";
import type { PulseServer } from "./server.js";

const OKX_WS = "wss://ws.okx.com:8443/ws/v5/public";
const TRACKED_INST = ["BTC-USDT-SWAP", "ETH-USDT-SWAP", "SOL-USDT-SWAP"];
const RECONNECT_DELAY_MS = 5_000;
const MAX_RECONNECT_DELAY_MS = 60_000;
const PING_MS = 25_000;

/**
 * OKX public v5 WS — subscribes to funding-rate + open-interest channels for
 * each tracked SWAP instrument. Forwards into the broadcast pipe.
 */
export function startOkxStream(server: PulseServer): () => void {
  let ws: WebSocket | null = null;
  let stopped = false;
  let backoff = RECONNECT_DELAY_MS;
  let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
  let pingTimer: ReturnType<typeof setInterval> | undefined;

  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(OKX_WS);

    ws.on("open", () => {
      backoff = RECONNECT_DELAY_MS;
      console.log("[okx-stream] connected");

      const args: { channel: string; instId: string }[] = [];
      for (const instId of TRACKED_INST) {
        args.push({ channel: "funding-rate", instId });
        args.push({ channel: "open-interest", instId });
      }
      try { ws?.send(JSON.stringify({ op: "subscribe", args })); } catch { /* ignore */ }

      // OKX requires raw "ping" text every 25-30s; reply is "pong"
      pingTimer = setInterval(() => {
        try { ws?.send("ping"); } catch { /* ignore */ }
      }, PING_MS);
    });

    ws.on("message", (raw) => {
      const text = raw.toString();
      if (text === "pong") return;

      let payload: any;
      try { payload = JSON.parse(text); } catch { return; }
      if (!payload || !payload.arg || !Array.isArray(payload.data)) return;

      const channel = payload.arg.channel;
      const ts = Number.parseInt(payload.data[0]?.ts ?? `${Date.now()}`, 10) || Date.now();

      for (const item of payload.data) {
        const symbol = String(item.instId ?? "");
        if (channel === "funding-rate") {
          const rate = parseFloat(item.fundingRate ?? "");
          if (!Number.isFinite(rate)) continue;
          server.broadcast({
            type: "funding",
            exchange: "okx",
            symbol,
            rate,
            ratePercent: rate * 100,
            ts,
          });
        } else if (channel === "open-interest") {
          const oi = parseFloat(item.oi ?? "");
          const oiUsd = parseFloat(item.oiUsd ?? "");
          if (!Number.isFinite(oi) || !Number.isFinite(oiUsd)) continue;
          server.broadcast({
            type: "oi",
            exchange: "okx",
            symbol,
            oi,
            oiUsd,
            ts,
          });
        }
      }
    });

    ws.on("close", () => {
      if (pingTimer) { clearInterval(pingTimer); pingTimer = undefined; }
      if (stopped) return;
      console.warn(`[okx-stream] disconnected — retry in ${backoff}ms`);
      reconnectTimer = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, MAX_RECONNECT_DELAY_MS);
    });

    ws.on("error", (err) => {
      console.warn("[okx-stream] error:", err.message);
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
