# @pulse/web

Next.js 16 dashboard — the user-facing terminal. Owned by **Role 6 (Web Agent)** in [../../AGENTS.md](../../AGENTS.md).

## Routes
1. **Overview** — Pulse Command hero + macro pulses
2. **Markets** — Top-N coin table + candlestick
3. **Fundflow** — stablecoin / ETF / TVL / DEX panels
4. **Intel** — MCP-first signal surface
5. **History** — snapshot history and export controls
6. **Morning** — live morning operator dashboard
7. **Derivatives** — funding + OI heatmap (live via WS)
8. **Options** — multi-exchange options chain and IV views
9. **Backtest** — alert hit-rate replay and grading
10. **Dual Assets** — Bybit APR tracker/operator dashboard
11. **Settings** — local notification/test controls

## Run
```bash
pnpm --filter @pulse/web dev
```
