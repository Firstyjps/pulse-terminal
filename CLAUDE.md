# Pulse Terminal — Claude Code Instructions

Crypto Macro Intelligence Terminal. Monorepo (pnpm + turbo) merging 4 prior projects into one product.

## Read first
- [AGENTS.md](./AGENTS.md) — work split, your role, owned files, public contracts
- [README.md](./README.md) — public overview

When a Claude Code session starts, the first thing it should do is **announce its role** (e.g. "Taking Role 2 — UI Agent") and then operate only within that role's owned directories.

## Stack
- pnpm workspace + turbo
- Next.js 16 + React 19 + TypeScript (`apps/web`)
- Node + ws + TypeScript (`apps/realtime`)
- MCP SDK (`apps/mcp`)
- Cron worker for AI alerts (`apps/alerts`)
- Tailwind + custom design tokens (`packages/ui`)
- Lightweight Charts v4.2 (`packages/charts`) — DO NOT upgrade to v5
- Tauri 2.x desktop wrapper (`src-tauri/`) — optional, web app works standalone without it

## Run
```bash
pnpm install
pnpm dev          # boots web + realtime together via turbo
```

## Conventions
- Internal packages namespaced `@pulse/*`
- All API calls go through `@pulse/sources` — never `fetch()` in components or apps directly
- All user-facing labels are English only — the `@pulse/i18n` package was removed 2026-04-30
- Design tokens come from `@pulse/ui/tokens` — never hard-code colors, fonts, or shadows
- Use `clsx` for conditional classes
- Strict TypeScript everywhere

## Visual identity
Purple/cyan glassmorphism (Pulse Command aesthetic).
- Background: `#04050a`
- Accents: `#7c5cff` (purple) + `#22d3ee` (cyan)
- Fonts: Space Grotesk (display), Inter (body), JetBrains Mono (numbers)

## Do NOT
- Touch files outside your assigned role's directory (see AGENTS.md)
- Hardcode colors, fonts, or labels
- Reintroduce bilingual / Thai strings — product is English-only as of 2026-04-30
- Upgrade Lightweight Charts past v4.2 (v5 removed `addCandlestickSeries` / `addHistogramSeries`)
- Add new top-level dependencies without coordinating — prefer workspace packages
- Fetch data outside `packages/sources`

## Reference projects (read-only)
Sit beside this monorepo:
- `Crypto-Fundflow-Analyzer/`
- `CryptoTerminal/`
- `Funding_Oi/`
- `Pulse Command/`

Port code per the migration map in AGENTS.md, then delete each source folder when fully ported.
