# Pulse Terminal · Handoff (2026-04-28)

> **Incoming Claude**: read this first. The user is switching from another Claude session that lacked design skills. They want a full UX/UI redesign. Use `frontend-design` skill aggressively.

---

## 🎯 Active user request

**Full UX/UI redesign.** Previous attempt (multi-pane wrap) was rejected as superficial — wrapping existing components in resize handles ≠ redesign. User wants:

1. **Real visual identity** built from references, not generic AI aesthetics
2. **Components redesigned in service of that identity** — not just relayout
3. **Pro trader feel** — dense, alive, serious

User direction (loose): pro multi-pane (TradingView Pro vibe) but the `frontend-design` skill should drive specifics — references, palette, type system, mood.

**Hard constraint:** keep functionality intact. The deploy at https://cryptopulse.buzz works perfectly today — don't break the data layer / API routes / WS / MCP. Only the visual + structural front-end changes.

---

## 📦 What this product is

**Pulse Terminal** — personal crypto macro intelligence dashboard for one user (project owner). Replaces 4 prior projects (archived under `_legacy/`).

### Core value prop
- Real-time crypto market data (CoinGecko, DefiLlama, Binance/Bybit/OKX, Yahoo)
- Live derivatives (funding rates, OI) via native exchange WS streams
- Cross-source anomaly detection (`scanAnomalies()`) — runs every 15 min, persists to JSONL
- Backtest hit-rate per anomaly pattern (vs Binance hourly klines)
- Read-only Binance portfolio sync ($25k+ for this user, with LD-prefix Earn handling)
- Macro overlay (DXY, SPX, Gold)
- **MCP-first AI integration** — user asks Claude Desktop, MCP server queries local hub, ~70ms latency. No `/api/analyze` (Anthropic SDK removed).

### Audience
**One user**, personal use, MCP-first via Claude Pro/Max subscription. Not multi-tenant. No public auth. Hard data lockdown via firewall + Tailscale.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│ Hetzner CX22 · Singapore · 2GB RAM + 2GB swap · Ubuntu 24.04   │
│ Public IP: 5.223.65.230 · Tailscale IP: 100.90.142.81          │
│                                                                 │
│ Docker (proxy-net 172.20.0.0/16):                              │
│   • proxy-npm-1   :80/:443/:81  Nginx Proxy Manager + LE certs │
│   • aisa-flash, x-mcp, umami, spread-dashboard (other apps)    │
│                                                                 │
│ pm2 (host network):                                             │
│   • pulse-web      :3000  Next.js 16 (production build)        │
│   • pulse-realtime :8080 (WS) + :8081 (HTTP cache)             │
│   • pulse-alerts          cron worker (15 min interval)        │
│   • wealthboard, aisa-test (user's other apps)                 │
└─────────────────────────────────────────────────────────────────┘

External access:
  Internet → 80/443 → NPM → cryptopulse.buzz/   → 172.20.0.1:3000 (web)
                                          /ws    → 172.20.0.1:8080 (WS)
  Laptop  → Tailscale → 100.90.142.81:8081      → hub HTTP (MCP)
  SSH     → 5.223.65.230:22 (key auth only)

Firewall (ufw):
  22, 80, 443, 8000 (uvicorn legacy)        → public
  3000, 3002, 3003                          → from 172.20.0.0/16 only (NPM)
  3001                                      → public (legacy, not Pulse)
  8080, 8081                                → blocked from public
  ALL                                       → allowed on tailscale0
```

### Monorepo (`pnpm` + `turbo`, root: this directory)

```
apps/
├── web/        Next.js 16 · 6 tabs · 12 API routes · uses --webpack (turbopack panics on the historical Thai path; project still lives there)
├── realtime/   WS server + HTTP cache + native streams (binance/bybit/okx)
├── alerts/     cron · scanAnomalies → JSONL → optional Discord/Slack webhook
└── mcp/        MCP server (.mjs ESM bundle, esbuild-bundled, 144KB .dxt)

packages/
├── ui/         Tokens + components (Card, MetricCard, Pill, HeroTitle, NavBar, Loader, ThreeBackground, Panel, StatBlock, WsRow, …)
├── sources/    DUAL ENTRY:
│               · "@pulse/sources"        — browser-safe (types, format, helpers)
│               · "@pulse/sources/server" — Node-only (fetchers, signed APIs, scrapers)
│               (this split was Phase D — eliminated dynImport hacks; do NOT regress this)
└── charts/     Sparkline (SVG) + Candlestick (LWC v4.2 — DO NOT upgrade) + FlowAreaChart/FlowBarChart/FlowChart/DepthChart + IVSmile/GreeksHeatmap/OIByStrike

(`packages/i18n/` was removed 2026-04-30 — product is English-only.)
```

### Apps details

**apps/web** routes:
- `/` Overview (Pane-wrapped — was MetricStrip + MacroOverlay + AlertsFeed + PortfolioPanel stack)
- `/markets` (Pane-wrapped — MarketsTable + CandlestickPanel split)
- `/fundflow` (still vertical) — Dashboard with stablecoin/ETF/derivatives/TVL/DEX panels
- `/derivatives` — FundingHeatmap + live WS stream
- `/backtest` — hit-rate table + lookahead picker (4h/24h/72h/7d)
- `/settings` — refresh interval, mute notifications, watchlist, locale
- `/design` — UI showcase (private, not in nav)
- `/api/*` — 12 routes: flows/{overview,stablecoins,etf,futures,dex,tvl}, snapshot, markets, klines, portfolio, macro, ticker, funding, health, backtest, alerts/{scan,recent}, analyze (REMOVED in Phase A)

---

## ✅ What works (don't break)

| Layer | Status |
|-------|--------|
| Domain + HTTPS | ✅ https://cryptopulse.buzz, www.cryptopulse.buzz, both with LE cert |
| HTTP→HTTPS redirect | ✅ 301 |
| WS path routing | ✅ wss://cryptopulse.buzz/ws → :8080 (NPM custom location block) |
| Hub HTTP cache | ✅ port 8081, 70ms via Tailscale, sub-millisecond from local |
| Native exchange WS | ✅ Binance + Bybit + OKX (env: PULSE_NATIVE_STREAMS) |
| Anomaly scanner | ✅ shared `scanAnomalies()` in `@pulse/sources/server`, used by MCP + alerts + web |
| Alerts cron + JSONL | ✅ apps/alerts running, ~96 scans/day (15min interval) |
| Backtest math | ✅ reads JSONL, joins Binance 1h klines, computes hit-rate + avg move per pattern |
| Binance portfolio | ✅ read-only key, IP-whitelisted, LD prefix patch handles Earn assets |
| Tailscale tunnel | ✅ `pulse-hetzner-sg` host, laptop ↔ server stable |
| MCP via Claude Desktop | ✅ 10 tools, .mjs bundle, queries `http://100.90.142.81:8081` (configured per-install) |
| pm2 24/7 | ✅ all 3 services online, pm2 save persisted |
| Vitest | ✅ 19/19 passing in `packages/sources` |
| Toast notifications | ✅ AlertWatcher polls `/api/alerts/recent` every 60s, fires on new med/high |
| MCPQuickAsk button | ✅ on Overview, AlertsFeed, Backtest — copies markdown brief to clipboard |
| Watchlist (⭐) | ✅ click in Markets table, sorts to top, persisted in localStorage |

---

## 🚫 What's known-brittle / known-shortcut

| Issue | Why | Fix priority |
|-------|-----|--------------|
| **Hero "PULSE COMMAND" 132px** | Original Pulse Command HTML mood, NOT redesigned for terminal use | HIGH — central to redesign |
| **Layout is vertical scroll on most tabs** | Phase 1 added panes only on Overview + Markets, others stacked | HIGH — central to redesign |
| **Components are "card + table + pill" generic** | AI default aesthetics, not designed for this product | HIGH — central to redesign |
| **Three.js bg currently disabled outside `/` and `/design`** | Phase 1 decision · GPU saver · re-evaluate per redesign | discretionary |
| **Turbopack doesn't support Thai paths in our project root** | Path encoding bug · workaround: `next dev --webpack` + `next build --webpack` | LOW — known, not blocking |
| **Node 24 + Windows + pulse-status libuv assertion** | Cosmetic, exits non-zero after printing data | LOW — informational |
| **NPM admin password was leaked in chat earlier (`Firsty19`)** | User pasted in chat once · port 81 is localhost-only so impact bounded · should be rotated | MEDIUM — user homework |
| **Binance API keys: rotated once already** (after first chat leak) — current ones used since 2026-04-28 ~22:30 UTC+7 | working but treat as expiring · rotate every 90d | calendar reminder |
| **`/derivatives` `/api/funding` returns 1,221 rates** | All linear pairs from 3 exchanges · heatmap shows top 25 by `|avg|` only | acceptable |
| **No tests outside `packages/sources`** | Vitest config exists only there | low priority for personal use |

---

## 🔐 Secrets / env reference

| File | Where | Contains |
|------|-------|----------|
| `~/pulse-terminal/.env.local` (server, chmod 600) | server | `BINANCE_API_KEY`, `BINANCE_API_SECRET`, `NEXT_PUBLIC_WS_URL=wss://cryptopulse.buzz/ws`, `PULSE_HUB_URL=http://127.0.0.1:8081`, `WS_PORT=8080`, `HUB_HTTP_PORT=8081`, `PULSE_NATIVE_STREAMS=binance,bybit,okx`, `ALERT_*` vars |
| `apps/web/.env.local` (server) | symlink → root `.env.local` (Next.js auto-loads from app dir at build time) |
| `apps/mcp/.env` (laptop) | local | `PULSE_HUB_URL=http://100.90.142.81:8081` (Tailscale IP) — baked into .dxt at user_config time |
| `~/.ssh/hetzner_ed25519_win` (laptop) | local | SSH private key for `ssh hetzner` alias |
| `~/.ssh/config` (laptop) | local | `Host hetzner` mapped to deploy@5.223.65.230 |

**Coinglass + ALERT_WEBHOOK_URL** are blank — opt-in.

---

## 🛠️ Daily ops

```bash
# SSH in
ssh hetzner

# pm2
pm2 list                        # status
pm2 logs pulse-web --lines 50  # tail
pm2 restart pulse-web --update-env
pm2 save                       # persist after manual changes

# Health
pnpm pulse:status              # color status + body health
curl http://localhost:3000/api/health

# Deploy update from laptop
cd "c:/Users/Firsty/OneDrive/เอกสาร/เดสก์ท็อป/Terminal"
tar -czf /tmp/pulse.tar.gz \
  --exclude=node_modules --exclude=.next --exclude=_legacy \
  --exclude=.pm2 --exclude=logs --exclude=.git --exclude=dist \
  --exclude='*.dxt' --exclude=.env.local .
scp -i ~/.ssh/hetzner_ed25519_win /tmp/pulse.tar.gz deploy@5.223.65.230:~/
ssh hetzner "cd ~ && tar xzf pulse.tar.gz -C pulse-terminal && rm pulse.tar.gz && cd pulse-terminal && pnpm install && pnpm pulse:build && pm2 restart all --update-env"
```

---

## 🎨 Design context for the redesign

### What user said directly
> "ฉันยังไม่ค่อยชอบเท่าไหร่"  → not happy with current
> "ฉันต้องการที่จะรื้อใหม่ทั้งหมด" → wants complete rebuild
> "พอใจกับ pro multi-pane TradingView Pro" (chose option C from the menu I gave them, but rejected my superficial implementation)

### What the previous Claude (me) failed at
- Wrapped existing components in `<Pane>` / split bars **without redesigning the components themselves**
- Result: looked nearly identical to before, just with smaller margins and resize handles
- The user's frustration is: **structural change ≠ visual redesign**

### What this needs
- **Real visual identity work** — typography pairings, palette refinement, layered surface depth, micro-interactions
- **Information architecture rethink per tab** — what's the primary glanceable signal on Overview? Markets? Derivatives? Hint: Overview should make portfolio + market state graspable in 3 seconds
- **Custom dense components** — not generic Card/MetricCard. Trading-specific: ticker rows, sparkbars, heat strips, depth bars, signal pills with category icons
- **Distinctive aesthetic** that signals "this is a serious tool" — current purple/cyan glassmorphism reads "fancy demo" not "trader uses daily"

### Tools available
**Use `frontend-design` skill aggressively.** Description: *"Generates creative, polished code and UI design that avoids generic AI aesthetics."* — directly addresses the user's complaint. The previous Claude session didn't use it.

Other relevant skills:
- `simplify` — review changed code post-redesign for reuse/quality
- `code-review-refactor-agent` — second pass before merge
- `editorial-voice-enforcer` — if any copy needs voice tightening

### Reference candidates (user hasn't picked yet — ask before assuming)
- TradingView Pro
- Bloomberg Terminal
- Linear (linear.app)
- Vercel dashboard
- Bookmap
- Polymarket
- Phantom wallet
- Tensor.trade

### Mood candidates
"dark · institutional · alive" / "neon · cyberpunk · dense" / "minimalist · academic · trustworthy" / "sleek · futuristic"

### Hard "do NOT"s
- Don't add a global `_app.css` reset that conflicts with Tailwind
- Don't bring in heavy UI libraries (shadcn, MUI, Mantine) — keep it custom + lean. The product currently has only `recharts` + `lightweight-charts` for vendor UI deps
- Don't remove `@pulse/sources/server` split — it eliminated webpack hacks; regressing means turbopack breaks
- Don't add `@anthropic-ai/sdk` back — Phase A explicitly removed it (MCP-first decision per `docs/ADR-001-mcp-first.md`)
- Don't redirect the user to Claude API — they have no Anthropic budget
- Don't hardcode the Tailscale IP (`100.90.142.81`) anywhere except local laptop's `apps/mcp/.env` — it's user-installed via .dxt user_config

### Current branding tokens (in `packages/ui/src/tokens.ts`)
```
bg0:    #04050a   bg2: #0d111d   line: rgba(255,255,255,0.06)
accent: #7c5cff   accent2: #22d3ee
green:  #34d399   red: #f87171   gold: #fbbf24   btc: #f7931a   eth: #627eea
fonts:  Space Grotesk · Inter · JetBrains Mono
```
Treat these as **starting point**, not gospel. Redesign may want a new palette.

---

## 🗺️ Recommended redesign approach

1. **Read this whole file + AGENTS.md + docs/ADR-001-mcp-first.md** (full context)
2. **Run `pnpm pulse:status`** on server to confirm everything still healthy before changing
3. **Open https://cryptopulse.buzz** in a browser to see current state
4. **Ask user 3 questions before designing:**
   - Reference apps you genuinely admire (2-3 specific ones, with URLs or screenshots)
   - Mood (3 keywords)
   - Tab priority — Overview most-used or Derivatives or Markets?
5. **Invoke `frontend-design` skill** with answers
6. **Build one tab end-to-end first** (recommend Overview — most visited, sets the language)
7. **Get user feedback** before doing the other 5 tabs
8. **Push via the deploy flow above** — every change goes through tar+scp+rebuild+restart cycle

---

## 🚧 Future development (after redesign — user's "next" items)

These are punted, listed in `AGENTS.md` Phase 4:
1. Mobile push notifications (replace webhook with Claude Code mobile push)
2. Deribit options (OI / IV term structure)
3. On-chain layer (Etherscan, exchange wallet flows)
4. Multi-portfolio (Bybit + OKX read-only alongside Binance)
5. LLM-graded backtest (Claude rates pattern strength on historical findings)

These are explicit non-priorities until UI redesign settles.

---

## ✅ Phase 5A — DONE (2026-04-28/29)

The 3 prior reference projects (`Bybit Api/`, `Option Scan/`, `option-dashboard/`) have been
fully ported into the monorepo and the source folders deleted. Ports landed at:

| Original | Now lives at |
|---|---|
| `Bybit Api/tracker.py` + `analyzer.py` + `models.py` | `packages/sources/src/dual-assets/` (TS + better-sqlite3) |
| `Bybit Api` cron (Telegram bot) | `apps/alerts/src/dual-assets-tick.ts` + `dual-assets-rollup.ts` (Discord webhook) |
| `option-dashboard/src/api/*` | `packages/sources/src/options/{deribit,binance,bybit,okx,aggregator}.ts` |
| `option-dashboard` UI (Vite/React/Zustand) | `apps/web/app/options/page.tsx` (Bloomberg shell) |
| `Option Scan/app.py` | not yet ported (skipped — Streamlit dashboard, low priority) |

**MCP tools added during Phase 5A:** `get_options_chain`, `get_iv_smile`, `get_options_arbitrage`, `get_dual_assets_apr`, `get_best_dual_assets_hour`, `get_dual_assets_daily_summary` (6 tools).

**Cleanup status:** reference project folders removed from disk. `option-dashboard/node_modules` retained (OneDrive lock); gitignored, harmless.

For current backlog, see [STATUS.md](./STATUS.md) — this HANDOFF section is preserved as historical context only.

---

## 📂 Key files for redesign work

| File | Purpose |
|------|---------|
| `apps/web/app/layout.tsx` | Root layout — html/body wrapper, fonts |
| `apps/web/app/globals.css` | Tailwind + base CSS |
| `apps/web/components/AppShell.tsx` | NavBar + LiveTickerBar + main layout switch |
| `apps/web/components/MetricStrip.tsx` | Overview hero metrics — **redesign target** |
| `apps/web/components/Dashboard.tsx` | Fundflow — **redesign target** |
| `apps/web/components/AlertsFeed.tsx` | Live anomaly feed — **redesign target** |
| `apps/web/components/MarketsTable.tsx` | Top 20 — **redesign target** |
| `apps/web/components/CandlestickPanel.tsx` | Chart wrapper — **redesign target** |
| `apps/web/components/MacroOverlay.tsx` | DXY/SPX/Gold — **redesign target** |
| `apps/web/components/PortfolioPanel.tsx` | Binance balance table — **redesign target** |
| `apps/web/components/FundingHeatmap.tsx` | Derivatives heatmap — recently added, OK structurally but visually generic |
| `apps/web/components/LiveTickerBar.tsx` | Sticky top ticker — recently added, light touch maybe needed |
| `apps/web/components/MCPQuickAsk.tsx` | "Ask Claude" button — keep behavior, restyle |
| `apps/web/components/pane/{Pane,SplitLayout}.tsx` | Pro-layout primitive (custom 130 LOC) — **rejected by user as superficial · either replace or rethink** |
| `packages/ui/src/*.tsx` | All shared UI primitives — **redesign target** |
| `packages/ui/src/tokens.ts` | Design tokens — **likely needs replacement** |

---

## 🎬 First action for incoming Claude

```
Hi — read HANDOFF.md first. Then ask me 3 questions about my visual taste
(reference apps, mood, tab priority) before designing anything.
Once aligned, invoke `frontend-design` skill and rebuild one tab fully.
```

That's the user's likely opener.

— end of handoff —
