# ADR-002: Hybrid native WS streams + REST polling

**Status:** accepted · 2026-04-28
**Decision-makers:** project owner · Cursor session (implementation) · orchestrator session (review)

## Context

Realtime data needs three things from each exchange (Binance, Bybit, OKX):
1. Funding rates (updated every 8 hours, but we want push the moment they change)
2. Open interest (changes continuously)
3. Mark prices (changes continuously)

Three implementation strategies:

| Strategy | Latency | Complexity | Cost | Failure mode |
|----------|---------|------------|------|--------------|
| REST poll every 60s | 0-60s | Low | Free | API rate limits |
| Native WebSocket subscribe | sub-second | Medium-high (per-venue protocol) | Free | Disconnect = silent stale data |
| Paid aggregator (Coinglass, Kiyotaka) | sub-second | Low | $$ | Vendor lock-in |

Each has a fail mode the others mitigate.

## Decision

**Use both native WS streams (primary) and REST polling (fallback) — paid aggregators only when free APIs fall short.**

- Native WS streams toggleable via `PULSE_NATIVE_STREAMS=binance,bybit,okx` (CSV)
- REST poller (`apps/realtime/src/poller.ts`) keeps running regardless — refresh interval 60s
- If WS disconnects → poller's data still flows (degraded but not dark)
- If poller hits rate limit → WS data still flows (still real-time for hot symbols)

Per-venue stream files:
- `apps/realtime/src/binance-stream.ts`
- `apps/realtime/src/bybit-stream.ts`
- `apps/realtime/src/okx-stream.ts`

Each handles its own subscribe protocol + ping/pong cadence + reconnect with exponential backoff.

## Consequences

### Positive
- **Sub-second updates** for tracked symbols (BTCUSDT, ETHUSDT funding/OI)
- **Resilient by design** — neither path is single-point-of-failure
- **Graceful degradation** — WS down → fall to poll · poll rate-limited → fall to WS
- **Easy to disable** for debugging (`PULSE_NATIVE_STREAMS=""` → REST only)

### Negative
- **Two code paths** for same data — small bug risk (e.g. OKX symbol normalisation `BTCUSDT` ↔ `BTC-USDT-SWAP`)
- **Higher complexity** to onboard new exchanges (each adds ~150 LOC of WS protocol)

### Neutral
- Hub HTTP cache (Phase B v0) deduplicates between paths — consumers see one snapshot regardless of source

## Reversal criteria

Drop native WS streams (REST-only) if:
- Maintaining 3 venue protocols becomes > 2x time spent on actual features
- A free aggregator emerges that bundles all three with > 99% uptime

Drop REST polling (WS-only) if:
- All consumers hit `PULSE_HUB_URL` (none directly call adapters)
- WS uptime measurably exceeds 99.5% over 30 days

Until then, hybrid stays.
