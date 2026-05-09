# @pulse/mcp

MCP server exposing Pulse Terminal data + analysis as tools for Claude Desktop. Owned by **Role 8 (MCP Agent)** in [../../AGENTS.md](../../AGENTS.md).

## Tools (20)

### Data
- `get_market_overview()` — total mcap, BTC dom, F&G, DeFi TVL
- `get_stablecoin_flows()` — total supply, dominance, 30d trajectory
- `get_etf_flows({ symbol? })` — BTC/ETH spot ETF daily flows + cumulative
- `get_futures({ symbol? })` — Binance perp OI, funding, L/S, price
- `get_dex_leaderboard({ days? })` — DefiLlama DEX 24h/7d, top venues
- `get_tvl_breakdown({ chain? })` — DeFi TVL total + by chain
- `get_fundflow_snapshot({ format? })` — combined markdown brief

### Derivatives (cross-venue)
- `get_funding_summary({ exchange?, symbol? })` — Binance/Bybit/OKX/Deribit aggregate
- `get_oi_snapshot({ exchange?, symbol? })` — open interest across venues

### Options
- `get_options_chain({ asset?, expiry?, side?, limit? })` — aggregated Deribit/Binance/Bybit/OKX options chain
- `get_iv_smile({ asset?, expiry? })` — IV smile by strike for one expiry
- `get_options_arbitrage({ asset?, minSpreadPercent? })` — cross-venue bid/ask mispricing scan

### Dual Assets
- `get_dual_assets_settings()` — current Dual Assets settings and resolved SQLite path
- `get_dual_assets_apr({ limit?, coin_pair?, duration?, direction?, min_apr_pct? })` — recent Bybit Dual Assets APR snapshots
- `get_best_dual_assets_hour({ coin_pair?, target_price?, days?, duration?, direction?, include_correlation? })` — hourly APR analysis
- `get_dual_assets_daily_summary({ coin_pair?, target_price?, days?, duration?, direction? })` — daily APR rollups

### Analysis
- `detect_anomalies({ symbol? })` — cross-source pattern scan
- `grade_signal({ finding, market_context? })` — **Phase 4**. Returns rubric + output schema for grading a finding from `detect_anomalies`. Tool replies with `{ rubric, outputSchema, instructions }`; the model produces the final `{ confidence, reasoning, suggested_action, risk_flags }` JSON inline. Typical chain: `detect_anomalies` → pick a finding → `grade_signal {finding}`.

### Markets
- `get_order_book({ symbol?, limit? })` — Binance spot order book depth
- `get_whale_flow()` — on-chain whale transfers with exchange labels

## Build & pack
```bash
pnpm --filter @pulse/mcp build
pnpm --filter @pulse/mcp pack-dxt
# install apps/mcp/pulse-terminal.dxt in Claude Desktop
```

`pack-dxt` validates the `tsc` output, then writes the current bundled DXT entry to `dist/index.js` and includes the native `better-sqlite3` runtime needed by the Dual Assets tools.

## Smoke test (no Claude Desktop required)

```bash
# List all tools (expect 20)
node scripts/probe-mcp.mjs

# Call any single tool with JSON args
node scripts/probe-mcp.mjs get_funding_summary '{"exchange":"deribit","symbol":"BTCUSDT"}'
node scripts/probe-mcp.mjs grade_signal '{"finding":{"category":"etf","severity":"high","signal":"BTC ETF heavy 7d outflow","evidence":{"btc7dSumUSD":-3.5e8}}}'
```
