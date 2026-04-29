// Binance partial book depth stream (top 20 levels @ 100ms).
// State held in this module (Map<symbol, DepthBook>) so the HTTP layer
// can read the latest snapshot in O(1) without touching the WS handler.
// Connection auto-reconnects on close with exponential backoff.

import WebSocket from "ws";

export interface DepthBook {
  symbol: string;
  bids: [number, number][]; // [price, qty]
  asks: [number, number][];
  ts: number; // ms epoch (last update from binance)
}

interface DepthMsg {
  e?: string;
  E?: number;
  s?: string;
  bids: [string, string][];
  asks: [string, string][];
  lastUpdateId?: number;
}

const _depths = new Map<string, DepthBook>();

export function getDepth(symbol: string): DepthBook | null {
  return _depths.get(symbol.toUpperCase()) ?? null;
}

export function listDepthSymbols(): string[] {
  return [...(_depths.keys())];
}

const DEFAULT_SYMBOLS = (process.env.PULSE_DEPTH_SYMBOLS ?? "BTCUSDT,ETHUSDT,SOLUSDT")
  .split(",")
  .map((s) => s.trim().toUpperCase())
  .filter(Boolean);

function parseLevels(raw: [string, string][]): [number, number][] {
  return raw.map(([p, q]) => [parseFloat(p), parseFloat(q)] as [number, number]);
}

export function startBinanceDepthStream(): () => void {
  const stoppers: Array<() => void> = [];

  for (const symbol of DEFAULT_SYMBOLS) {
    const stream = symbol.toLowerCase() + "@depth20@100ms";
    const url = `wss://stream.binance.com:9443/ws/${stream}`;
    let ws: WebSocket | null = null;
    let stopped = false;
    let backoff = 1_000;

    const connect = () => {
      if (stopped) return;
      ws = new WebSocket(url);

      ws.on("open", () => {
        backoff = 1_000;
        console.log(`[depth] ${symbol} connected`);
      });

      ws.on("message", (data) => {
        try {
          const msg = JSON.parse(data.toString()) as DepthMsg;
          if (!msg.bids || !msg.asks) return;
          _depths.set(symbol, {
            symbol,
            bids: parseLevels(msg.bids).slice(0, 20),
            asks: parseLevels(msg.asks).slice(0, 20),
            ts: msg.E ?? Date.now(),
          });
        } catch {
          /* ignore parse errors */
        }
      });

      ws.on("close", () => {
        if (stopped) return;
        console.warn(`[depth] ${symbol} closed — reconnecting in ${backoff}ms`);
        setTimeout(connect, backoff);
        backoff = Math.min(backoff * 2, 30_000);
      });

      ws.on("error", (err) => {
        console.warn(`[depth] ${symbol} error:`, (err as Error).message);
      });
    };

    connect();

    stoppers.push(() => {
      stopped = true;
      try { ws?.close(); } catch { /* ignore */ }
    });
  }

  console.log(`[depth] streaming ${DEFAULT_SYMBOLS.length} symbol(s): ${DEFAULT_SYMBOLS.join(",")}`);
  return () => { for (const s of stoppers) s(); };
}
