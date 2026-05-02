#!/usr/bin/env node
/**
 * Pulse Terminal — MCP Server
 *
 * Exposes 19 read-only tools to Claude Desktop (or any MCP client) so the model can
 * fetch live crypto market + derivatives data without an API key on the server side.
 * Tools are grouped by domain; see `./tools/*.ts` for the implementations.
 *
 * Transport: stdio (the standard for Claude Desktop).
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { registerFundflowTools } from "./tools/fundflow.js";
import { registerDerivativesTools } from "./tools/derivatives.js";
import { registerOptionsTools } from "./tools/options.js";
import { registerDualAssetsTools } from "./tools/dual-assets.js";
import { registerIntelligenceTools } from "./tools/intelligence.js";
import { registerMarketsTools } from "./tools/markets.js";

const server = new McpServer(
  {
    name: "pulse-terminal",
    version: "0.1.0",
  },
  {
    capabilities: { tools: {} },
    instructions: [
      "Use these tools to fetch live crypto market + derivatives data.",
      "Start with get_fundflow_snapshot for broad questions — it bundles overview, stablecoins, etf, futures, dex, and tvl in one call.",
      "Use single-purpose tools (e.g. get_funding_summary) for narrow questions to save tokens.",
      "All data is real-time. Sources: CoinGecko, DefiLlama, Binance/Bybit/OKX, alternative.me, Farside (ETF flows).",
    ].join(" "),
  },
);

registerFundflowTools(server);
registerDerivativesTools(server);
registerOptionsTools(server);
registerDualAssetsTools(server);
registerIntelligenceTools(server);
registerMarketsTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

// Anything written to stdout corrupts the JSON-RPC stream — keep diagnostics on stderr.
process.stderr.write("[pulse-mcp] connected via stdio\n");
