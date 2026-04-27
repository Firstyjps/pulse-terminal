import { WebSocketServer, WebSocket } from "ws";
import type { ClientMessage, ServerMessage } from "./contracts.js";
import { channelFor, channelMatches } from "./channels.js";

const HEARTBEAT_MS = 30_000;
const MAX_BUFFER = 64; // per-client backpressure cap (oldest dropped first)
/** Default subscription if a client never sends a subscribe message. */
const DEFAULT_SUBSCRIPTIONS = ["*"] as const;

interface Client {
  ws: WebSocket;
  alive: boolean;
  /** Channels the client cares about. Wildcards allowed (e.g. "funding:*"). */
  subscriptions: Set<string>;
  /** Pending payloads when the underlying socket buffer is filling. */
  buffer: ServerMessage[];
}

export class PulseServer {
  private wss: WebSocketServer;
  private clients = new Set<Client>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  constructor(port: number) {
    this.wss = new WebSocketServer({ port });
    this.wss.on("connection", (ws) => this.onConnection(ws));
    this.startHeartbeat();
    console.log(`[realtime] listening on ws://localhost:${port}`);
  }

  private onConnection(ws: WebSocket) {
    const client: Client = {
      ws,
      alive: true,
      subscriptions: new Set(DEFAULT_SUBSCRIPTIONS),
      buffer: [],
    };
    this.clients.add(client);

    ws.on("pong", () => {
      client.alive = true;
    });
    ws.on("close", () => this.clients.delete(client));
    ws.on("error", (err) => {
      console.warn("[realtime] client error:", err.message);
      this.clients.delete(client);
    });
    ws.on("message", (raw) => {
      let msg: ClientMessage;
      try {
        msg = JSON.parse(raw.toString()) as ClientMessage;
      } catch {
        return;
      }
      this.handleClientMessage(client, msg);
    });

    // Send initial ack so the client knows it's connected
    this.sendTo(client, {
      type: "ack",
      channels: [...client.subscriptions],
      ts: Date.now(),
    });
  }

  private handleClientMessage(client: Client, msg: ClientMessage) {
    if (msg.type === "subscribe") {
      // Replace default "*" if the client gives explicit channels
      if (client.subscriptions.has("*") && client.subscriptions.size === 1) {
        client.subscriptions.clear();
      }
      for (const ch of msg.channels) client.subscriptions.add(ch);
      this.sendTo(client, {
        type: "ack",
        channels: [...client.subscriptions],
        ts: Date.now(),
      });
      return;
    }
    if (msg.type === "unsubscribe") {
      for (const ch of msg.channels) client.subscriptions.delete(ch);
      if (client.subscriptions.size === 0) client.subscriptions.add("heartbeat");
      this.sendTo(client, {
        type: "ack",
        channels: [...client.subscriptions],
        ts: Date.now(),
      });
      return;
    }
  }

  private startHeartbeat() {
    this.heartbeatTimer = setInterval(() => {
      const ts = Date.now();
      for (const client of [...this.clients]) {
        if (!client.alive) {
          client.ws.terminate();
          this.clients.delete(client);
          continue;
        }
        client.alive = false;
        try {
          client.ws.ping();
        } catch {
          /* ignore */
        }
      }
      this.broadcast({ type: "heartbeat", ts });
    }, HEARTBEAT_MS);
  }

  /**
   * Broadcast to every subscribed client. Implements per-client backpressure:
   * if the in-memory buffer is full (slow client), the oldest message is
   * dropped first.
   */
  broadcast(msg: ServerMessage) {
    const channel = channelFor(msg);
    const payload = JSON.stringify(msg);

    for (const client of this.clients) {
      if (client.ws.readyState !== WebSocket.OPEN) continue;
      const interested = [...client.subscriptions].some((sub) =>
        channelMatches(sub, channel),
      );
      if (!interested) continue;

      if (client.buffer.length >= MAX_BUFFER) client.buffer.shift();
      client.buffer.push(msg);
      try {
        client.ws.send(payload);
      } catch (err) {
        console.warn("[realtime] send failed:", err);
      }
    }
  }

  private sendTo(client: Client, msg: ServerMessage) {
    if (client.ws.readyState !== WebSocket.OPEN) return;
    try {
      client.ws.send(JSON.stringify(msg));
    } catch (err) {
      console.warn("[realtime] direct send failed:", err);
    }
  }

  /** Number of currently-connected clients (for telemetry). */
  get clientCount(): number {
    return this.clients.size;
  }

  shutdown() {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    for (const client of this.clients) client.ws.close();
    this.wss.close();
  }
}
