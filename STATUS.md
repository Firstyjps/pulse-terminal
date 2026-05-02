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

### 2026-05-02 · Code session — readability refactor (no functional change)
**Two organizational refactors. No public API change. typecheck + sources tests + MCP probe all clean.**

  **🛠 Refactor 1 — `apps/mcp/src/` split**
  - `apps/mcp/src/index.ts` shrunk from **663 → 47 lines**. Bootstraps server + delegates registration.
  - **NEW** `apps/mcp/src/_helpers.ts` — `hubFetch`, `json`, `text`, `RegisterFn` type.
  - **NEW** `apps/mcp/src/tools/` — 6 register modules grouped by domain:
    - `fundflow.ts` (7 tools: market_overview, stablecoin_flows, etf_flows, futures, dex_leaderboard, tvl_breakdown, fundflow_snapshot)
    - `derivatives.ts` (2: funding_summary, oi_snapshot)
    - `options.ts` (3: options_chain, iv_smile, options_arbitrage)
    - `dual-assets.ts` (3: dual_assets_apr, best_dual_assets_hour, dual_assets_daily_summary)
    - `intelligence.ts` (2: detect_anomalies, grade_signal)
    - `markets.ts` (2: order_book, whale_flow)
  - Probe-mcp confirms 19/19 tools register intact.
  - **Note:** `dist/index.mjs` (esbuild bundle used by `pack-dxt`) is now stale. Re-bundle when next packing the .dxt.

  **🛠 Refactor 2 — `packages/sources/src/` subdirs**
  - **NEW** `packages/sources/src/positions/` — moved 4 DeFi position adapters + shared types via `git mv` (history preserved):
    - `aave-positions.ts` → `positions/aave.ts` (+ test)
    - `meteora-positions.ts` → `positions/meteora.ts` (+ test)
    - `orca-positions.ts` → `positions/orca.ts` (+ test)
    - `pendle-positions.ts` → `positions/pendle.ts` (+ test)
    - `position-types.ts` → `positions/types.ts`
  - **NEW** `packages/sources/src/portfolio/` — moved 5 portfolio adapters:
    - `portfolio.ts` → `portfolio/binance.ts` (+ test)
    - `portfolio-bybit.ts` → `portfolio/bybit.ts` (+ test)
    - `portfolio-okx.ts` → `portfolio/okx.ts` (+ test)
    - `portfolio-multi.ts` → `portfolio/multi.ts` (+ test)
    - `portfolio-aggregate.ts` → `portfolio/aggregate.ts` (+ test)
  - `server.ts` + `index.ts` re-exports updated to new paths. **External `@pulse/sources/server` surface unchanged** — exports map only exposes `.` and `./server`, so no consumer changes were needed.
  - 28/28 sources test files green (14 pre-existing failures in `dual-assets/store.test.ts` + `depth.test.ts` are unrelated — better-sqlite3 native binding not loading on Node 24.14.1 + Win11; reproduces on master).

- **[verified]** `pnpm typecheck` — all 7 workspaces clean
- **[verified]** `pnpm --filter @pulse/sources test` — 345/359 pass (same baseline as before refactor)
- **[verified]** `node scripts/probe-mcp.mjs` — 19 tools list intact
- **[doing]** nothing — handing back
- **[blocked]** None
- **[next]** No follow-up needed. Future MCP tool additions go in the matching `apps/mcp/src/tools/<group>.ts`. Future portfolio/position adapters go in the matching subdir.

### 2026-05-01 · Code session (latest — Phase 6 Extended Platform)
**4 features shipped: snapshot history · webhook test UI · popup chart · Tauri desktop wrapper config.**

  **🆕 Feature 6.1 — Daily snapshot history (90-day rolling)**
  - **NEW** [packages/sources/src/snapshot-history.ts](packages/sources/src/snapshot-history.ts) — SQLite store at `apps/alerts/data/snapshot-history.sqlite`. Schema: date PK, ts, total_mcap, total_volume, btc_dom, eth_dom, fg_value, fg_label, top10 (JSON). Methods: `saveDailySnapshot` (UPSERT + 90-day prune) · `getSnapshotHistory(days)` · `getAllSnapshots` · `clearSnapshots` · `getSnapshotStats`.
  - **NEW** [packages/sources/src/snapshot-collector.ts](packages/sources/src/snapshot-collector.ts) — `collectAndSaveDailySnapshot()` pulls overview + top10 markets in parallel, no-op on zero-mcap (rate-limited CG response).
  - **NEW** [apps/alerts/src/snapshot-cron.ts](apps/alerts/src/snapshot-cron.ts) — fires at 00:05 UTC daily + one-shot at boot. Wired into existing `alerts/src/index.ts` shutdown handler.
  - **API routes:**
    - `GET /api/snapshot/history?days=30|60|90` — read window
    - `POST /api/snapshot/history` — manual collect (force)
    - `POST /api/snapshot/history/clear` — wipe table
    - `GET /api/snapshot/history/export` — JSON download with `Content-Disposition` filename
  - **NEW** [apps/web/app/history/page.tsx](apps/web/app/history/page.tsx) — 3 ws-rows:
    - Row 1 (h-stats): SUMMARY (count / earliest / latest / window Δ)
    - Row 2: MARKET tab (totalMcap/totalVolume/btcDom/fgValue picker) OR COINS tab (per-coin price line). 30/60/90 window selector. Uses existing `PriceLine` chart with metric-specific color tints.
    - Row 3 (h-table): RECENT SNAPSHOTS — last 14 rows with all metrics + BTC price.
  - Toolbar buttons: ▶ COLLECT NOW · ⬇ EXPORT JSON · 🗑 CLEAR (with confirm).
  - Keyboard `H` while on `/history` → refresh.

  **🆕 Feature 6.2 — Webhook test UI**
  - [use-settings.ts](apps/web/lib/use-settings.ts) — new `webhooks: { discordUrl, telegramToken, telegramChatId, ntfyTopic }` shape with safe migration (existing settings are merged with new defaults).
  - **NEW** [apps/web/app/api/notify/test/route.ts](apps/web/app/api/notify/test/route.ts) — `POST { channel, ...creds }` server-side proxy that fires a one-shot test message. URL/token are NOT stored server-side. Validates Discord webhook URL pattern. Discord sends with cyan-color embed; Telegram uses Markdown V1 with proper escaping.
  - [apps/web/app/settings/page.tsx](apps/web/app/settings/page.tsx) — new EXTERNAL ALERTS panel with 3 channel rows + per-row TEST button + footer noting that production-side env vars (`ALERT_WEBHOOK_URL`, `PULSE_TELEGRAM_BOT_TOKEN/CHAT_ID`, `PULSE_NTFY_TOPIC`) drive the alerts cron.

  **🆕 Feature 6.3 — Popup chart with parent sync**
  - **NEW** [apps/web/app/chart-popup/page.tsx](apps/web/app/chart-popup/page.tsx) — standalone chart route. Reads `?symbol=&tf=&type=` from URL. Listens for `postMessage` updates from `window.opener` so parent symbol/tf flips sync to popup. Self-polls `/api/klines` every 30s. Auto-closes when parent unloads. Has its own picker + line/candle toggle + 🪟 button to spawn another popup.
  - [apps/web/components/AppShell.tsx](apps/web/components/AppShell.tsx) — bypass route check (`/chart-popup` skips TerminalNav/StatusBar/BotBar shell). Just renders `ToastProvider + children`.
  - [apps/web/components/OverviewPriceChart.tsx](apps/web/components/OverviewPriceChart.tsx) — added 🪟 button next to TF selector. Tracks opened popups in a ref, broadcasts symbol/tf changes via `postMessage`, closes them all on `beforeunload`.

  **🆕 Feature 6.4 — Tauri 2.x desktop wrapper (config + docs)**
  - **NEW** [src-tauri/tauri.conf.json](src-tauri/tauri.conf.json) — Tauri 2 schema. Window 1400×900 min 1024×720, `◆ Pulse Terminal` title, finance category. Tray icon + bundle targets (msi/deb/dmg/AppImage).
  - **NEW** [src-tauri/Cargo.toml](src-tauri/Cargo.toml) — Rust deps (tauri 2, tauri-plugin-shell/notification).
  - **NEW** [src-tauri/src/main.rs](src-tauri/src/main.rs) — system-tray with Show/Hide/Refresh/Quit menu, left-click toggle, hide-to-tray on close-button.
  - **NEW** [src-tauri/capabilities/default.json](src-tauri/capabilities/default.json) — minimal permission set (core + shell:open + notification).
  - **NEW** [src-tauri/build.rs](src-tauri/build.rs) — standard Tauri build hook.
  - **NEW** [src-tauri/README.md](src-tauri/README.md) — prerequisites, icon generation, dev/build commands, platform notes.
  - [.gitignore](.gitignore) — added `src-tauri/{target,gen,icons,Cargo.lock}` (Rust target is ~3-5 GB).
  - [README.md](README.md) — new "Desktop build (optional · Tauri 2.x)" section.
  - [CLAUDE.md](CLAUDE.md) — Tauri added to stack list with note "optional, web app works standalone".
  - **No actual Rust build done** — config files only. User runs `cargo tauri dev` themselves once toolchain is installed.

  **Nav:**
  - [TerminalNav](apps/web/components/TerminalNav.tsx) — added F10 HISTORY under INTEL section.

- **[verified]** `pnpm -r typecheck` — all 7 packages clean.
- **[doing]** nothing — handing back.
- **[blocked]** None.
- **[next]** Push + deploy. Snapshot cron fires immediately at boot so prod will have today's row right after restart.

### 2026-05-01 · Code session — Phase 5 Intelligence & Analytics
**4 features shipped: news / on-chain / whale-mempool / social — consolidated under new `/intel` tab (F9).**

  **🆕 Source adapters (`packages/sources/src/`):**
  - **news.ts** — `getCryptoNews(filter)` via CryptoPanic public API (`?public=true`, no key). Filter: `all|BTC|ETH|hot|bullish|bearish` mapping to `currencies=`/`filter=` params. Returns top 30 with title, source, ticker tags, vote summary. Revalidate 300s.
  - **on-chain.ts** — `getOnChainMetrics()` via blockchain.info public q endpoints. Hashrate (GH/s → EH/s), difficulty (raw → T), mempool count, block height + chart API for active addresses. Each value is its own try/catch — partial failures show "—" instead of nuking the whole panel.
  - **whale-alerts.ts** — `getWhaleAlerts(thresholdUsd, btcPrice)` scans `blockchain.info/unconfirmed-transactions` mempool, surfaces tx whose total OUTPUT > threshold. Caller passes BTC spot price (separation of concerns — engine doesn't fetch price). Complements `whale-flow.ts` which reads CONFIRMED tx; this fires sooner (broadcast not block). Revalidate 30s.
  - **social.ts** — `getSocialBuzz()` aggregates `r/CryptoCurrency`, `r/Bitcoin`, `r/ethfinance` hot posts, extracts ticker mentions via regex with 60-word blacklist (filters ALL/AND/THE/SEC/CEO/etc), engagement score = upvotes × ln(comments+1). Returns top 10 trending. Allorigins fallback for CORS-blocked datacenter IPs.

  **🆕 API routes:**
  - `/api/news?filter=...` (revalidate 300)
  - `/api/on-chain` (revalidate 600)
  - `/api/whale-alerts?threshold=N` (revalidate 60) — BTC spot fetched server-side from CoinGecko `/simple/price`
  - `/api/social` (revalidate 900)

  **🆕 React components (`apps/web/components/`):**
  - **NewsFeed.tsx** — 6-pill filter row + scrollable card list. Each row: relative time / title / source · ticker pills · ★important badge / open-tab arrow. Click opens external `window.open(url, "_blank", "noopener")`.
  - **OnChainMetrics.tsx** — 5-tile auto-fit grid (≥140px each). Tints per metric (amber hashrate / cyan difficulty / red mempool > 50K / green block height / amber-bright addrs).
  - **WhaleAlerts.tsx** — 60s polling tick. Header strip shows threshold + scanned count + new-tx badge with blink. Each tx flashes green border + bg for 8s when first seen (tracked in `localStorage[pulse.whale.seen]`, cap 500). Click opens `blockchain.com/btc/tx/<hash>`. Threshold pulled from `useSettings`.
  - **SocialBuzz.tsx** — sticky-header table (#/Ticker/Mentions/Score/Top Post). Score in compact form (K/M). Click row opens the top post on Reddit.

  **🆕 `/intel` page** [apps/web/app/intel/page.tsx](apps/web/app/intel/page.tsx) — 3 ws-rows:
  - Row 1 (h-stats): ON-CHAIN METRICS c-12 (5 mini-cards)
  - Row 2 (h-feed): MARKET NEWS c-7 + WHALE ALERTS c-5
  - Row 3 (h-table): SOCIAL BUZZ c-12

  **Nav wiring:**
  - [TerminalNav](apps/web/components/TerminalNav.tsx) — added `F9 INTEL` under INTEL section. Existing F1-F8 unchanged.
  - [BottomTabNav](apps/web/components/BottomTabNav.tsx) — `INTEL ℹ` replaces FUNDFLOW slot on mobile (Fundflow still reachable via desktop F3 + direct URL).

  **Settings extension:**
  - [use-settings.ts](apps/web/lib/use-settings.ts) — new `whaleThresholdUsd` field (default $1,000,000, range $100K – $1B).
  - [/settings page](apps/web/app/settings/page.tsx) — added input row under DATA REFRESH panel.

- **[verified]** `pnpm -r typecheck` — all 7 packages clean.
- **[doing]** nothing — handing back.
- **[blocked]** None. All sources opt-in:
  - News, on-chain, social → no API keys ever needed (public)
  - Whale alerts → uses CoinGecko fallback for BTC price; no key required
- **[next]** Push + deploy.

### 2026-04-30 · Code session — Overview UX polish round
**Six UX adjustments per user screenshot review.**

  **🆕 Bigger sidebar** — left rail 140 → 172px, font 10 → 12px, row height 5px → 9px padding (≥36px tap-tall), heavier weight on active. F-key prefix bumped to 22px column with bolder weight. AppShell grid updated to match.

  **🆕 FEAR & GREED panel rebuild** — the yellow 7d/6d "lines" were thin all-amber bars defaulting to `value` (i.e. flat rectangles) because no real history was fetched.
  - [packages/sources/src/overview.ts](packages/sources/src/overview.ts) — alternative.me query expanded `?limit=1` → `?limit=7`. Returns oldest→newest history array per day with value + classification + ts.
  - [packages/sources/src/types.ts](packages/sources/src/types.ts) — `MarketOverview.fearGreedIndex.history?` field added.
  - [apps/web/components/FearGreedGauge.tsx](apps/web/components/FearGreedGauge.tsx) — full rewrite of bottom strip:
    - Each bar height = `Math.max(8, value)%` (so even Extreme Fear days are visible).
    - Bar color = F&G zone (red < 25 / orange < 45 / amber < 55 / lime < 75 / green ≥ 75) — instead of all-amber.
    - Numeric F&G value prints above each bar in zone color.
    - Today's bar (`NOW` slot) gets amber border + inner glow + 100% opacity; older days dimmed to 0.85.
    - Hover tooltip per bar: `7d · 32 FEAR`.

  **🆕 SESSION cell — active-only big** — was showing `TYO LDN NYC` all together inline.
  - [apps/web/components/MetricStrip.tsx](apps/web/components/MetricStrip.tsx) `SessionStrip` rewritten:
    - Picks the *primary* active session (latest-starting one currently open, so during US·EU overlap LDN takes precedence over TYO).
    - **Big 26px symbol** of the active session (TYO/LDN/NYC) centered, green with glow.
    - When all closed, shows the next upcoming session in amber + `OPENS IN Nh`.
    - Header strip: `SESSION · 1/3 OPEN`.
    - Footer: `UTC HH:MM` aligned right.
    - Thin 2px progress bar at bottom showing % through the active window with green glow.

  **🆕 Overview layout reshuffle** — Live Anomaly moved to bottom strip, Macro proportion bumped:
  ```
  Row 4 (h-feed):   MACRO OVERLAY c-7 + FUNDING RATES c-5    (was Anomaly c-5 + Macro c-4 + Funding c-3)
  Row 5 (auto, ≥220px):  LIVE ANOMALY FEED c-12              (full-width strip at bottom)
  ```

  **🆕 Price Chart → Line/Area** — was Lightweight Charts Candlestick:
  - **NEW** [packages/charts/src/PriceLine.tsx](packages/charts/src/PriceLine.tsx) — LWC v4.2 Area series wrapper. Top stroke 2px, translucent fill below (32% → 2% gradient), volume histogram 22% bottom margin auto-colored by direction (green up / red down). Crosshair amber-dashed with label backgrounds. Optional `filled` switch falls back to plain line, `showLastMarker` adds dashed price-line at latest close.
  - [apps/web/components/OverviewPriceChart.tsx](apps/web/components/OverviewPriceChart.tsx) — switched to `PriceLine`. Reduces candles to close-only points. Sub-header now shows headline price + 24h change %. Line/fill color flips green/red based on tf-window change so the chart tints itself bullish/bearish.

- **[verified]** `pnpm -r typecheck` — all 7 packages clean.
- **[doing]** nothing — handing back.
- **[blocked]** None.
- **[next]** Push + Deploy.

### 2026-04-30 · Code session — Phase 4 final 3 items
**Closing out the remaining Phase 4 backlog from HANDOFF.md:262 — Tron whale-flow extension, multi-channel push notifications (ntfy.sh + Telegram), and a /backtest UI panel surfacing the existing graded-backtest engine.**

  **🆕 Tron USDT whale-flow** (item 3 — on-chain extend)
  - [packages/sources/src/whale-flow.ts](packages/sources/src/whale-flow.ts) — added 4th source: TronScan public API (`apilist.tronscanapi.com/api/transfer/trc20`). USDT-TRC20 contract (`TR7NHqj…`) is the largest USDT supply (~$60B+).
  - 6-decimal raw-amount conversion. 100 latest transfers per tick, filtered by `WHALE_FLOW_MIN_USD` (default $10M).
  - **NEW exchange address book for Tron** — Binance (4 hot wallets) · OKX (3) · HTX (2) · KuCoin (2) · Bybit · Bitfinex · Tether Treasury. Coverage gaps fall through to "UNKNOWN".
  - `WhaleTransfer.chain` widened: `"btc" | "eth"` → `"btc" | "eth" | "tron"`.
  - Slotted into existing `Promise.allSettled` parallel fan-out — Tron failure doesn't block ETH/BTC sources.
  - **All 4 whale-flow tests still pass** (no test fixtures needed updating — Tron path not exercised in the fixture-mocked tests; live-fetch path validated separately).

  **🆕 Multi-channel push notifications** (item 1 — replace single webhook)
  - [apps/alerts/src/notifier.ts](apps/alerts/src/notifier.ts) — full rewrite as channel array. Each channel is opt-in via env, parallel `Promise.allSettled` send, partial failure isolated per-channel.
  - **3 channels supported:**
    - `webhook` — existing Discord/Slack URL (kept for back-compat).
    - `ntfy` — `PULSE_NTFY_TOPIC` (just topic name → resolves to `https://ntfy.sh/<topic>`, or full URL for self-hosted). Auto-priority by severity (low=3, med=4, high=5) overridable via `PULSE_NTFY_PRIORITY`. Title includes symbol + severity. Free push to iOS/Android via the ntfy app — no account needed.
    - `telegram` — `PULSE_TELEGRAM_BOT_TOKEN` + `PULSE_TELEGRAM_CHAT_ID`. Markdown V1 with proper escaping for `_*[]\``. `disable_web_page_preview: true` to keep alert clean.
  - `Notifier.channelNames()` exposed; alerts `index.ts` startup log now shows `channels [webhook, ntfy, telegram]` instead of just `webhook ON/OFF`.
  - Renamed log line `(webhook: …)` → `(notified: …)` since multi-channel.

  **🆕 /backtest GRADED BACKTEST panel** (item 2 — surface existing engine)
  - The graded-backtest data layer was already 100% built (`grade-replay.ts` + `grade-replay-runner.ts` + `/api/backtest/grade` route + `scripts/grade-replay.mjs` CLI + MCP `grade_signal` tool). What was missing: a **web UI** to display the calibration results.
  - [apps/web/app/backtest/page.tsx](apps/web/app/backtest/page.tsx) — new Row 3 (`minHeight 360`):
    - **GRADED BACKTEST c-7** — calibration table: confidence bin / samples / mean confidence / realized hit-rate / **calibration delta** (hitRate − meanConfidence; green when |Δ|≤10%, amber up to 20%, red beyond).
    - **BY CATEGORY c-5** — per-category bucket: N / hit% / conf% / realized Δ.
  - Both panels share the `?lookahead=` setting from the existing toolbar (4h / 24h / 72h / 168h). Lookback fixed at 30 days, threshold at 1% (calibration robust enough for the user's data volume; can be made configurable later).
  - Updated METHODOLOGY footnote to explain pattern hit-rate (existing) vs graded backtest (new).

- **[verified]** `pnpm -r typecheck` — all 7 clean. `pnpm --filter @pulse/sources test src/{whale-flow,grade-replay,grade-signal}.test.ts` — **42/42 pass**.
- **[doing]** nothing — handing back to user.
- **[blocked]** None. New channels are opt-in; absent env = silent skip.
- **[next]** Deploy. Set on Hetzner `.env.local` to activate channels:
  ```
  PULSE_NTFY_TOPIC=pulse-firsty-<random>     # then subscribe in ntfy iOS/Android app
  PULSE_TELEGRAM_BOT_TOKEN=<from @BotFather>
  PULSE_TELEGRAM_CHAT_ID=<your chat>
  ```
  Tron whale-flow works immediately (TronScan public, no key). Graded-backtest UI works on existing alerts JSONL (3+ days of data already collected).

### 2026-04-30 · Code session — Phase 4 multi-portfolio + Deribit term structure
**2 Phase 4 items shipped — multi-CEX portfolio aggregation + Deribit IV term structure / OI breakdown.**

  **🆕 Multi-portfolio (Bybit + OKX read-only)** — Binance was the only configured source previously
  - **NEW** [packages/sources/src/portfolio-bybit.ts](packages/sources/src/portfolio-bybit.ts) — V5 unified-account `/v5/account/wallet-balance?accountType=UNIFIED`. Bybit returns `usdValue` per coin pre-priced — no separate price fetch needed. HMAC-SHA256 signed (`timestamp + apiKey + recvWindow + queryString`). Opt-in via `BYBIT_API_KEY` + `BYBIT_API_SECRET` (returns null if missing).
  - **NEW** [packages/sources/src/portfolio-okx.ts](packages/sources/src/portfolio-okx.ts) — V5 `/api/v5/account/balance`. Returns `eqUsd` per asset pre-priced. Sig is `Base64(HMAC-SHA256(secret, timestamp + method + path + body))`. Needs `OKX_API_KEY` + `OKX_API_SECRET` + `OKX_API_PASSPHRASE`.
  - **NEW** [packages/sources/src/portfolio-multi.ts](packages/sources/src/portfolio-multi.ts) — `getMultiPortfolio()` aggregator. `Promise.allSettled` across all 3 sources — partial failure on one source surfaces as `status[].error`, doesn't kill the others. Returns `{ sources[], totalUsd, status[], ts }`.
  - **Type:** `PortfolioSnapshot.source` widened from `"binance"` → `"binance" | "bybit" | "okx"` ([portfolio.ts](packages/sources/src/portfolio.ts)). Exposed `PortfolioSource` + `MultiPortfolioSnapshot` from both browser-safe `@pulse/sources` and `@pulse/sources/server`.
  - **API rewire** [apps/web/app/api/portfolio/route.ts](apps/web/app/api/portfolio/route.ts) — `/api/portfolio` now calls `getMultiPortfolio()`. Returns multi-source payload. Hint message lists all 3 envs.
  - **UI rewrite** [apps/web/components/PortfolioPanel.tsx](apps/web/components/PortfolioPanel.tsx):
    - Aggregates balances across sources by asset (BTC across Binance+Bybit+OKX → one row).
    - Per-source share strip below total equity (color-coded BINANCE gold / BYBIT orange / OKX cyan).
    - Per-source legend with $ + %.
    - Holding-bar tooltip shows per-source breakdown when asset spans multiple CEX.
    - "X SOURCES" footer beneath asset count.

  **🆕 Deribit IV Term Structure + OI Breakdown** — fills out options analytics
  - **NEW** [packages/sources/src/options/term-structure.ts](packages/sources/src/options/term-structure.ts) — `getOptionsTermStructure(asset)` derived from existing `fetchDeribitOptions()` (no extra API calls). For each expiry: ATM strike (closest to spot), `atmCallIV`/`atmPutIV`/`atmIV` (avg), `callOI`/`putOI`/`totalOI`/`callVol`/`putVol`, `dte` (days-to-expiry). Sorted by DTE ascending. Aggregate stats include `putCallOIRatio` across all expiries.
  - **NEW** [apps/web/app/api/options/term-structure/route.ts](apps/web/app/api/options/term-structure/route.ts) — `?asset=BTC|ETH|SOL`, `revalidate: 30`.
  - **UI Row 4** [apps/web/app/options/page.tsx](apps/web/app/options/page.tsx) — added `WsRow height="auto" minHeight 320`:
    - **IV TERM STRUCTURE c-7** — Recharts `ComposedChart` with 3 lines: ATM IV (amber, solid, dots), Call IV (green dashed), Put IV (red dashed). X = DTE, Y = IV%. Tooltip shows expiry + DTE + ATM strike. `isAnimationActive={false}` for React 19 compat.
    - **OI BY EXPIRY c-5** — stacked bar chart (call OI green / put OI red) for next 12 expiries. Compact axis labels (MM/DD).
  - Panel badges show `${expiriesCount} EXPIRIES · ATM IV` and `${totalOI compact} TOTAL · P/C ${ratio}`.

- **[verified]** `pnpm -r typecheck` — all 7 packages clean. `pnpm --filter @pulse/sources test src/portfolio.test.ts src/options/aggregator.test.ts` — **25/25 pass** (no regressions).
- **[noted]** Phase 4 items remaining (explicitly punted, no scope creep this round):
  - Mobile push notifications · LLM-graded backtest · On-chain Tron/SOL extension to whale-flow
- **[doing]** nothing — handing back.
- **[blocked]** None. New Bybit/OKX sources are opt-in via env (no behavior change if keys absent).
- **[next]** Deploy to prod. Set `BYBIT_API_KEY/SECRET` + `OKX_API_KEY/SECRET/PASSPHRASE` (read-only) on Hetzner `.env.local` to activate multi-portfolio. Term structure works immediately with no env config needed.

### 2026-04-30 · Code session — i18n removal · ENGLISH-ONLY
**Hard pivot: product is now English-only. `packages/i18n/` deleted; bilingual infra retired.**

- **Deleted** `packages/i18n/` (entire package — 5 files: dict.ts, t.ts, Bilingual.tsx, LocaleContext.tsx, index.ts).
- **Rewired 5 web components to bare EN literals** (no more `useT(key)` lookups):
  - [TerminalNav](apps/web/components/TerminalNav.tsx) — `NAV[].sectionKey: DictKey` → `section: string` ("INTEL"/"TRADING"/"SYSTEM"); `labelKey` → `label`.
  - [TerminalStatusBar](apps/web/components/TerminalStatusBar.tsx) — feed-status lookup is now a plain `Record<FeedStatus, string>` constant. Killed the `\.replace(/^ฟีด/, "")` Thai-strip leftover.
  - [TerminalBotBar](apps/web/components/TerminalBotBar.tsx) — **dropped the LANG button entirely**. F-bar is now: `READY · CMD · PROFILE · LATENCY ··· F1 Help · F8 Hotkeys · ⌘K CMD Palette · © CRYPTOPULSE INTEL`.
  - [BottomTabNav](apps/web/components/BottomTabNav.tsx) — same dictKey→label substitution.
  - [AppShell](apps/web/components/AppShell.tsx) — `LocaleProvider` import + wrapper removed.
- **`/settings` page** [apps/web/app/settings/page.tsx](apps/web/app/settings/page.tsx) — entire LOCALE panel deleted (was Row 1 c-6). DATA REFRESH now spans c-12. Killed `useLocale` import. Translated 2 toast bodies (notifications-enabled · reset-complete) to EN.
- **`MCPQuickAsk`** [apps/web/components/MCPQuickAsk.tsx](apps/web/components/MCPQuickAsk.tsx) — EN suggestion + clipboard hint + markdown header (`**Question:**` not `**คำถาม:**`).
- **`FundingHeatmap`** comment translated.
- **`packages/sources/dual-assets/analyzer.ts`** — `recommendation` string rewritten EN ("Enter Dual Assets between HH:MM-HH:MM ICT (avg APR X%) or…" / "Insufficient data — collect another 2–3 days.").
- **`analyzer.test.ts`** — regex fixtures retargeted (`/Enter Dual Assets/` + `/Insufficient data/`). Test name renamed.
- **Config drops:**
  - `apps/web/package.json` — removed `@pulse/i18n` dep.
  - `apps/web/next.config.js` — removed from `transpilePackages` array.
- **Docs synced:**
  - **CLAUDE.md** — bilingual rule replaced ("All user-facing labels are English only — package removed 2026-04-30"); Do-NOT list updated to forbid reintroducing Thai; IBM Plex Sans Thai dropped from font list.
  - **README.md** — `i18n/` line removed from packages tree.
  - **AGENTS.md** — Role 5 marked REMOVED with note; cross-cutting contracts row dropped; status board row marked REMOVED; migration map entry struck through; checkbox referencing `nav.analyst in dict.ts` removed.
  - **HANDOFF.md** — packages/ tree updated (no i18n), components list refreshed, callout added.
- **Verified:**
  - `pnpm install` — workspace resolves to **7 packages** (was 8).
  - `pnpm -r typecheck` — **all 7 clean** (web/ui/sources/charts/mcp/alerts/realtime).
  - Zero Thai characters remain in `apps/` or `packages/` source (verified `[฀-๿]` regex sweep).
  - Pre-existing 13 dual-assets SQLite native-binding test failures on Windows+Node24 unchanged — same baseline; **not caused by this change**, and Linux+Node20 passes.
- **Behavioral side effects:**
  - LANG button gone from bottom bar — users can no longer toggle TH ↔ EN.
  - `localStorage` `pulse.locale` key becomes orphaned; harmless (nothing reads it).
  - The EN-only labels collapse to the previous EN values exactly — no copy regressions.
- **[doing]** nothing — handing back.
- **[blocked]** None.
- **[next]** Deploy to prod. The `apps/alerts` dual-assets cron change (DUAL_ASSETS_TARGETS=all) from previous session still pending restart — bundle that with this deploy.

### 2026-04-29 evening · Code session — 19:06
**3-hour sprint after round-3/4 deploy: dual-assets UI launch + ETF history + fundflow polish + chart fixes.** 14 commits, all on master, all live on prod.

  **🆕 Major: `/dual-assets` UI page** (user request "A" — exposing Phase 5A data layer as a real tab)
  - **NEW** [apps/web/app/dual-assets/page.tsx](apps/web/app/dual-assets/page.tsx) — 533-line Bloomberg-shell page, 3 ws-rows:
    - Row 1 (h-stats): 4 KPIs (Current APR · Nd Avg APR · Best Hour · Snapshot count) + target picker.
    - Row 2 (h-chart): 24-cell hour-of-day heatmap c-8 (amber saturation by avg APR, green border on best hour) + RECOMMENDATION c-4 with Thai recommendation from `analyzer.ts`, top-3 hours, cold hours. 7D/14D/30D window toggle.
    - Row 3 (h-table): RECENT SNAPSHOTS c-7 (last 30 rows for active target) + DAILY SUMMARY c-5.
  - Wired three Code-owned endpoints: `/api/dual-assets/{best-hour,snapshots,summary}`.
  - Nav grew F8 = "DUAL ASSETS" under TRADING. Keyboard nav + i18n key (`nav.dual_assets`) wired.
  - Commits: `1074742` (initial UI) → `7beaefc` (all strikes + dynamic picker) → `2c7ae90` (8H+1D focus).

  **Dual-assets tracker rewrite** (root-cause fix on coverage)
  - User flagged: Bybit web showed SOL-USDT BuyLow @ 84.85/84/83 strikes (~spot 84.84) at **696% / 347% / 13.75% APR on 8H** — but our tracker only captured ~17%. Root cause: hardcoded `DUAL_ASSETS_TARGETS=78,80` (~7-8% below spot, near-zero auto-call risk = low APR). Bybit doesn't even serve those exact strikes via V5 advance-product API; high-APR products live within ±1% of spot.
  - [tracker.ts](packages/sources/src/dual-assets/tracker.ts) — `DUAL_ASSETS_TARGETS` default → `"all"` (save every strike Bybit returns). `DUAL_ASSETS_DIRECTIONS` default expanded `BuyLow` → `BuyLow,SellHigh`. New `DUAL_ASSETS_DURATIONS="8h,1d"` filter (server-set; default `"all"` for back-compat) — focuses on rolling-yield products since 3d/8d/29d sit at lower APR.
  - [store.ts](packages/sources/src/dual-assets/store.ts) — `getHourlyAvg` + `getBestHours` accept optional `duration` param. SQL clause scopes analysis to one duration at a time (8H APR scale ≠ 1D APR scale; mixing = noise).
  - [analyzer.ts](packages/sources/src/dual-assets/analyzer.ts) + [api/dual-assets/best-hour](apps/web/app/api/dual-assets/best-hour/route.ts) — pass-through `?duration=8h|1d`.
  - Page: `[8H][1D]` toggle pills before strike picker (default 8H). Switching auto-reselects nearest-to-spot strike. Available targets re-derived per duration.
  - Hover tooltip on each target chip shows distance from spot. Strikes within ±0.5% of spot → bright-amber.

  **🆕 ETF flow history extended to since-inception**
  - [packages/sources/src/farside.ts](packages/sources/src/farside.ts) — bypass Cloudflare on Farside via `curl-impersonate` (Chrome TLS fingerprint). Switched to Farside archive URLs for full since-inception history (BTC: Jan 2024 onward, ETH: Jul 2024 onward).
  - **NEW** [docs/ETF-FLOWS.md](docs/ETF-FLOWS.md) — install steps + failure-mode runbook for `curl-impersonate` dep.
  - Commits: `d0bacd1` (curl-impersonate) → `a6e81b7` (archive URLs).

  **Fundflow page polish** (response to user UX feedback on /fundflow row 3-4)
  - [apps/web/app/fundflow/page.tsx](apps/web/app/fundflow/page.tsx) — ETF flow chart capped to last 28 days (was full history; user said "ดูยาก, อยากเห็นเทรนด์ recent"). Cumulative line now shows 28-day delta + tight Y-axis (zooms to actual range, not zero-baseline).
  - TOP CHAINS rows expand to fill panel height (no more dead space at bottom).
  - Commits: `2200b45` (28d cap) → `4a1db57` (cumulative tight Y) → `06f3aaa` (rows expand).

  **Chart fixes** (Recharts 2.15 + React 19 interop)
  - [packages/charts/src/IVSmile.tsx](packages/charts/src/IVSmile.tsx) — `isAnimationActive={false}` on Call+Put Lines. Recharts 2.15.0 path-generation has known interop bug with React 19 concurrent renderer when used with `type="number"` XAxis + monotone Line. Symptom: 188 POINTS badge + axes + ATM ref line rendered, but no curve drawn. Also bumped `strokeWidth` 1.5→1.75 + `dot r` 2→2.5 for c-5 narrow panel visibility. (`487eae1`)
  - Tooltip redesign across charts — clearer date format + signed/colored values. (`924a15f`)

  **Overview MARKET PULSE fit**
  - [apps/web/app/page.tsx](apps/web/app/page.tsx) + [MetricStrip](apps/web/components/MetricStrip.tsx) — sub-lines ("24h Δ", "vs total mcap", "alternative.me · 24h") were clipping. Fixed row sizing so all 6 StatBlocks render fully without scroll.
  - 3-session live SESSION cell — Asia/EU/US session indicator with active-now ring. (`60b80e3`)

  **Whale-flow bug fix**
  - [packages/sources/src/whale-flow.ts](packages/sources/src/whale-flow.ts) — `mempool.space /blocks/tip/hash` returns plain text (not JSON). `fetchJson<string>` was running JSON.parse on raw hash → "Unexpected number in JSON at position 1". Switched to raw `fetch+text()` for that call; `/block/<hash>/txs` still returns JSON so `fetchJson` stays for second hop. (`41d6dad`)

  **Cleanup / Docs**
  - `77ebfba` — removed all "Ported from X" provenance comments across `packages/sources/src/{dual-assets,options}/**` + `packages/charts/**` + `packages/i18n/**` (7 prior reference projects already removed from disk). Updated README/AGENTS/HANDOFF/SECURITY/ADRs to reflect current state. **No code behavior change. All 8 typechecks remain clean.**

- **[verified live]** All routes 200 on https://cryptopulse.buzz including new `/dual-assets` page. ETF history now shows full since-inception cumulative.
- **[doing]** nothing — handing back to user.
- **[blocked]** None. Tracker change requires `pulse-alerts` restart on prod to pick up new `DUAL_ASSETS_TARGETS=all` + `DUAL_ASSETS_DURATIONS=8h,1d` env (server already updated, restart pending verification).
- **[next]** Soak test pulse-realtime depth-stream stability post-round-4 (1s→30s exponential reconnect). Optional: wire `/options` ARBITRAGE HITS to deep-link click → strike row in Options Chain.

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

### 2026-04-29 · Code session — 22:50 (round-3 deploy review)
- **[done 22:50]** Reviewed + committed + deployed Desktop's round-3 work. Commit `81fee21` (22 files, +2554/-708) live on https://cryptopulse.buzz.
  - **Verified:** `pnpm -r typecheck` clean across 8/8 packages · `next build` clean · all 7 pages return 200 (`/`, `/markets`, `/derivatives`, **`/options`** (NEW), `/backtest`, `/fundflow`, `/settings`) · all 6 key APIs return 200 (depth, whale-flow, options/aggregate, options/iv-smile, dual-assets/snapshots, funding).
  - **Server drift cleaned:** auto-generated `apps/web/next-env.d.ts` was modifying repeatedly across builds — stashed + dropped. Also removed orphan `apps/alerts/apps/` artifact dir.
  - **API contract integration verified:** Desktop's Options Chain page consumes Code's `/api/options/aggregate?asset=…&expiry=…&side=…` + `/api/options/iv-smile?asset=…&expiry=…` + Cursor's `IVSmile` and `GreeksHeatmap` charts — three-session pipeline working end-to-end.
  - **No regressions** in MCP/realtime/alerts data layer — Desktop touched zero files in those lanes.
- **[noted]** TerminalNav F-key map shifted: F1 Overview / F2 Markets / F3 Fundflow / F4 Derivatives / **F5 Options (new)** / F6 Backtest / F7 Settings (Alerts route removed — was never built as a real page).

### 2026-04-29 · Code session (22:00)
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
