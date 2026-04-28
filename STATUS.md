# 📊 Pulse Terminal · Live Status Board

> Real-time coordination for the 3 parallel Claude sessions.
> **Read this at the start of every task. Update it the moment you finish or change direction.**
> Template lives in [SYNC.md](./SYNC.md) — this file is the live board.

---

## 🚦 Active sessions (confirmed 2026-04-28)

| # | Session | Lane | Owns |
|---|---|---|---|
| 1 | **Code (VSCode)** — me, this session | Data layer adapters + infra + deploy | `packages/sources/src/{options,dual-assets,portfolio}/`, `apps/mcp/`, `apps/alerts/`, API routes, server config |
| 2 | **Desktop (UI)** — Claude Desktop w/ frontend-design skill | UI redesign (currently Phosphor green; Bloomberg amber preview pending decision) | `packages/ui/**`, `apps/web/components/**`, `globals.css` |
| 3 | **Cursor (Phase 5A scaffolding)** — Claude Code in Cursor IDE | Shared scaffolding: formatters, fixtures, anomaly hooks, ADRs, hub /health spec | `packages/sources/src/{format,anomalies,snapshot,_helpers}.ts`, `packages/charts/src/__fixtures__/`, `packages/charts/src/smoke.test.tsx`, `docs/ADR-*.md`, `docs/HUB-HEALTH-V2.md`, `docs/QUICKSTART.md` |

---

## 🔒 Currently locked (do NOT touch)

- _Code_: `packages/sources/src/{options,dual-assets}/**` (Phase 5A live in prod, do not refactor)
- _Desktop_: `packages/ui/**`, `apps/web/app/globals.css`, all `apps/web/components/*` EXCEPT `apps/web/components/bloomberg/**` (Code's, awaiting cleanup), `apps/web/app/page.tsx` (Overview)
- _Cursor_: `packages/sources/src/{format,anomalies,snapshot,_helpers}.ts`, `packages/charts/src/**`, `apps/realtime/src/{hub-health,apr-reader}.{ts,test.ts}` + `vitest.config.ts` (Phase 5A scaffolding + hub v2)

## ✅ Free for anyone

- `apps/web/app/{markets,derivatives,backtest,fundflow,settings}/page.tsx` (Desktop will polish next per user's go-ahead)
- `apps/web/lib/**`
- `docs/**` (additive), `design-refs/**`
- Top-level configs (coordinate via STATUS log first)

## 🔗 Cross-session integration points (everyone's eyes here)

- `packages/sources/src/anomalies.ts` — Cursor extended to import from Code's `options/types.ts` (good, no conflict)
- `packages/sources/src/format.ts` — Cursor's formatters; Desktop's new Bloomberg components use `formatUSD` / `formatPercent` from `@pulse/sources` ✓
- `packages/sources/src/server.ts` — barrel; both Code + Cursor add exports here, coordinate before edit
- `apps/web/app/globals.css` — Desktop now owns the entire file (Bloomberg `:root` is default); Code's `[data-theme="bloomberg"]` block has been retired

---

## 📰 Activity log (newest at top)

### 2026-04-28 · Desktop session (latest)
- **[done]** Phosphor → Bloomberg amber pivot per `/design_handoff_cryptopulse/` complete

  **Tokens & globals**
  - [packages/ui/src/tokens.ts](packages/ui/src/tokens.ts) — handoff exact (#ffb000 amber · #19d27a/#ff4d5e signals · #44c8ff cyan · #ff5cf3 magenta · sharp 0 corners · mono everywhere). **All old export names preserved as aliases** (`accent`, `accent2`, `txt1..4`, `bg0..4`, `glows`, `radii`) so non-Overview tabs that import from `@pulse/ui` keep compiling untouched. `radii.*` collapsed to `"0"` so `Card`/`Pill` etc. naturally render flat.
  - [apps/web/app/globals.css](apps/web/app/globals.css) — Bloomberg at `:root` default. Removed the `[data-theme="bloomberg"]` block (was Code's POC) and Phosphor atmospheric washes. Added IBM Plex Sans + `body.sans` toggle, CRT scanline via `.crt::after`, base 11px JetBrains Mono. **Re-uses `phosphor-up/down` keyframe names** for tick flash (now amber/red, was green/red) so any `data-phosphor` consumer keeps working without rename.

  **New shell** (4-row terminal grid in [AppShell](apps/web/components/AppShell.tsx))
  ```
  22px  TerminalStatusBar  ◆ CRYPTOPULSE · VER · USR · DESK | FEED · UTC · DATE · SESS
  26px  TerminalTicker     scrolling top-18 from /api/markets, paused on hover
  1fr   [Nav 140 | Workspace = WsRows]   F1–F7 keyboard nav routes via Next router
  22px  TerminalBotBar     ● READY · CMD · PROFILE · LATENCY ··· F1 / F8 / ⌘K · LANG
  ```
  Files: [TerminalStatusBar](apps/web/components/TerminalStatusBar.tsx) · [TerminalTicker](apps/web/components/TerminalTicker.tsx) · [TerminalNav](apps/web/components/TerminalNav.tsx) · [TerminalBotBar](apps/web/components/TerminalBotBar.tsx)

  **New primitives** in `@pulse/ui`
  - [Panel](packages/ui/src/Panel.tsx) — replaces my Phosphor Panel; `▸ TITLE` 22px header + badge + actions slot
  - [StatBlock](packages/ui/src/StatBlock.tsx) — Market Pulse tile (label/value/delta/sub)
  - [WsRow / Workspace](packages/ui/src/WsRow.tsx) — 12-col grid container with `height` presets (`stats|chart|table|feed|auto`) per handoff Row 1–4

  **Existing primitives rebranded** (preserved public exports — no breaking changes for /markets etc.)
  - [SignalPill](packages/ui/src/SignalPill.tsx) — added `WHALE/LIQ/FLOW/OI/PUMP/NEWS` tones (handoff anomaly tags)
  - [Sparkbar](packages/ui/src/Sparkbar.tsx) — added `asLine` mode for handoff Sparkline polyline shape

  **New Overview consumers**
  - [MetricStrip](apps/web/components/MetricStrip.tsx) — 6 StatBlocks (rewrite)
  - [MoversTable](apps/web/components/MoversTable.tsx) — sticky header, sortable cols, sparkline cell, asset icon pill, search filter
  - [AssetInspector](apps/web/components/AssetInspector.tsx) — KV grid + 7d sparkline; lifted `activeId` state from MoversTable via page.tsx
  - [FearGreedGauge](apps/web/components/FearGreedGauge.tsx) — 5-segment half-arc + 7d mini-bars (handoff visual)
  - [FundingHeatmapMini](apps/web/components/FundingHeatmapMini.tsx) — compact 8 assets × 5 venues for Overview Row 4 (Code's full-grid `FundingHeatmap` untouched, still serves /derivatives)
  - [OverviewPriceChart](apps/web/components/OverviewPriceChart.tsx) — symbol picker + tf segmented control + Lightweight Charts via `/api/klines`

  **Refactored**
  - [AlertsFeed](apps/web/components/AlertsFeed.tsx) — maps our internal `AnomalyCategory` (etf/futures/funding/stablecoin/tvl/dex/options/bybit) → handoff display tags (WHALE/LIQ/FLOW/OI/PUMP/NEWS) for visual consistency. Data layer untouched.
  - [MacroOverlay](apps/web/components/MacroOverlay.tsx) — Section A sparkline rows + Section B BTC correlation bipolar bars
  - [AppShell](apps/web/components/AppShell.tsx) — full rewrite; LocaleProvider + ToastProvider + AlertWatcher kept, `crt` class on root for CRT overlay

  **Overview page** [apps/web/app/page.tsx](apps/web/app/page.tsx) — 4 ws-rows per handoff
  - Row 1 (h-stats, ≥96px): MARKET PULSE c-12
  - Row 2 (h-chart, 360px): PRICE CHART c-8 + FEAR & GREED c-4
  - Row 3 (h-table, 340px): TOP MOVERS c-8 + ASSET INSPECTOR c-4
  - Row 4 (h-feed, 320px): LIVE ANOMALY c-5 + MACRO c-4 + FUNDING c-3

  **What I deliberately did NOT touch** (per role boundary)
  - `packages/sources/**` (Code + Cursor lane)
  - `apps/mcp/**`, `apps/alerts/**`, all `apps/web/app/api/*` routes
  - `next.config.js`, `ecosystem.config.cjs`, `package.json` deps — **no new deps added**
  - Code's `apps/web/components/bloomberg/*` and `apps/web/app/bloomberg-preview/` — left intact for Code to clean up

- **[verified]** `pnpm --filter @pulse/web typecheck` clean · dev server hot-reloaded clean · all routes return 200 (`/`, `/markets`, `/derivatives`, `/backtest`, `/fundflow`, `/settings`, `/design`, `/bloomberg-preview` still loads via the default shell — `data-theme` no longer exists so it just looks like the rest of the app)

- **[📨 handoff for Code — 4 cleanup items, all in Code's lane]**

  1. **Delete the Bloomberg POC** (now redundant — my `Terminal*` shell + new primitives cover everything they did, wired to real data):
     ```bash
     rm -r apps/web/components/bloomberg
     rm -r apps/web/app/bloomberg-preview
     ```

  2. **Verify deploy on prod** — when you ship next, sanity-check at https://cryptopulse.buzz:
     - Top status bar: `◆ CRYPTOPULSE` amber pill on left, live UTC clock on right
     - Ticker tape scrolling continuously below (top-18 by mcap)
     - Left nav with F1–F7 (try `F2` keypress in the browser → should route to `/markets`)
     - Bottom bar: `● READY · CMD :overview · PROFILE MACRO·DEFAULT · LATENCY 14ms`
     - Overview Row 2 chart loads BTC candles from `/api/klines?symbol=BTCUSDT&interval=1h&limit=24`
     - Overview Row 4 funding heatmap shows real %s from `/api/funding`

  3. **Heads-up — endpoints Desktop now consumes from web layer that you may not have hit before:**
     - `/api/klines?symbol=…&interval=…&limit=…` — used by `OverviewPriceChart`
     - `/api/funding` — used by `FundingHeatmapMini` (compact view, just slices your existing payload)
     - `/api/macro` — used by `MacroOverlay` for sparkline + correlation derivation
     - `/api/markets` — used by both `TerminalTicker` and `MoversTable` (you already had this)

  4. **(Optional, no rush)** Old `apps/web/components/MarketHeatstrip.tsx` is still in the tree but no longer imported by `/page.tsx`. Safe for either of us to delete next pass.

- **[doing]** Awaiting user review of Overview before applying the language to `/markets`, `/derivatives`, `/fundflow`, `/backtest`, `/settings` (still on the old Phosphor-era components — they'll pick up the new tokens visually since I preserved alias names, but their layouts were designed for the old shell). User said go-ahead is conditional on Overview review.

### 2026-04-28 · Cursor session (cont. — 19:15)
- **[done 19:15]** Migrated [apps/realtime/src/apr-reader.ts](apps/realtime/src/apr-reader.ts) onto Code's `getStoreStats()` contract (option B):
  - Dropped dynamic `import("better-sqlite3")` + driver-load dance — `apr-reader.ts` is now ~50 lines, no SQLite touching at this layer (realtime no longer needs `better-sqlite3` as a direct dep)
  - New: `toAprBlock(stats)` adapter — `available → storeOk`, `pairs[] → pairs.length`, `lastWriteAgeMs → lastWriteMs`, `error?` passthrough
  - `preloadAprDriver()` kept as a documented no-op so `index.ts` doesn't break (safe to remove later)
  - New: [apps/realtime/src/apr-reader.test.ts](apps/realtime/src/apr-reader.test.ts) — 5 tests locking the StoreStats → AprBlock mapping (happy path · pairs collapse to count · null lastWrite · available:false → error · error-omit when absent)
- **[done 19:15]** Verified: `pnpm --filter @pulse/realtime typecheck` clean · `pnpm --filter @pulse/realtime test` **42/42 pass** (37 hub-health + 5 apr-reader)
- **[blocked]** Need Code to deploy: `pulse-realtime` restart on Hetzner. Expected after restart: `curl http://127.0.0.1:8081/health` → `apr.storeOk: true` (DB file already exists per `[done 19:55]` Code entry below). When BYBIT keys + cron are wired, `apr.lastWriteMs` should turn into a real number < 30min.

### 2026-04-28 · Cursor session
- **[done 18:05]** Hub `/health` v2 implemented per [docs/HUB-HEALTH-V2.md](docs/HUB-HEALTH-V2.md)
  - New: [apps/realtime/src/hub-health.ts](apps/realtime/src/hub-health.ts) — pure builder + status derivation, fully DI'd (cache + optional `apr` and `options` readers)
  - New: [apps/realtime/src/apr-reader.ts](apps/realtime/src/apr-reader.ts) — opens `apps/alerts/data/dual-assets.sqlite` readonly via dynamic import of `better-sqlite3`; graceful fallback when driver/file missing
  - New: [apps/realtime/src/hub-health.test.ts](apps/realtime/src/hub-health.test.ts) + [vitest.config.ts](apps/realtime/vitest.config.ts) — 37/37 passing, covers all 5 status buckets + integration matrix
  - Edited: [apps/realtime/src/http-server.ts](apps/realtime/src/http-server.ts) — `/health` route now calls `buildHealthV2(...)`; v1 inline body replaced
  - Edited: [apps/realtime/src/index.ts](apps/realtime/src/index.ts) — wires `createAprReader()` + `preloadAprDriver()` at boot
  - Edited: [apps/realtime/package.json](apps/realtime/package.json) — added `vitest` devDep + `test` script (lockfile touched, lockfile delta is just realtime+vitest entries)
  - Edited: [apps/realtime/tsconfig.json](apps/realtime/tsconfig.json) — exclude `*.test.ts` from `tsc --noEmit` build path
- **[done 18:05]** Verified: `pnpm --filter @pulse/realtime typecheck` clean, `pnpm --filter @pulse/realtime test` 37/37 pass
- **[blocked]** Need Code to deploy: `pulse-realtime` restart on Hetzner so prod `/health` emits `_version: 2`. Sanity: `curl http://127.0.0.1:8081/health` should show `_version:2 + apr` block (driver loads transitively via `@pulse/sources`'s `better-sqlite3`; if the dynamic import fails on the prod box, `apr.error: "better-sqlite3 not installed"` appears — that's a signal to add it as a direct dep of `apps/realtime`)
- **[doing]** Smoke tests for Code's adapters (optional 🥈) — deferred unless asked

### 2026-04-28 · Code session (latest — 20:50)
- **[done 20:50]** Full deploy of Desktop + Cursor work to prod:
  - **Cleanup**: deleted [apps/web/components/bloomberg/](apps/web/components/bloomberg/) + [apps/web/app/bloomberg-preview/](apps/web/app/bloomberg-preview/) on local + prod
  - **Synced Desktop's UI**: all new components (`Terminal*`, `MoversTable`, `AssetInspector`, `FearGreedGauge`, `FundingHeatmapMini`, `OverviewPriceChart`, refactored `AlertsFeed`/`MacroOverlay`/`AppShell`) + new primitives (`Panel`, `StatBlock`, `WsRow`) + `tokens.ts` rewrite + `globals.css` + `page.tsx` 4-row layout
  - **Synced Cursor's hub v2 + apr-reader**: realtime restarted; `/health` now `_version: 2 ✓`, `apr.storeOk: true ✓` — Cursor's `getStoreStats()` migration validated end-to-end
  - **Synced Cursor's full sources scaffolding**: `anomalies.ts` (8-cat AnomalyCategory inc. `options`+`bybit`), `format.ts`, `_helpers.ts`, `snapshot.ts`, `types.ts` updates — needed for Desktop's `AlertsFeed` Record<AnomalyCategory> mapping to typecheck
  - **Code's `overview.ts` updated** with `altDominance` + `volumeTurnoverPct` fields per Cursor's new `MarketOverview` type (was missing on prod)
  - **Fixed [apps/web/app/api/klines/route.ts](apps/web/app/api/klines/route.ts)** — Hetzner IP banned by Binance (HTTP 418 across all 4 binance hosts). Added Bybit V5 spot kline fallback (interval mapping + reverse newest→oldest). Klines back to 200 with real BTC candles. Desktop's `OverviewPriceChart` will now render.
  - **Verified all routes**: `/`, `/api/markets`, `/api/funding`, `/api/macro`, `/api/klines?symbol=BTCUSDT&interval=1h&limit=24`, `/api/dual-assets/{snapshots,best-hour,summary}` — all 200
- **[done 19:55]** Dual-assets feature finished end-to-end (see entries below)
- **[done 18:30]** Phase 5A initial fix — `/api/dual-assets/*` 500 → 200 (lazy DB path + better-sqlite3 hoisting + webpack external)
- **[done 19:00]** Bloomberg amber proof-of-concept at `/bloomberg-preview` (additive [data-theme]). Desktop has since promoted Bloomberg to `:root` default — preview/components now redundant, safe for Desktop to clean up.
- **[done 19:15]** SESSIONS.md + docs/SESSION-PROMPTS.md created — paste-ready bootstrap prompts for all 3 sessions.
- **[done 19:55]** Dual-assets feature finished end-to-end:
  - **Tests**: [packages/sources/src/dual-assets/{store,analyzer}.test.ts](packages/sources/src/dual-assets/) — 15/15 passing on server (Linux+Node20). Local Windows+Node24 fails native build only — not a real failure.
  - **New endpoint**: [apps/web/app/api/dual-assets/summary/route.ts](apps/web/app/api/dual-assets/summary/route.ts)
  - **New cron**: [apps/alerts/src/dual-assets-rollup.ts](apps/alerts/src/dual-assets-rollup.ts) — auto rollup at 00:05 ICT
  - **New script**: [scripts/dual-assets-tick.mjs](scripts/dual-assets-tick.mjs) — manual one-shot tick + rollup
  - **New MCP tool**: `get_dual_assets_daily_summary` — total tools 16 (was 15). [.dxt rebuilt](apps/mcp/pulse-terminal.dxt) at 144.5 KB
  - **Docs**: [docs/DUAL-ASSETS.md](docs/DUAL-ASSETS.md) — full operator guide
  - All deployed + verified live on https://cryptopulse.buzz
- **[done 20:05]** Picked option **B** for Cursor's question (cleaner contract):
  - Added [getStoreStats()](packages/sources/src/dual-assets/store.ts) + `StoreStats` type — returns `{available, pairs, totalSnapshots, samplesLast24h, lastWriteUtc, lastWriteAgeMs, error?}`
  - Re-exported via `@pulse/sources/server` ([dual-assets/index.ts](packages/sources/src/dual-assets/index.ts))
  - Pushed + restarted realtime — see Open questions for next step
- **[done 20:10]** Deployed Cursor's hub /health v2 to server (their files weren't on prod yet):
  - `curl http://127.0.0.1:8081/health` now returns `_version: 2` ✓
  - apr block: `{storeOk:false, error:"better-sqlite3 not installed"}` — Cursor needs to switch `apr-reader.ts` from dynamic import → `getStoreStats()` (see Open questions)
- **[doing]** nothing — handing back to user
- **[blocked]** User to set `BYBIT_API_KEY` / `BYBIT_API_SECRET` so cron populates DB. Then run `node --import tsx scripts/dual-assets-tick.mjs --rollup` once to seed.
- **[next]** When Cursor confirms migration to `getStoreStats()`, deploy + verify `apr.storeOk: true`

---

## 🎨 Design direction — RESOLVED 2026-04-28

User picked **Option A — Bloomberg amber** after seeing the Claude Design handoff package.

- ✅ Desktop completed full pivot per `/design_handoff_cryptopulse/` — see Desktop activity entry below for file list
- 🧹 **Cleanup pending (Code's lane):** delete `/bloomberg-preview` page + `apps/web/components/bloomberg/` POC + `[data-theme="bloomberg"]` block in `globals.css` (Desktop already removed it but verify on prod). Exact commands in Desktop's entry below.

---

## ❓ Open questions

- ~~**Code → Cursor:** picked option B (`getStoreStats()`)~~ — **RESOLVED 2026-04-28 19:15.** Cursor migrated `apr-reader.ts`, 42/42 tests pass. Awaiting Code's deploy of `pulse-realtime` to verify prod `apr.storeOk: true`. See Cursor activity entry above.
