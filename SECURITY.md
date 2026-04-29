# SECURITY

> Pulse Terminal is a **personal tool** running on the user's own machine. The threat model below assumes single-user, no public exposure. Reusing the codebase for SaaS or shared deployment requires a different model — see "If exposing publicly" at the bottom.

## What's worth protecting

| Asset | Where it lives | Worst case if leaked |
|-------|----------------|----------------------|
| Binance API key + secret | `.env.local` (gitignored) · pm2 process env | Account drained — even read-only keys reveal balances + trade history |
| Anthropic API key (if `/api/analyze` re-enabled) | `.env.local` | Costs run up to your card |
| Coinglass API key | `.env.local` | Vendor cuts you off, no direct $$ loss |
| Alerts JSONL log | `apps/alerts/data/alerts.jsonl` | Reveals what symbols/strategies you watch — privacy, not security |
| pm2 logs | `./logs/*.log` | May echo signed URLs or query params from API calls |

## Hard rules

### 1. Binance keys MUST be read-only
In Binance API Management, when creating the key:
- ✅ **Enable Reading**
- ❌ **Disable Enable Spot & Margin Trading**
- ❌ **Disable Enable Futures**
- ❌ **Disable Enable Withdrawals**
- ✅ **Restrict access to trusted IPs only** (your machine's public IP)

Even with all the above, treat the key like a password.

### 2. Localhost binds only — never `0.0.0.0`
Hub HTTP cache (`apps/realtime` port 8081) and Next.js dev server (`apps/web` port 3000) **must bind to `127.0.0.1`**. If they bind to `0.0.0.0` and you're on coffee-shop WiFi, anyone on the network can:
- Hit `/api/portfolio` and read your Binance balance
- Hit `/snapshot` and see all your tracked symbols
- Pretend to be the hub and feed your MCP fake signals

Verify after Phase B v0:
```bash
ss -tlnp | grep -E ':(3000|8080|8081)'
# All three should show 127.0.0.1, not 0.0.0.0 or *
```

### 3. Never commit `.env.local`
Already covered by `.gitignore`, but double-check before any `git push`:
```bash
git diff --cached --name-only | grep -E '\.env(\..+)?$'  # should be empty
```

### 4. Reference projects (historical)
The seven prior projects that were ported into this monorepo have been removed from disk. If you ever restore one from a backup, audit it for stale keys before working on it:

```bash
grep -r "API_KEY\|API_SECRET\|sk-ant-" <restored-folder>/ 2>/dev/null
```
Rotate any matched keys (assume compromised).

## Soft rules

### Rotate Binance keys every 90 days
Calendar reminder. Old keys go straight to revoke list.

### Don't let pm2 logs grow unbounded
`pulse:start` writes to `./logs/*.log`. With ETF scrapes and JSON dumps, can hit 100MB in weeks.

```bash
# Add to your crontab or run weekly:
pm2 flush  # truncates all pm2-managed logs
```

### Don't share screenshots of `/portfolio` tab
Obvious but easy to forget — the table shows assets + USD valuations.

## Incident response

### Suspected Binance key leak
1. Binance API Management → click key → **Delete** (immediate)
2. Create new key with same restrictions
3. Update `.env.local` + `pm2 restart pulse-web pulse-realtime`
4. Check Binance trade history for the last 24h — confirm no unauthorized trades

### Suspected Anthropic key leak (if `/api/analyze` re-enabled)
1. Anthropic Console → Settings → API Keys → Revoke
2. Check usage tab for spike in past 24h
3. New key + update `.env.local` + restart

### Repo accidentally pushed to public GitHub with `.env.local`
1. **Rotate every key inside the file immediately** — assume scraped within minutes
2. `git filter-repo --invert-paths --path .env.local` to scrub history
3. Force-push (only acceptable usage)
4. Add a pre-push hook to prevent recurrence

## If exposing publicly

Don't, without rewriting:
- Add Bearer token check on every `/api/portfolio`, `/api/snapshot`, `/api/backtest`
- Rate-limit per-IP on every endpoint that calls external APIs (CoinGecko/DefiLlama free tier rate-limits aggregate, not per-caller)
- Move secrets out of `.env.local` to a vault (1Password CLI, AWS Secrets Manager, etc.)
- Audit `apps/realtime` HTTP server — currently NO auth, NO rate-limit
- Sign your MCP `.dxt` bundle so users know it's from you
