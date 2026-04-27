// WebSocket message contract — single source of truth.
// Both server (apps/realtime) and client (apps/web/lib/ws-client.ts) import these types.

export interface FundingMessage {
  type: "funding";
  exchange: string;
  symbol: string;
  rate: number;        // raw, e.g. 0.0001
  ratePercent: number; // rate * 100
  ts: number;
}

export interface OIMessage {
  type: "oi";
  exchange: string;
  symbol: string;
  oi: number;
  oiUsd: number;
  ts: number;
}

export type AlertSeverity = "low" | "med" | "high";

export interface FlowAlertMessage {
  type: "flow.alert";
  category: string;
  severity: AlertSeverity;
  payload: unknown;
  ts: number;
}

export interface HeartbeatMessage {
  type: "heartbeat";
  ts: number;
}

export interface SubscribeMessage {
  type: "subscribe";
  channels: string[]; // e.g. ["funding:binance:BTCUSDT", "oi:bybit:ETHUSDT", "*"]
}

export interface UnsubscribeMessage {
  type: "unsubscribe";
  channels: string[];
}

export interface AckMessage {
  type: "ack";
  channels: string[]; // current subscription set echoed back
  ts: number;
}

export type ServerMessage =
  | FundingMessage
  | OIMessage
  | FlowAlertMessage
  | HeartbeatMessage
  | AckMessage;

export type ClientMessage = SubscribeMessage | UnsubscribeMessage;
