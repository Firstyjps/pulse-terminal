# Pulse Terminal

> Crypto Macro Intelligence Terminal — multi-source flow analysis, derivatives intel, AI assistant.

Monorepo consolidating four prior projects into one product:

| Source                          | Contributes                              |
|---------------------------------|------------------------------------------|
| **Pulse Command**               | Visual identity (purple/cyan glassmorphism) |
| **Crypto-Fundflow-Analyzer**    | Next.js base, AI panel, MCP server       |
| **CryptoTerminal**              | Bloomberg-style data discipline, fallback chains, bilingual UI |
| **Funding_Oi**                  | Realtime WebSocket server (funding/OI)   |

## Quick start

```bash
pnpm install
pnpm dev
```

- Web: http://localhost:3000
- Realtime WS: ws://localhost:8080

## Structure

```
apps/
├── web/        Next.js 16 dashboard (5 tabs)
├── realtime/   WebSocket server — funding rates, open interest, alerts
└── mcp/        MCP server for Claude Desktop integration

packages/
├── ui/         Design system + tokens (purple/cyan)
├── sources/    Data adapters — every external API call lives here
├── charts/     Lightweight Charts wrappers
└── i18n/       Thai + English bilingual labels
```

## How to contribute

Work is split into 8 roles so multiple Claude Code sessions can run in parallel without colliding. Pick a role from [AGENTS.md](./AGENTS.md), open it, and you'll see exactly what files to touch and what contracts to honor.

## Reference projects

The four originals have been ported and archived under [`_legacy/`](_legacy/):
- `_legacy/Crypto-Fundflow-Analyzer/` (777M) — superseded by `apps/web` + `apps/mcp` + `packages/sources`
- `_legacy/Funding_Oi/` (89M) — superseded by `apps/realtime` + `packages/sources/funding`
- `_legacy/CryptoTerminal/` (1.5M) — superseded by `apps/web/markets` + `packages/charts`
- `_legacy/Pulse Command/` (76K) — superseded by `packages/ui` (visual identity)

`_legacy/` is gitignored. Delete it whenever you're confident nothing else needs to be salvaged.
