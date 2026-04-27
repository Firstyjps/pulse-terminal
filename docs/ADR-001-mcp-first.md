# ADR-001: MCP-first architecture

**Status:** accepted · 2026-04-28
**Decision-makers:** project owner · orchestrator session

## Context

Initial design (Phase 1+2) shipped two AI surfaces in parallel:
1. `apps/web/app/api/analyze/route.ts` — direct Anthropic SDK call, streaming, costs per token
2. `apps/mcp/` — MCP server exposing tools to Claude Desktop, free under Pro/Max subscription

After Phase 2 we asked: which surface is primary? Answer hinges on:
- **Cost model:** project owner has Claude Pro/Max subscription, no Anthropic API budget
- **Use case:** personal tool, not multi-user SaaS
- **Latency:** MCP runs locally via stdio — no network hop for the auth/transport layer
- **UX:** Claude Desktop already has chat history, thinking-mode UI, file context

## Decision

**MCP is primary; the in-browser AI panel is removed.**

- Drop `apps/web/app/api/analyze/route.ts`
- Drop `apps/web/app/analyst/` route
- Drop `apps/web/components/AnalysisPanel.tsx`
- Drop `@anthropic-ai/sdk` from `apps/web/package.json`
- Drop `analyst` tab from `AppShell.tsx` `TABS`
- Keep `nav.analyst` in i18n dict (zero cost; trivial to revert if ever needed)

The web app becomes a **visualization-only** dashboard. AI analysis happens in Claude Desktop (or any other MCP client) calling tools from `apps/mcp/`.

## Consequences

### Positive
- **$0 marginal cost per analysis** — Pro/Max subscription covers it
- **Better UX** — full Claude chat history, thinking summaries, multimodal support
- **Smaller web bundle** — Anthropic SDK is ~250KB unminified
- **Smaller attack surface** — no need to protect `/api/analyze` from abuse + cost runaway
- **Simpler deployment** — web app no longer needs `ANTHROPIC_API_KEY` in any env

### Negative
- **No "analyze" button** in the dashboard UI — user must context-switch to Claude Desktop
- **No streaming UI** for analysis — only what Claude Desktop renders
- **Lock-in to Claude** — replacing with another LLM means re-implementing MCP client integration

### Neutral / observed
- The MCP server alone delivered ~80% of the user-perceived value from Phase 1+2; the in-browser panel was a "nice to demo, never used in flow" feature.

## Follow-ups (Phase 3)

To make MCP-first sing, latency must drop. Each tool call currently fetches external APIs sync (~2s/tool, ~30s/conversation). Solution: hot in-memory cache served by `apps/realtime` over localhost HTTP.

- **Phase B v0** — `apps/realtime` exposes HTTP cache on `:8081`, MCP queries localhost (target latency: ~5-20ms/tool)
- **Phase C** — pm2 supervises hub + alerts + web for 24/7 operation on the user's machine
- **Phase D** — split `@pulse/sources` into browser-safe (`./`) and server-only (`./server`) entry points, killing the dynImport hack debt accumulated in Phase 1+2

See [`AGENTS.md`](../AGENTS.md) §"Phase 3" for full sub-phase contracts.

## Reversal criteria

Re-add the in-browser AI panel only if:
1. User adopts ≥ 3 collaborators who don't have Claude subscriptions, OR
2. The MCP server can no longer match the latency target (>500ms/tool reliably)

Either way, restore from git history (`feat/role-6-analysis-panel` lineage) — don't re-port from `_legacy/`.
