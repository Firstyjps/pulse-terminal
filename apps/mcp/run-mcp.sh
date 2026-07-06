#!/usr/bin/env bash
# Launch pulse MCP server (stdio) for Hermes — handles cwd + tsx TS runtime.
cd /home/deploy/pulse-terminal/apps/mcp || exit 1
LOADER=$(ls -d /home/deploy/pulse-terminal/node_modules/.pnpm/tsx@*/node_modules/tsx/dist/loader.mjs 2>/dev/null | head -1)
exec node --import "file://$LOADER" src/index.ts
