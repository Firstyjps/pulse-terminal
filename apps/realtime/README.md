# @pulse/realtime

Node WebSocket server pushing live funding rates, open interest, and flow alerts. Owned by **Role 7 (Realtime Agent)** in [../../AGENTS.md](../../AGENTS.md).

## Message contract
```ts
{ type: "funding", exchange, symbol, rate, ts }
{ type: "oi",      exchange, symbol, oi,   ts }
{ type: "flow.alert", category, severity, payload, ts }
{ type: "heartbeat", ts }
```

## Run
```bash
pnpm --filter @pulse/realtime dev
# WS: ws://localhost:8080
```
