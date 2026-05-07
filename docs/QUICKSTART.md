# Pulse Terminal — Quickstart

Step-by-step from a fresh machine to a running terminal + MCP setup. ~15 minutes if everything goes smoothly.

## 0 · Prerequisites

| Tool | Version | Why |
|------|---------|-----|
| Node.js | 24.15.0 recommended here; >=20.9.0 required | Next 16, better-sqlite3, and all Node services |
| pnpm | 9.x | workspace package manager |
| git | any | git init + version control |
| Claude Desktop | latest | MCP client (only needed for AI tab) |

Check:
```bash
node -v        # >= 20.9.0; .nvmrc and .node-version target 24.15.0
pnpm -v        # >= 9.0.0
git --version
```

Install pnpm if missing:
```bash
npm install -g pnpm
```

If your shell reports Node 18, switch before installing dependencies. Node 18
will fail `next build` and can load the wrong `better-sqlite3` native binary.

---

## 1 · Get the code

If from a git remote:
```bash
git clone <your-repo-url> pulse-terminal
cd pulse-terminal
```

If from a local copy (current setup):
```bash
cd C:/dev/pulse-terminal
```

---

## 2 · Install dependencies

```bash
pnpm install
```

This installs across all 4 apps + 4 packages via the workspace. Takes 1-3 minutes first time.

> **Windows note:** if you see `EBUSY` errors related to native binaries (`better-sqlite3`, `lightweight-charts`), close VS Code/Cursor and retry — antivirus sometimes locks the binaries during install.

---

## 3 · Configure environment

```bash
cp .env.example .env.local
```

The defaults work out of the box for **dashboards + MCP tools that use free APIs**. You only need to fill in keys for:
- **Portfolio tab** → `BINANCE_API_KEY` + `BINANCE_API_SECRET` (read-only — see [SECURITY.md](../SECURITY.md))
- **Webhook alerts** → `ALERT_WEBHOOK_URL` (Discord/Slack-compatible)

Open `.env.local` and skim the comments — every var is documented inline.

---

## 4 · First run (development)

```bash
pnpm dev
```

Turbo boots `apps/web` (port 3000) + `apps/realtime` (port 8080 WS, 8081 HTTP) concurrently.
It does **not** start `apps/alerts`, so local development will not accidentally
send Telegram/webhook messages. Use `pnpm dev:alerts` for alerts only, or
`pnpm dev:all` when you intentionally want web + realtime + alerts together.

Open http://localhost:3000 — you should see the Overview tab with live data within ~3 seconds.

If something fails: check `pulse:status` (after Phase C) or look at terminal output for the failing service.

### Verify each piece
- Overview → MetricStrip shows live BTC dominance, F&G, etc.
- Markets → top 20 coins load with sparklines, click a row → candlestick appears
- Fundflow → 4 panels load (stablecoin, ETF, derivatives, TVL/DEX)
- Derivatives → live funding ticks appear within 90 seconds
- Backtest → "no data yet" until alerts cron has run for a few hours
- Morning → Signal Feed is live; Overnight Digest, Macro Regime, and Action Items are placeholders until the digest/regime generator is wired

---

## 5 · Wire up MCP (Claude Desktop)

This is the **primary** way you'll use the AI features.

```bash
pnpm --filter @pulse/mcp build
pnpm --filter @pulse/mcp pack-dxt
```

Output: `apps/mcp/dist/pulse-terminal.dxt` (or similar).

**Install in Claude Desktop:**
1. Open Claude Desktop → Settings → Developer → MCP Servers
2. Click **Install from file** → pick the `.dxt`
3. Restart Claude Desktop
4. Open a new chat → type `/mcp` → you should see `pulse-terminal` listed with 19 tools

**Test it:**
> "ใช้ get_market_overview ดูภาพรวมตลาดให้หน่อย"

Claude should call the tool and report current BTC dominance, total mcap, F&G, etc.

---

## 6 · Production: keep it running 24/7 (pm2)

Optional but recommended — without this, alerts stop when you close your terminal.

```bash
npm install -g pm2

# Build the Next production bundle; realtime/alerts run via tsx under pm2
pnpm pulse:build

# Start under pm2
pnpm pulse:start

# Tell pm2 to remember this process list
pm2 save

# Generate auto-start command for your OS — pm2 prints what to run
pm2 startup
# Copy/paste the printed command (sudo on Linux/mac, Administrator on Win)
```

Verify it's running:
```bash
pnpm pulse:status
```

You should see:
- `pulse-web` · online
- `pulse-realtime` · online
- `pulse-alerts` · online
- web `/api/health` · healthy
- realtime `/health` · healthy with `snapshotAgeSec` < 120

Now reboot your machine — services should come back up automatically.

---

## 7 · Day-to-day commands

```bash
pnpm pulse:status         # health overview
pnpm pulse:smoke          # production endpoint smoke test
pnpm pulse:logs           # tail all logs (Ctrl-C to exit)
pnpm pulse:restart        # restart everything (after env changes)
pnpm pulse:stop           # stop everything

pm2 logs pulse-alerts     # tail just one service
pm2 monit                 # interactive resource monitor
pm2 flush                 # truncate logs (do weekly)
```

---

## 8 · When something goes wrong

### Port already in use
Another process is on 3000/8080/8081. Kill it or change the port in `.env.local`.

### "ANTHROPIC_API_KEY missing"
You don't need it — Pulse Terminal is MCP-first. If a UI says this, something is calling the legacy `/api/analyze` route which should have been removed in Phase A. Check `apps/web/app/api/` — `analyze/` shouldn't exist.

### Hub not responding (`/health` returns ECONNREFUSED on :8081)
- Check `pulse:status` — `pulse-realtime` should be online
- Check `pm2 logs pulse-realtime` — look for crash reason
- Common cause: `WS_PORT` and `HUB_HTTP_PORT` collide with another service

### MCP tools take 3+ seconds each
That means MCP isn't talking to the local hub. Check:
- `PULSE_HUB_URL` is set in `apps/web/.env.local`
- `apps/realtime` is running and reachable at `http://127.0.0.1:8081`
- MCP server's tool source — should `fetch(PULSE_HUB_URL + ...)` first, fallback to direct adapter only if hub down

### `pnpm dev` fails with TypeScript error in `@pulse/sources`
Run `pnpm typecheck` to see all errors at once. Most likely cause: `index.ts` (browser-safe) accidentally re-exports something from `server.ts` (server-only).

---

## 9 · Where to go next

- [README.md](../README.md) — project overview + tabs map
- [AGENTS.md](../AGENTS.md) — work delegation, current phase, contracts
- [SECURITY.md](../SECURITY.md) — keys, locks, incident response
- [docs/RUNBOOK.md](./RUNBOOK.md) — deploy, rollback, env changes, smoke checks
- [SYNC.md](../SYNC.md) — cross-session sync template (if running multiple Claude sessions)
- [docs/ADR-001-mcp-first.md](./ADR-001-mcp-first.md) — why MCP-first, not API-first
- [packages/sources/README.md](../packages/sources/README.md) — public API: browser-safe vs server-only entry points
