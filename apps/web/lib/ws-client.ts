// Browser WebSocket client with exponential-backoff reconnect.
// Type-safe via the same contracts module the server uses.

// NOTE: importing types only — no runtime cost in the browser.
type FundingMessage = { type: "funding"; exchange: string; symbol: string; rate: number; ratePercent: number; ts: number };
type OIMessage = { type: "oi"; exchange: string; symbol: string; oi: number; oiUsd: number; ts: number };
type FlowAlertMessage = { type: "flow.alert"; category: string; severity: "low" | "med" | "high"; payload: unknown; ts: number };
type HeartbeatMessage = { type: "heartbeat"; ts: number };
export type ServerMessage = FundingMessage | OIMessage | FlowAlertMessage | HeartbeatMessage;

export interface PulseClientOpts {
  url: string;
  onMessage: (msg: ServerMessage) => void;
  onStatus?: (status: "connecting" | "open" | "closed" | "error") => void;
  maxBackoffMs?: number;
}

export class PulseClient {
  private ws: WebSocket | null = null;
  private attempt = 0;
  private closed = false;
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(private opts: PulseClientOpts) {
    this.connect();
  }

  private connect() {
    if (this.closed) return;
    this.opts.onStatus?.("connecting");

    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.opts.onStatus?.("open");
    };

    ws.onmessage = (ev) => {
      try {
        const msg = JSON.parse(ev.data) as ServerMessage;
        this.opts.onMessage(msg);
      } catch {
        // ignore malformed
      }
    };

    ws.onerror = () => this.opts.onStatus?.("error");

    ws.onclose = () => {
      this.opts.onStatus?.("closed");
      if (this.closed) return;
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect() {
    const max = this.opts.maxBackoffMs ?? 30_000;
    const delay = Math.min(max, 500 * 2 ** this.attempt);
    this.attempt += 1;
    this.reconnectTimer = setTimeout(() => this.connect(), delay);
  }

  send(msg: object) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
    }
  }

  close() {
    this.closed = true;
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.ws?.close();
  }
}
