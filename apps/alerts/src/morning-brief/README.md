# Morning Brief — Telegram push (v2)

Daily ETF + macro regime brief sent to Telegram at **09:00 Asia/Bangkok**
(weekend brief drops ETF sections — see [Weekend mode](#weekend-mode)).
Lives inside `@pulse/alerts` and runs on the same pm2 worker as the anomaly
scanner. Pure cron — no inbound webhooks, no bot-command handling.

## What gets sent

A MarkdownV2 message with **5 fixed sections + LLM Action Candidates**, plus
an inline keyboard and a PNG sparkline chart attached as a separate `sendPhoto`
call.

```
📊 Pulse Morning Brief
2026-05-04 (Mon) 09:00 BKK

🎯 Macro Regime
🔴 Risk-Off (score -0.67)
BTC dom 57.0% rising; funding negative on 3/3 majors
BTC dom 57.0% · DXY 107.2

💰 BTC ETF Flow
24h: +$245.3M
Δ vs yesterday: +$145.3M
7d sum: +$1.20B
Cumulative: +$30.25B

🔷 ETH ETF Flow
24h: +$12.4M
Δ vs yesterday: +$7.4M
7d sum: +$65.0M
Cumulative: +$4.01B

📊 Funding Rate Cluster (8h)
BTC -0.012% · ETH -0.008% · SOL -0.005%
🔴 Lean: negative (BTC ann -13.1%)

⚠️ Today's Catalysts
• 19:30 BKK — US ISM Manufacturing PMI
• 21:00 BKK — Powell speech at Jackson Hole

🎯 Action Candidates
• Funding harvest candidate: long spot, short perp (cluster lean negative).
• Mean-revert watch on ETH: 7d ETF flow +65.0M despite Risk-Off regime.
• Reduce leverage before 19:30 BKK — US ISM Manufacturing PMI.
Risk: catalyst clustering may compress reversal windows.

⏱ Sources: Farside · Binance · Yahoo · 2026-05-04 02:00Z
```

[ 📊 Open Dashboard ]
[ 🔇 Snooze tomorrow ] [ 📈 BTC chart ]

→ Followed by a 600×300 PNG: BTC ETF cumulative flow over the last 30 days,
dark theme matching the dashboard (`#04050a` bg, `#7c5cff` line).

### Weekend mode

On BKK Saturday/Sunday the brief still fires at 09:00 but renders a slightly
different shape: the BTC and ETH ETF flow blocks are replaced by one
⏸ *ETF Status* line ("US markets closed for the weekend — flows resume Mon.
Last reported \<Fri-date\>: BTC ±$X · ETH ±$Y."). All other sections (Macro
Regime, Funding Rate Cluster, Today's Catalysts, Action Candidates) render
exactly as on weekdays. The image chart is skipped on weekends.

Snooze interaction note for v3: a `snooze_1` callback ("snooze tomorrow")
fired from a Friday brief should mute Saturday's brief; the v3 persistence
should treat "next brief" not "next weekday brief".

### v2 explicit drops

The following sections are **NOT** in the brief (per user decision in
`.coordinator/telegram-morning-brief-v2.md`):

- ❌ Portfolio P&L (privacy concern in Telegram)
- ❌ Whale moves
- ❌ Open Interest delta
- ❌ Top news stories
- ❌ Stablecoin flows / social sentiment

## Setup

1. **Create the bot.** Open Telegram, talk to [@BotFather](https://t.me/BotFather):
   - `/newbot`
   - Pick a display name + a unique username ending in `bot`
   - Copy the HTTP API token (looks like `123456789:ABCdef-...`)

2. **Start a chat.** Send `/start` to your new bot from the account that should
   receive briefs. (The bot can't message a user who hasn't initiated chat.)

3. **Find your chat id.** Visit
   `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser. Look for
   `"chat":{"id":<NUMBER>,...}`. Personal chats are positive ints; group/channel
   ids are negative.

4. **Add envs** (in `.env.local` or pm2 ecosystem env block):

   ```dotenv
   TELEGRAM_BOT_TOKEN=123456789:ABCdef-...
   TELEGRAM_CHAT_ID=987654321

   # Optional — LLM for action candidates (rules fallback if unset).
   # See "Action candidates" section below for the 6-provider table.
   LLM_PROVIDER=groq
   LLM_API_KEY=gsk_...

   # Optional — inline keyboard "Open Dashboard" target
   PULSE_DASHBOARD_URL=https://your-dashboard.example/morning
   ```

5. **Restart alerts:** `pm2 restart pulse-alerts`. Look for in `logs/alerts.out.log`:

   ```
   [alerts] morning brief armed — 09:00 BKK daily, hub http://127.0.0.1:8081, dashboard http://localhost:3000/morning
   ```

## How it works

A `setInterval` ticks every 60s inside `apps/alerts/src/index.ts`. When BKK
hour == 09 and it hasn't fired yet today, it calls `runMorningBrief()`, which:

1. Detects Sat/Sun in BKK and switches to **weekend mode** (drops the BTC/ETH
   ETF blocks, replaces them with a single ⏸ ETF Status line; everything else
   renders). US holidays still skip — see [Deferred](#deferred).
2. **Parallel fan-out** of three reads:
   - `getETFFlows()` (in-process via `@pulse/sources/server`)
   - `${PULSE_HUB_URL}/regime` (HTTP to the realtime hub)
   - Funding rates for BTC/ETH/SOL on Binance (in-process)
3. Weekday only: skips if ETF data is `_isProxy=true` (Farside fallback) or
   empty. On weekend these conditions just yield `etf=null` and the brief
   still ships.
4. Loads today's catalysts from `catalysts.json` (BKK-keyed).
5. Calls `generateActionCandidates()` — LLM (Haiku 4.5) with rules fallback.
6. Formats as MarkdownV2.
7. `sendMessage` with text + inline keyboard.
8. Generates SVG sparkline → PNG → `sendPhoto` (best-effort; text already sent).

### Action candidates — LLM (provider configurable) + rules fallback

`action-candidates.ts` routes through `llm/` which dispatches to one of 6
providers based on env. Output is cached in-memory keyed by `(BKK date +
regime)` — multiple ticks the same morning don't re-spend tokens.

| `LLM_PROVIDER`  | Free tier?       | Default model               | Get key                      |
|-----------------|------------------|-----------------------------|------------------------------|
| `none` (default)| n/a (rules only) | —                           | —                            |
| `anthropic`     | no               | `claude-haiku-4-5-20251001` | https://console.anthropic.com |
| `openai`        | no               | `gpt-4o-mini`               | https://platform.openai.com  |
| `groq`          | yes (14.4k/day)  | `llama-3.3-70b-versatile`   | https://console.groq.com     |
| `openrouter`    | varies           | `openai/gpt-4o-mini`        | https://openrouter.ai/keys   |
| `gemini`        | yes (15 RPM)     | `gemini-2.5-flash`          | https://aistudio.google.com  |
| `deepseek`      | no (paid, very cheap) | `deepseek-chat`        | https://platform.deepseek.com/api_keys |

Cost for the daily brief is negligible on all paid providers (~$0.0001 –
$0.001/day). Groq is the easiest free pick — generous quota, fast inference,
no card required.

#### Example .env snippets

```dotenv
# Groq (free tier, recommended starting point)
LLM_PROVIDER=groq
LLM_API_KEY=gsk_...your-key-here

# Google Gemini (free tier, lower RPM)
LLM_PROVIDER=gemini
LLM_API_KEY=AIza...your-key-here

# Anthropic Claude Haiku
LLM_PROVIDER=anthropic
LLM_API_KEY=sk-ant-api03-...

# OpenAI
LLM_PROVIDER=openai
LLM_API_KEY=sk-proj-...

# OpenRouter (model marketplace; pick any model id)
LLM_PROVIDER=openrouter
LLM_MODEL=anthropic/claude-3.5-sonnet
LLM_API_KEY=sk-or-v1-...

# DeepSeek (cheap paid; default deepseek-chat = V3, swap LLM_MODEL=deepseek-reasoner for R1)
LLM_PROVIDER=deepseek
LLM_API_KEY=sk-...

# Disable explicitly (rules fallback always)
LLM_PROVIDER=none
```

> **Backward compat:** if `LLM_PROVIDER` is unset but `ANTHROPIC_API_KEY` is
> present, the daemon still works as before (`provider=anthropic`, key picked
> up from the legacy var). A one-line deprecation warn fires on first call —
> migrate to `LLM_PROVIDER=anthropic` + `LLM_API_KEY=...` to silence it.

If the provider is `none` or any error occurs (missing key, HTTP non-2xx,
malformed body, timeout, SDK throw), `callLLM` returns `null` and
`generateActionCandidates` falls back to rules:

| Trigger                                                | Suggestion                                         |
|--------------------------------------------------------|----------------------------------------------------|
| funding cluster `negative` AND regime `Risk-Off`       | Funding harvest candidate: long spot, short perp   |
| ETH 7d ETF flow > 0 AND regime `Risk-Off`              | Mean-revert watch on ETH                           |
| any catalyst within 6 hours (BKK clock)                | Reduce leverage before \<event\>                   |
| (default — no rules trigger)                           | No clear setup — observe                           |

Rules fallback always appends `Risk: rules-based fallback (LLM unavailable). …`
so the recipient knows it's not the LLM output.

**Adding a new provider:** drop a `llm/<name>.ts` file mirroring `gemini.ts`
or `openai-compat.ts`, add a switch case in `llm/index.ts`, and append a
default model + free-tier note to the table above. No other code touches.

### Inline keyboard

After `sendMessage`, the message gets attached buttons:

| Button              | Type            | Target                                                   |
|---------------------|-----------------|----------------------------------------------------------|
| 📊 Open Dashboard   | URL             | `PULSE_DASHBOARD_URL` (default `http://localhost:3000/morning`) |
| 🔇 Snooze tomorrow  | callback_data   | `snooze_1` — handled by stub in v2                       |
| 📈 BTC chart        | callback_data   | `chart_btc` — handled by stub in v2                      |

The callback handler (`handleTelegramCallback`) currently **logs only**. Wire
it to a real action in v3 by:

1. Adding a webhook endpoint in `apps/web` (e.g. `/api/telegram/callback`).
2. Calling `setWebhook` once on the bot to register that URL.
3. Forwarding the `callback_query.data` to `handleTelegramCallback()` and
   replacing the `console.log` with the real dispatcher (snooze persistence
   to disk, chart re-render via your chart endpoint, etc.).

### Image chart

`chart.ts:buildBtcPriceChartSvg` builds a deterministic SVG (snapshottable in
tests) for the BTC/USD price over the last 7 days (1h candles, 168 closes
fetched from Binance spot). Converted to PNG via `@resvg/resvg-js` (small
native dep, no headless browser). 1280×320, dark theme. Stroke + filled
gradient area are tinted **green** when the 7d change is ≥0 and **red**
when negative; the last close + signed pct are rendered top-right.

The chart renders **7 days/week** (BTC trades 24/7); the previous "weekend:
no chart" suppression is gone. Klines fetch is best-effort: 4 Binance hosts
tried in order with a 5s per-host timeout; on full failure the brief text
still sends with `imageSent: false` and `imageError: "no klines"`.

If resvg fails to load (native binding issue, missing prebuilt for your
arch), the message still sends — `sent: true` with `imageSent: false` and
`imageError` populated for diagnostics.

The legacy `buildBtcEtfSparklineSvg` ETF cumulative-flow chart is kept in
`chart.ts` (marked `@deprecated`) for one-line revert if needed.

## catalysts.json maintenance

Hand-curated file at `apps/alerts/src/morning-brief/catalysts.json`,
date-keyed by BKK calendar (`YYYY-MM-DD`). Update **weekly** (e.g. Sundays)
from a free upstream calendar:

- https://www.investing.com/economic-calendar/ — filter by High importance
- https://www.forexfactory.com/calendar — alt source

Format: each value is an array of strings; each string should start with
`HH:MM BKK — short description` so the rules fallback's "within 6h" detection
can parse the time. Empty array means "no catalysts today" and the section
renders `No major catalysts scheduled`. Missing date keys behave the same
(empty array).

## Test locally

```bash
# Run all morning-brief tests (63 cases, ~1s)
pnpm -F @pulse/alerts test

# Render a sample message (text only) without sending
node --import tsx -e "
  import { formatMorningBrief } from './apps/alerts/src/morning-brief/format.ts';
  import { generateActionCandidates, clearActionCandidatesCache } from './apps/alerts/src/morning-brief/action-candidates.ts';
  // build fixtures and call formatMorningBrief({...}); see format.test.ts for shape
"

# Force-fire end-to-end with real envs (sends to your bot)
node --import tsx -e "
  import { runMorningBrief } from './apps/alerts/src/morning-brief/index.ts';
  const r = await runMorningBrief({
    now: Date.now(),
    hubBase: process.env.PULSE_HUB_URL ?? 'http://127.0.0.1:8081',
    telegramToken: process.env.TELEGRAM_BOT_TOKEN,
    chatId: process.env.TELEGRAM_CHAT_ID,
    dashboardUrl: process.env.PULSE_DASHBOARD_URL,
  });
  console.log(r);
"
```

Or override the fire-time check by editing `apps/alerts/src/index.ts` and
swapping `hour === 9` to `hour === <current BKK hour>` momentarily — restart
pm2, watch a brief land, then revert.

## Disable

Unset `TELEGRAM_BOT_TOKEN` (or leave it empty) and restart. The cron isn't
even registered when the env is missing — zero overhead.

## Deferred

| Feature                          | Status     | Notes                                                                |
|----------------------------------|------------|----------------------------------------------------------------------|
| Weekend skip                     | won't do   | **Reversed 2026-05-02** — weekend now sends with mode="weekend" (drops ETF blocks). See [Weekend mode](#weekend-mode). |
| US holiday calendar (NYSE)       | v3         | Brief currently fires on Memorial Day / July 4 with $0 ETF flows     |
| Live economic-calendar API       | v3         | `catalysts.json` hand-edited weekly is enough for now                |
| Snooze persistence               | v3         | Callback handler is log-only; needs disk/SQLite + skip check in cron |
| Chart re-render on demand        | v3         | `chart_btc` callback is log-only; wire to chart endpoint             |
| Multi-channel broadcast          | v3         | One `chat_id` only; group ids work but require bot-in-group          |
| Localization (Thai/English)      | won't do   | English-only per CLAUDE.md (project pivot 2026-04-30)                |

## Env var reference

| Var                  | Default                        | Required | Purpose                                  |
|----------------------|--------------------------------|----------|------------------------------------------|
| `TELEGRAM_BOT_TOKEN` | —                              | ✅       | BotFather HTTP API token                 |
| `TELEGRAM_CHAT_ID`   | —                              | ✅       | destination chat id                      |
| `LLM_PROVIDER`       | `none`                         | optional | `none`/`anthropic`/`openai`/`groq`/`openrouter`/`gemini` |
| `LLM_MODEL`          | (per-provider default)         | optional | override the provider's default model    |
| `LLM_API_KEY`        | —                              | optional | required when `LLM_PROVIDER` ≠ `none`    |
| `LLM_TIMEOUT_MS`     | `15000`                        | optional | per-call abort timeout                   |
| `ANTHROPIC_API_KEY`  | —                              | legacy   | back-compat shim for v1 (warns on use)   |
| `PULSE_HUB_URL`      | `http://127.0.0.1:8081`        | optional | hub `/regime` lookup                     |
| `PULSE_DASHBOARD_URL`| `http://localhost:3000/morning`| optional | inline-keyboard "Open Dashboard" target  |

> Coordinator doc references `HUB_BASE`; we use `PULSE_HUB_URL` for parity
> with the rest of the repo (web `/api/health`, pm2 ecosystem all read this name).

`PULSE_TELEGRAM_BOT_TOKEN` / `PULSE_TELEGRAM_CHAT_ID` are a **separate**
channel used by the anomaly scanner (`apps/alerts/src/notifier.ts`). Set
them to the same values if you want one bot for both streams, or use
distinct bots/chats to keep alerts and morning briefs partitioned.
