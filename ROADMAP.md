# Pulse Terminal — Roadmap

**Owner:** Kornkasem (Firstyjps) · **Updated:** 2026-05-01

## North Star

Personal crypto/macro intelligence terminal first → eventually power signal service / fund infrastructure. **Long-term burn, no rush — build for stability before automation.**

Single web dashboard that summarizes everything I need to make trading decisions, in priority order, with eventual semi-auto and full-auto execution.

## Decision register (locked 2026-05-01)

| Decision | Choice | Rationale |
|---|---|---|
| Portfolio depth | (c) USD + per-asset + 24h/7d/30d P&L + DeFi LP positions in single dashboard | User has live LP positions across Meteora/Pendle/Orca/Aave — must aggregate |
| Tax/cost basis | Deferred to Action 2 phase | Not blocking dashboard MVP |
| Digest format | (b) Conversational paragraph + (d) mobile push at 07:00 Bangkok | Quant prefers nuance over bullet rigidity; mobile push leverages Remote Control |
| Audio TTS | Deferred to Action 3 | Nice-to-have, not core |
| Macro regime | (d) Hybrid — rules-based base + LLM override on edge cases | Interpretability + flexibility |
| Execution risk | (B) semi-auto with manual approval per trade → graduate to (C) full-auto only after 90+ days of stable paper-trade results | Stability first |

## Action 1 — Morning Brief Dashboard (target: 6 weeks)

**Deliverable:** Open `pulse.local` in the morning → 30 seconds to know what to focus on today.

### Week 1-2: Data foundation
- [ ] Multi-account portfolio aggregator covering all 5 CEX (Binance, Bybit, OKX, Bitkub, Gate.io)
- [ ] DeFi position sources: Meteora DLMM, Pendle PT, Ethena sUSDe, Orca, Aave
- [ ] Unified portfolio API: `GET /api/portfolio/aggregate` returns `{ totalUsd, byVenue, byAsset, lp[], pnl: { 24h, 7d, 30d } }`

### Week 2-3: Intelligence layer
- [ ] Macro regime indicator service (rules v1) — outputs `Risk-On | Risk-Off | Range`
- [ ] Overnight digest generator — runs once at 06:30 Bangkok, writes `apps/alerts/data/digest-YYYY-MM-DD.md`
- [ ] Signal feed re-ranker — orders alerts by composite score (severity × novelty × user-relevance)

### Week 3-4: Dashboard UI
- [ ] New route `apps/web/app/morning/page.tsx` — single-screen brief
- [ ] Question-driven layout (not feature-driven): Portfolio · Overnight · Regime · Signals · Action items
- [ ] Density-first design (Bloomberg-grade info compression)

### Week 4-6: Notifications + polish
- [ ] Mobile push at 07:00 via Remote Control bridge — sends digest paragraph + 1-tap link to dashboard
- [ ] Discord/Slack webhook fallback (already wired in alerts)
- [ ] Dark mode default · keyboard shortcut to focus (`g m` jumps to morning brief)

### Acceptance criteria
- Open dashboard fresh → all-up portfolio number visible in <2s
- Digest paragraph reads like an analyst wrote it (not a bullet dump)
- One macro regime chip + reason string ("Risk-Off — funding crushed across BTC/ETH/SOL, dominance rising")
- Signal feed shows top 5 signals with reasoning

## Action 2 — Strategy Engine (target: 8-12 weeks after Action 1)

**Deliverable:** Test trade ideas before risking real money. Pipeline:

```
Signal → Strategy rule → Backtest on alerts.jsonl history
                       → Paper trade live (track P&L 30 days)
                       → Promote to semi-auto (1-click execute)
                       → Eventually full-auto with circuit breaker
```

Foundation already in place: `apps/alerts/data/alerts.jsonl`, `packages/sources/replay.ts`, `grade-signal.ts`.

Missing: backtest harness, paper trade simulator, strategy DSL, review UI.

## Action 3 — Differentiation moat (12+ weeks)

For future productize. Pick 1-2:
- Voice-first via MCP + Claude Desktop
- Adaptive layout based on market regime + time of day
- Cross-domain alpha (on-chain × funding × macro × social)

## Things explicitly NOT doing

- ❌ Public auth / paywall / Stripe — personal tool first
- ❌ Trading orders direct from dashboard — wait until Strategy Engine paper-trade phase passes
- ❌ Mobile React Native app — web + Tauri desktop covers it
- ❌ Marketing landing page — no product yet
- ❌ Open source release — keep private during build phase
