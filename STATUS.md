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
- _~~Code (round 4)~~_ — UNLOCKED. Round 4 deployed at commit `f25a387`. Files now in `master` and free for any session to extend.
- _Desktop_: `packages/ui/**`, `apps/web/app/globals.css`, all `apps/web/components/*` EXCEPT `apps/web/components/bloomberg/**` (Code's, awaiting cleanup), `apps/web/app/page.tsx` (Overview)
- _~~Desktop (round 3)~~_ — UNLOCKED 2026-04-29. Mobile + Bloomberg polish + new /options + i18n shipped via worktree (uncommitted, see latest activity entry).
- _Cursor_: `packages/sources/src/{format,anomalies,snapshot,_helpers}.ts`, `packages/charts/src/**`, `apps/realtime/src/{hub-health,apr-reader}.{ts,test.ts}` + `vitest.config.ts` (Phase 5A scaffolding + hub v2)

## ✅ Free for anyone

- `apps/web/lib/**` (except `use-media.ts` while Desktop is in flight)
- `docs/**` (additive), `design-refs/**`
- Top-level configs (coordinate via STATUS log first)

## 🔗 Cross-session integration points (everyone's eyes here)

- `packages/sources/src/anomalies.ts` — Cursor extended to import from Code's `options/types.ts` (good, no conflict)
- `packages/sources/src/format.ts` — Cursor's formatters; Desktop's new Bloomberg components use `formatUSD` / `formatPercent` from `@pulse/sources` ✓
- `packages/sources/src/server.ts` — barrel; both Code + Cursor add exports here, coordinate before edit
- `apps/web/app/globals.css` — Desktop now owns the entire file (Bloomberg `:root` is default); Code's `[data-theme="bloomberg"]` block has been retired

---

## 📰 Activity log (newest at top)

### 2026-04-29 · Desktop session (latest)
- **[done]** Round 3 — Mobile UX/UI + Bloomberg polish across remaining tabs + new Options Chain + i18n coverage. **Workspace typecheck clean across all 8 packages** (`pnpm -r typecheck`). Files staged but **not committed** — user to review and commit.

  **🥇 Task 1 · Mobile Web UX/UI** (< 720px breakpoint)
  - **NEW** [apps/web/lib/use-media.ts](apps/web/lib/use-media.ts) — `useViewport()` returns `mobile|tablet|desktop|null` (null until first `useEffect` flush so SSR matches desktop layout). `useIsMobile()` and `useIsCompact()` convenience hooks.
  - **NEW** [apps/web/components/BottomTabNav.tsx](apps/web/components/BottomTabNav.tsx) — fixed-bottom 56px tab bar replacing the 140px left rail on mobile. 6 tabs (Overview / Markets / Flow / Deriv / Options / Settings) with glyphs + ≥44px tap targets per iOS HIG. F1–F7 keyboard nav still wired up so desktop parity is preserved.
  - [AppShell](apps/web/components/AppShell.tsx) — split into `Frame` sub-component that branches on `useIsMobile()`. Mobile shell drops the left rail and bottom-bar, swaps in `BottomTabNav` and a `compact` prop on `TerminalStatusBar`. Desktop shell unchanged.
  - [TerminalStatusBar](apps/web/components/TerminalStatusBar.tsx) — accepts `compact` prop. Compact mode drops VER/USR/DESK/DATE/SESS, keeps brand pill + feed dot + UTC HH:MM only. Same component, two faces.
  - [MetricStrip](apps/web/components/MetricStrip.tsx) — grid responds to `useViewport()`: `2×3` mobile, `3×2` tablet, `6×1` desktop, with min-height adjusted accordingly.
  - [MoversTable](apps/web/components/MoversTable.tsx) — mobile renders a card list (60px tap-tall rows, asset + price + 24h%/7d%/vol on a 3-col grid + sparkline) instead of the wide table. Desktop still gets the sortable table.
  - [MarketsTable](apps/web/components/MarketsTable.tsx) — same mobile pivot (card list with watchlist ☆ button as primary tap target). Desktop kept; outer `Card` wrapper removed so it can render edge-to-edge inside a `Panel`.
  - [packages/ui/src/WsRow.tsx](packages/ui/src/WsRow.tsx) — added `ws-row` + `ws-row--<height>` classes + `workspace` class. Inline styles preserved.
  - [apps/web/app/globals.css](apps/web/app/globals.css) — added two media-query blocks: `(max-width: 720px)` collapses `.ws-row` to single column with auto height + `min-height` per row preset (`chart 280 / table 320 / feed 220`), tightens `.workspace` padding, raises body to 11px, fades scrollbars, sets 36px min-height on tap-targets. `(720..1023px)` shrinks fixed row heights for tablets.

  **🥈 Task 2 · Bloomberg shell on remaining 5 tabs**
  - [apps/web/app/markets/page.tsx](apps/web/app/markets/page.tsx) — `Workspace` → `WsRow` with MarketsTable c-5 + CandlestickPanel c-7 (chart row), full MarketsTable c-12 (table row). Killed legacy HSplit/Pane.
  - [apps/web/app/derivatives/page.tsx](apps/web/app/derivatives/page.tsx) — full-bleed FundingHeatmap c-12 (auto ≥520px) + LIVE WS STREAM c-12 (table). Status dot uses signal palette.
  - [apps/web/app/backtest/page.tsx](apps/web/app/backtest/page.tsx) — 3 ws-rows: SUMMARY 4-stat strip (StatBlock × 4) + lookahead picker in panel actions; PATTERN HIT RATE table; METHODOLOGY footnote panel.
  - [apps/web/app/fundflow/page.tsx](apps/web/app/fundflow/page.tsx) — full rewrite, 6 ws-rows wrapping the data hooks from `Dashboard.tsx` (which is now bypassed; safe to delete in a future cleanup). MARKET PULSE / STABLECOINS+DOMINANCE / BTC ETF+ETH ETF / BTC PERP+ETH PERP / DEFI TVL+TOP CHAINS / DEX VOLUME.
  - [apps/web/app/settings/page.tsx](apps/web/app/settings/page.tsx) — 3 ws-rows: Locale + Refresh c-6+c-6, Notifications + Watchlist c-6+c-6, Reset c-12. Full Bloomberg styling on every control (sharp 0 corners, mono, amber selection).
  - [CandlestickPanel](apps/web/components/CandlestickPanel.tsx) — outer `Card` removed, can render edge-to-edge into a Panel. Added `hideControls` prop in case the host wants to render its own toolbar.

  **🥉 Task 3 · Funding Heatmap redesign** ("อ่านยาก, cells หน้าตาเหมือนกันหมด" feedback addressed)
  - [apps/web/components/FundingHeatmap.tsx](apps/web/components/FundingHeatmap.tsx) — full rewrite.
    - **2 view modes** via toolbar toggle: COMPACT (default) groups top 12 hot longs + top 12 hot shorts under amber section dividers; MATRIX shows top 40 by `|avg|` flat.
    - **4 venues** consumed (binance/bybit/okx/deribit) — extends previous 3-venue UI to match Code's adapter coverage (~1300+ rates).
    - **28px rows** with sticky thead + sticky `SYM` first column.
    - **Color saturation scaled to ±0.05% magnitude** (was ±0.1) — typical rates now read at higher contrast.
    - **Hover tooltip** (fixed, follows cursor): symbol · venue · signed rate · absolute % · `nextFundingTime` UTC · raw exchange symbol.
    - Mobile drops the SPRD column; desktop keeps it. Footer hint strip explains AVG/SPRD thresholds.
  - Note: this is the `/derivatives` heatmap. The Overview's `FundingHeatmapMini` is unchanged (different intent).

  **Task 4 · Options Chain page** (new)
  - **NEW** [apps/web/app/options/page.tsx](apps/web/app/options/page.tsx) — wired to existing Code endpoints `/api/options/aggregate?asset=X&arbitrage=1` + `/api/options/iv-smile?asset=X&expiry=Y`.
    - Row 1 (h-stats): asset switcher (BTC/ETH/SOL) + 4 KPIs (Spot · ATM IV call/put · Put/Call ratio · Total OI/Vol).
    - Row 2 (≥460px): STRIKE LADDER c-7 (calls left, puts right of K, ATM row tinted amber, ITM cells lightly shaded green/red) + IV SMILE c-5 using `@pulse/charts` `IVSmile` (split call/put lines, ATM reference line). Expiry select in panel header.
    - Row 3 (≥360px): GREEKS HEATMAP c-8 (`@pulse/charts` `GreeksHeatmap`, both sides, 22px rows) + ARBITRAGE HITS c-4 (top 20 spreads with BUY/SELL exchange + spread %).
  - Wired into nav at F5; Backtest moved to F6, Settings stays F7. The dead `/alerts` link was removed (no route ever existed — alerts are surfaced via `AlertsFeed` on Overview).

  **Task 5 · i18n coverage**
  - [packages/i18n/src/dict.ts](packages/i18n/src/dict.ts) — added 25 new keys: `nav.flow_short`, `nav.deriv_short`, `nav.backtest`, `nav.settings`, `nav.intel/trading/system`, `status.title/alerts/streams/uplink/armed/socket_live/mcp_ready`, `shell.feed_live/feed_stale/feed_offline/feed_connecting/ready/cmd/profile/latency/help/hotkeys/cmd_palette/lang/session/session_us_eu`.
  - Migrated [TerminalStatusBar](apps/web/components/TerminalStatusBar.tsx), [TerminalNav](apps/web/components/TerminalNav.tsx), [TerminalBotBar](apps/web/components/TerminalBotBar.tsx), [BottomTabNav](apps/web/components/BottomTabNav.tsx) to `useT(key)`. Brand "CRYPTOPULSE" + abbreviated terminal labels (VER/USR/DESK/UTC/DATE/F1/F8/⌘K) stay English by terminal convention; everything else flips with the LANG button.

  **What I deliberately did NOT touch** (per role boundary)
  - `packages/sources/**`, `apps/mcp/**`, `apps/alerts/**`, all `apps/web/app/api/*` routes — Code's lane.
  - `packages/charts/src/{IVSmile,GreeksHeatmap}.tsx` — Cursor's lane (consumed as-is via `@pulse/charts`).
  - `next.config.js`, `ecosystem.config.cjs`, `package.json` deps — **no new deps added**.
  - Code's leftover `apps/web/components/bloomberg/*` and `apps/web/app/bloomberg-preview/` — Code already cleaned these in round 4 per [done 20:50] entry.

  **For Code on next deploy:**
  - Mobile shell uses `position: sticky` + `min-height: 100vh` patterns; on iOS Safari `100vh` excludes the URL bar. The current grid uses fixed-row heights so it should be fine, but please sanity-check on a real iPhone — if the bottom tab bar gets eaten, swap `100vh` → `100svh` in `AppShell.tsx:31`.
  - The Options page hits `/api/options/aggregate?asset=...&arbitrage=1` — Code's round-4 `?expiry=` and `?side=` filters are not used by this UI but stay available for future deeper-dive views.
  - `/api/funding` consumers now expect `nextFundingTime` per rate — already provided per Code's adapter, just used to be ignored. No backend change needed.

- **[verified]** `pnpm -r typecheck` — all 8 packages clean (web/ui/i18n/sources/charts/mcp/alerts/realtime).
- **[doing]** Awaiting user review on https://cryptopulse.buzz once Code redeploys, especially:
  - Mobile bottom-tab nav at < 720px
  - `/options` page first paint (BTC default — no expiry picked yet, should auto-select first available)
  - FundingHeatmap COMPACT vs MATRIX toggle
- **[blocked]** None.

### 2026-04-29 · Code session (latest — 22:00)
- **[done 22:00]** Round 4 — Order Book L2 + Whale Flow + cleanup. Commit `f25a387` deployed live.
  - **WS depth stream** [apps/realtime/src/binance-depth-stream.ts](apps/realtime/src/binance-depth-stream.ts) — Binance partial book @100ms for BTCUSDT/ETHUSDT/SOLUSDT, in-process Map<DepthBook>, auto-reconnect 1s→30s exponential. Disable via `PULSE_DEPTH=0`.
  - **Hub /depth route** [apps/realtime/src/http-server.ts](apps/realtime/src/http-server.ts) — sub-50ms cached, returns 404 with `available[]` if symbol not subscribed.
  - **Adapter + API** [packages/sources/src/depth.ts](packages/sources/src/depth.ts) + [apps/web/app/api/depth/route.ts](apps/web/app/api/depth/route.ts) — hub-first with Binance REST fallback. **3 tests pass.**
  - **Whale flow self-index** [packages/sources/src/whale-flow.ts](packages/sources/src/whale-flow.ts) — Etherscan USDT/USDC + Mempool.space BTC, 30-entry exchange address book, IN/OUT/INTERNAL classification. WHALE_FLOW_MIN_USD=10M default. **4 tests pass.**
  - **Whale API** [apps/web/app/api/whale-flow/route.ts](apps/web/app/api/whale-flow/route.ts) — 60s revalidate.
  - **MCP +2 tools** → 19 total ([apps/mcp/manifest.json](apps/mcp/manifest.json) + [src/index.ts](apps/mcp/src/index.ts)): `get_order_book`, `get_whale_flow`. **.dxt rebuilt 144.7 KB.**
  - **Options endpoint** [apps/web/app/api/options/aggregate/route.ts](apps/web/app/api/options/aggregate/route.ts) — added `?expiry=YYYYMMDD` + `?side=call|put` filters for Desktop's Options Chain page.
  - **Cleanup**: `apps/web/components/MarketHeatstrip.tsx` deleted. 3 reference projects (`Bybit Api/`, `Option Scan/`, `option-dashboard/`) — partial removal, OneDrive locked `node_modules` so they remain on disk (gitignored, harmless).
  - **All 4 typechecks clean** (sources/web/realtime/mcp).
- **[verified live]** All endpoints 200 on https://cryptopulse.buzz:
  - `/api/depth?symbol=BTCUSDT` returns live order book (real bids/asks @ 77K)
  - `/api/whale-flow` working
  - `/api/options/aggregate?asset=SOL&expiry=20260626` filters correctly
  - `/api/options/aggregate?asset=BTC&side=call` filters correctly
- **[noted]** Desktop's mobile WIP (BottomTabNav/AppShell/use-media/MoversTable etc.) and i18n keys are uncommitted in worktree — Code did NOT commit those. Desktop will commit on their side.
- **[blocked]** Optional ETHERSCAN_API_KEY env on prod — current rate limit 1 req/sec works but key bumps to 5. Add to `.env.local` if needed.

### 2026-04-29 · Cursor session (latest)
- **[done 15:30]** Quality work — smoke test coverage on Code's adapters. **60 new tests across 5 files**, all passing locally. Sources test suite: **124 → 183 passing** (13 dual-assets failures remain — same SQLite native-binding issue on Windows + Node 24, unchanged from baseline).
  - **NEW** [packages/sources/src/options/_expiry.test.ts](packages/sources/src/options/_expiry.test.ts) — 14 tests: every venue's expiry-string format, all 12 month abbreviations, fallback paths, sortability invariant
  - **NEW** [packages/sources/src/options/deribit.test.ts](packages/sources/src/options/deribit.test.ts) — 11 tests: BTC fraction-of-underlying conversion, SOL_USDC raw-USD path, null-bid/null-ask fallback, mark≤0 dropping, malformed instrument filtering, Greek precision rounding
  - **NEW** [packages/sources/src/options/aggregator.test.ts](packages/sources/src/options/aggregator.test.ts) — 13 tests: cross-venue arbitrage detection, minSpreadPct gating, same-venue exclusion, top-50 cap, IV smile grouping by side/strike/asset/expiry
  - **NEW** [packages/sources/src/portfolio.test.ts](packages/sources/src/portfolio.test.ts) — 13 tests: opt-in null when keys absent, **LD-prefix Earn assets** (LDUSDT→USDT 1:1, LDBTC→BTC priced via underlying), unpriced FAKE asset dropped from totalUsd, free+locked sum, descending sort, HMAC-SHA256 signature on `/api/v3/account`, 401 error path
  - **EXTENDED** [packages/sources/src/funding.test.ts](packages/sources/src/funding.test.ts) — +9 tests: **OKX 80-instrument fan-out cap**, USDT-settled+live filtering on listing, fallback 10-symbol set when listing 500s, BTCUSDT→BTC-USDT-SWAP shorthand, partial failure tolerance via allSettled, plus 3 Deribit perp extras (sign preservation, USD-suffix stripping, default-symbol fan-out)
- **[verified]** `pnpm --filter @pulse/sources test` — 5/5 new files pass (65/65 tests in those files, 183/196 overall — 13 unrelated Win+Node24 SQLite failures unchanged)
- **[noted]** Optional 🥈 anomaly detectors (`detectMaxOiShift`, `detectAprRegimeChange`) are **already implemented + tested** in [anomalies.ts](packages/sources/src/anomalies.ts) and [anomalies.test.ts](packages/sources/src/anomalies.test.ts) — skipping the optional task as it's already complete.
- **[noted]** Pre-existing typecheck failures in [server.ts](packages/sources/src/server.ts) (missing `./whale-flow.js` import) are NOT caused by this change — that's untracked Code-lane WIP. My test files all typecheck clean (vitest's transform pass passes them).
- **[committed only my files]** Other sessions have ~10 uncommitted/untracked files (Desktop's BottomTabNav/AppShell/MoversTable WIP + Code's depth.ts/depth-stream/whale-flow refs). Left untouched — they belong to other lanes and should be committed by their owners.

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

### 2026-04-28 · Code session (latest — 21:30)
- **[done 21:30]** Two user-reported fixes:
  - **Scroll bug fix** [apps/web/components/AppShell.tsx:52](apps/web/components/AppShell.tsx#L52) — `<main>` had `overflow:hidden` contradicting its own "scrollable" comment. Flipped to `overflow:auto`. **Cross-lane note:** AppShell is Desktop's, but this is a typo-class bug fix matching their stated intent — not a design pivot. Desktop please ack via STATUS log.
  - **OKX funding expansion** [packages/sources/src/funding.ts:118](packages/sources/src/funding.ts#L118) — adapter only fetched BTC+ETH (2 rates). Now lists USDT-settled SWAPs from `/api/v5/public/instruments` and parallel-fetches funding-rate per-id (capped to 80). OKX coverage: **2 → 80 rates** verified live.
  - GitHub: `f484b1a`, deployed via `git pull` workflow ✓
- **[done 21:00]** GitHub repo: https://github.com/Firstyjps/pulse-terminal (private) — 126 files committed, deploy key on Hetzner, server now uses `git pull` workflow (no more scp). Both `.env.local` + `apps/alerts/data/` preserved during git takeover.
- **[done 20:50]** Full deploy of Desktop + Cursor work to prod:
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
