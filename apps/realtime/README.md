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
# HTTP hub: http://127.0.0.1:8081
```

## Hub health

`GET /health` emits the v2 envelope with snapshot/funding/OI checks and the
APR block when the APR store reader is available. It intentionally omits the
`options` block: options adapters currently live in `@pulse/sources` as
on-demand upstream fetches, not a cheap Role 7 in-memory cache.
