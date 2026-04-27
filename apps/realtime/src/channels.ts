import type { ServerMessage } from "./contracts.js";

/**
 * Channel naming:
 *   funding:<exchange>:<symbol>     — funding rate updates
 *   oi:<exchange>:<symbol>          — open interest updates
 *   flow.alert:<category>           — flow anomaly alerts
 *   heartbeat                       — server heartbeat (always sent)
 *
 * Wildcard: a subscription of "funding:*" matches every funding channel,
 * "*" matches everything.
 */
export function channelFor(msg: ServerMessage): string {
  switch (msg.type) {
    case "funding":
      return `funding:${msg.exchange}:${msg.symbol}`;
    case "oi":
      return `oi:${msg.exchange}:${msg.symbol}`;
    case "flow.alert":
      return `flow.alert:${msg.category}`;
    case "heartbeat":
      return "heartbeat";
    case "ack":
      return "ack";
  }
}

export function channelMatches(subscription: string, channel: string): boolean {
  if (subscription === "*" || subscription === channel) return true;
  // Allow segment-prefix wildcards: "funding:*", "funding:binance:*"
  if (subscription.endsWith(":*")) {
    const prefix = subscription.slice(0, -1); // keep colon
    return channel.startsWith(prefix);
  }
  return false;
}
