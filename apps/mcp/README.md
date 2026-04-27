# @pulse/mcp

MCP server exposing Pulse Terminal data + analysis as tools for Claude Desktop. Owned by **Role 8 (MCP Agent)** in [../../AGENTS.md](../../AGENTS.md).

## Tools
- `get_market_overview()`
- `get_funding_summary({ exchange? })`
- `get_etf_flows({ days? })`
- `get_tvl_breakdown({ chain? })`
- `get_dex_leaderboard({ days? })`
- `detect_anomalies()`
- `get_oi_snapshot()`

## Build & pack
```bash
pnpm --filter @pulse/mcp build
pnpm --filter @pulse/mcp pack-dxt
# install dist/pulse-terminal.dxt in Claude Desktop
```
